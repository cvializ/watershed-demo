import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import {
  createGpuWaterQuality,
  POLLUTANT_SPECIES,
  type PollutantSpeciesId,
} from "@/gpu/waterFlowSimulation/variables/createGpuWaterQuality.ts";

import { test } from "./clientTestUtils.ts";
import fixturePassthroughShader from "./fixture-passthrough.frag?raw";
import {
  channelTotals,
  simulateWaterQualityReference,
  type QualityInjectSource,
  type VelocityTexel,
} from "./waterQualityReferenceModel.ts";

/**
 * GPU tests for dissolved substance transport (`src/shaders/compute/water-quality.frag`).
 *
 * Mini-graph in the style of test-gpu-sediment-flow.ts: only the quality variable is real, while waterVelocity
 * and waterHeight are passthrough fixtures whose values the harness owns. A constant velocity field makes every
 * route in the grid exactly predictable, so whole-texture comparison against the CPU reference - rather than a
 * few spot checks - is what pins transport down.
 */
const WIDTH = 16;

// One world unit per texel: a source of radius 0.4 then covers exactly one cell, which keeps injection testable
// without reproducing the shader's falloff by hand. The shader only divides by uTerrainSize, so this differs from
// production geometry (12 units across 512 texels) in scale alone.
const TERRAIN_SIZE = 16;

// float32 headroom for a few dozen passes of multiply-add on values of order one.
const PARITY_TOLERANCE = 2e-6;
// Drift allowed on the sum of a channel with decay switched off. Measured round-off here is orders smaller, so
// anything this could hide would be a structural leak rather than arithmetic.
const CONSERVATION_TOLERANCE = 1e-5;

const FLOW_SPEED = 0.3; // water-velocity.frag emits unit direction * speed in roughly this range

// Uniform-array capacity in water-quality.frag, and thus the ceiling createGpuWaterQuality enforces.
const SOURCE_SLOTS = 8;

type ScalarField = (column: number, row: number) => number;

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

// Scenarios that actually finished. A throw inside a scenario skips its increment, so the final check is
// evidence of work rather than just a statement having executed.
let completedScenarios = 0;
const SCENARIO_COUNT = 9;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(256, 256);
document.body.appendChild(renderer.domElement);

/** Texel data in fixture order: index = (row * WIDTH + column) * 4. */
const channelData = (channels: readonly ScalarField[]): Float32Array => {
  const data = new Float32Array(WIDTH * WIDTH * 4);
  for (let row = 0; row < WIDTH; row++) {
    for (let column = 0; column < WIDTH; column++) {
      const texelIndex = (row * WIDTH + column) * 4;
      for (let channel = 0; channel < 4; channel++) {
        data[texelIndex + channel] = channels[channel](column, row);
      }
    }
  }
  return data;
};

const createTexture = (data: Float32Array): THREE.DataTexture => {
  const texture = new THREE.DataTexture(
    data,
    WIDTH,
    WIDTH,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  // Unflipped so fixture index equals texel index under readRenderTargetPixels, as in the sediment harness.
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
};

/** A variable that re-emits its own seeded value every pass: a boundary condition the harness owns. */
const addFixtureVariable = (
  gpuCompute: GPUComputationRenderer,
  name: "waterVelocity" | "waterHeight",
  data: Float32Array,
): Variable => {
  const variable = gpuCompute.addVariable(
    name,
    fixturePassthroughShader.replace(/__SAMPLER__/g, name),
    createTexture(data),
  );
  // The self-dependency is what makes GPUComputationRenderer inject the sampler this copy shader reads.
  gpuCompute.setVariableDependencies(variable, [variable]);
  return variable;
};

/** Per-pass coefficients a scenario runs on, written over the factory defaults. */
type Coefficients = {
  fluxFraction: number;
  dtScale: number;
  decayRate: number;
};

// Pure transport: no fade and one pass per step, so totals are exact and any movement came from routing alone.
const TRANSPORT_ONLY: Coefficients = {
  fluxFraction: 0.5,
  dtScale: 1.0,
  decayRate: 0.0,
};

/**
 * Build one scenario's graph: faked flow underneath, the real quality variable on top.
 *
 * @param velocityX - East component of the fixture velocity field
 * @param velocityY - North component of the fixture velocity field
 * @param seedMass - Initial mass per channel, index 0 nitrogen .. 3 bacteria
 * @param coefficients - Per-pass coefficients the shader and the reference both run on
 */
const createGraph = (
  velocityX: ScalarField,
  velocityY: ScalarField,
  seedMass: readonly ScalarField[],
  coefficients: Coefficients = TRANSPORT_ONLY,
) => {
  const gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);

  // rg carries the (direction * speed) pair water-velocity.frag would have written; b keeps the magnitude so a
  // fixture reads at a glance, and the quality shader ignores it.
  const waterVelocityVariable = addFixtureVariable(
    gpuCompute,
    "waterVelocity",
    channelData([
      velocityX,
      velocityY,
      (column, row) =>
        Math.hypot(velocityX(column, row), velocityY(column, row)),
      () => 1.0,
    ]),
  );
  const waterHeightVariable = addFixtureVariable(
    gpuCompute,
    "waterHeight",
    channelData([() => 0.5, () => 0.0, () => 0.0, () => 1.0]),
  );

  const quality = createGpuWaterQuality(
    gpuCompute,
    WIDTH,
    TERRAIN_SIZE,
    waterVelocityVariable,
    waterHeightVariable,
    createTexture(channelData(seedMass)),
  );
  quality.initWaterQuality();

  // Override after init and before the first pass: these uniforms are what a scenario's coefficients mean.
  const uniforms = quality.getWaterQualityUniforms();
  uniforms.fluxFraction.value = coefficients.fluxFraction;
  uniforms.decayRate.value = coefficients.decayRate;
  // dtScale is written every pass by updateWaterQuality from the frame time, so scenarios choose it there.

  const initError = gpuCompute.init();
  assert(initError === null, `gpuCompute.init() failed: ${String(initError)}`);

  return { gpuCompute, ...quality };
};

type Graph = ReturnType<typeof createGraph>;

/** Commit passes at a nominal frame rate; dtScale follows from it the way it does in production (S6). */
const computePasses = (
  graph: Graph,
  passes: number,
  secondsPerFrame = 1 / 60,
): void => {
  for (let pass = 0; pass < passes; pass++) {
    graph.updateWaterQuality(secondsPerFrame);
    graph.gpuCompute.compute();
  }
};

/** Read a committed texture back in fixture order. */
const readPixels = (graph: Graph, variable: Variable): Float32Array => {
  const pixels = new Float32Array(WIDTH * WIDTH * 4);
  renderer.readRenderTargetPixels(
    graph.gpuCompute.getCurrentRenderTarget(variable),
    0,
    0,
    WIDTH,
    WIDTH,
    pixels,
  );
  return pixels;
};

const texelIndex = (column: number, row: number): number =>
  row * WIDTH + column;

/** The fixture velocity field in reference-model order, so parity compares the same routes. */
const velocityField = (
  velocityX: ScalarField,
  velocityY: ScalarField,
): VelocityTexel[] =>
  Array.from({ length: WIDTH * WIDTH }, (_value, index) => {
    const column = index % WIDTH;
    const row = Math.floor(index / WIDTH);
    return [velocityX(column, row), velocityY(column, row)] as const;
  });

/**
 * A source aimed at one texel's centre. The shader maps a texel to world space as
 * (uv.x * size, (1 - uv.y) * size), and this is that mapping inverted.
 */
const sourceAtTexelCentre = (
  column: number,
  row: number,
  species: PollutantSpeciesId,
  amount: number,
): QualityInjectSource => ({
  x: column + 0.5,
  y: TERRAIN_SIZE - (row + 0.5),
  radius: 0.4, // under half a cell at this scale, so exactly one texel falls inside
  amount,
  species,
});

const zero = (): number => 0;
const nothing = [zero, zero, zero, zero];

/** The channel layout is load-bearing in three files and in saved data; guard the count before anything else. */
await test("four substance channels are declared", () => {
  assert(
    POLLUTANT_SPECIES.length === 4,
    `POLLUTANT_SPECIES holds ${String(POLLUTANT_SPECIES.length)} species; water-quality.frag packs four`,
  );

  completedScenarios += 1;
});

// ---------------------------------------------------------------------------
// Transport follows the route the velocity field announced
// ---------------------------------------------------------------------------

await test("transport matches the CPU reference", async () => {
  // East everywhere: every cell's route is the canonical East step, so the whole grid is predictable.
  const seedNitrogen: ScalarField = (column, row) =>
    column === 4 && row === 8 ? 1.0 : 0.0;
  const graph = createGraph(() => FLOW_SPEED, zero, [
    seedNitrogen,
    zero,
    zero,
    zero,
  ]);

  const passes = 30;
  computePasses(graph, passes);

  const gpuMass = readPixels(graph, graph.waterQualityVariable);
  const cpuMass = simulateWaterQualityReference(
    channelData([seedNitrogen, zero, zero, zero]),
    velocityField(() => FLOW_SPEED, zero),
    WIDTH,
    TERRAIN_SIZE,
    passes,
    TRANSPORT_ONLY,
  );

  let worstDifference = 0;
  for (let index = 0; index < gpuMass.length; index++) {
    worstDifference = Math.max(
      worstDifference,
      Math.abs(gpuMass[index] - cpuMass[index]),
    );
  }
  assert(
    worstDifference <= PARITY_TOLERANCE,
    `GPU and CPU disagree by ${String(worstDifference)} after ${String(passes)} passes`,
  );

  // Parity would also be satisfied by a shader that never moved anything, so require movement as well: the front
  // advances about one cell per pass, so thirty passes should have carried it several cells east of the seed.
  let furthestColumnWithMass = 4;
  for (let row = 0; row < WIDTH; row++) {
    for (let column = 5; column < WIDTH; column++) {
      if (gpuMass[texelIndex(column, row) * 4] > 1e-3) {
        furthestColumnWithMass = Math.max(furthestColumnWithMass, column);
      }
    }
  }
  assert(
    furthestColumnWithMass >= 8,
    `substance only reached column ${String(furthestColumnWithMass)} in ${String(passes)} passes`,
  );

  completedScenarios += 1;
});

await test("still water carries nothing", async () => {
  const seedOrganic: ScalarField = (column, row) =>
    column === 6 && row === 6 ? 0.8 : 0.0;
  const graph = createGraph(zero, zero, [zero, seedOrganic, zero, zero]);

  computePasses(graph, 20);

  const gpuMass = readPixels(graph, graph.waterQualityVariable);
  assert(
    Math.abs(gpuMass[texelIndex(6, 6) * 4 + 1] - 0.8) <= PARITY_TOLERANCE,
    `a stationary cell lost mass: ${String(gpuMass[texelIndex(6, 6) * 4 + 1])}`,
  );

  completedScenarios += 1;

  const organicTotal = channelTotals(gpuMass)[1];
  assert(
    Math.abs(organicTotal - 0.8) <= CONSERVATION_TOLERANCE,
    `organic matter spread without a current: total ${String(organicTotal)}`,
  );
});

// ---------------------------------------------------------------------------
// Conservation, including where the grid ends
// ---------------------------------------------------------------------------

await test("transport conserves mass, border included", async () => {
  // A current that runs off the east edge on every row: the last column cannot export, so it has to accumulate
  // rather than leak. Border retention is what keeps these totals honest.
  // Every channel starts with mass in it: a conservation check over an empty channel would prove nothing.
  const seedMass: ScalarField[] = [
    (column, row) => (row % 2 === 0 && column % 3 === 0 ? 1.0 : 0.0),
    () => 0.05,
    (_column, row) => (row === 3 ? 0.7 : 0.0),
    (column) => (column === 0 ? 0.6 : 0.01),
  ];
  const graph = createGraph(() => FLOW_SPEED, zero, seedMass);

  const initial = channelTotals(readPixels(graph, graph.waterQualityVariable));

  computePasses(graph, 45);

  const gpuMass = readPixels(graph, graph.waterQualityVariable);
  const after = channelTotals(gpuMass);
  for (let channel = 0; channel < 4; channel++) {
    assert(
      Math.abs(after[channel] - initial[channel]) <= CONSERVATION_TOLERANCE,
      `channel ${String(channel)} moved from ${String(initial[channel])} to ${String(after[channel])}`,
    );
    assert(after[channel] > 0, `channel ${String(channel)} ended up empty`);
  }

  // And the mass has to pile up against that eastern border rather than sit where it started.
  let edgeMass = 0;
  for (let row = 0; row < WIDTH; row++) {
    edgeMass += gpuMass[texelIndex(WIDTH - 1, row) * 4];
  }
  assert(
    edgeMass > 1.0,
    `the eastern border only holds ${String(edgeMass)} after 45 passes`,
  );

  completedScenarios += 1;
});

await test("dtScale stress stays inside its clamps", async () => {
  // fluxFraction * dtScale and decayRate * dtScale both exceed their ceilings here, so a shader that forgot to
  // clamp would go negative or explode rather than merely run faster.
  const coefficients: Coefficients = {
    fluxFraction: 0.9,
    dtScale: 2.0, // two frames' worth of work in one pass
    decayRate: 0.9,
  };
  const seedBacteria: ScalarField = () => 0.4;
  const graph = createGraph(
    () => FLOW_SPEED,
    zero,
    [zero, zero, zero, seedBacteria],
    coefficients,
  );

  computePasses(graph, 10, 2 / 60); // updateWaterQuality turns this into dtScale 2

  const gpuMass = readPixels(graph, graph.waterQualityVariable);
  const cpuMass = simulateWaterQualityReference(
    channelData([zero, zero, zero, seedBacteria]),
    velocityField(() => FLOW_SPEED, zero),
    WIDTH,
    TERRAIN_SIZE,
    10,
    coefficients,
  );

  let worstDifference = 0;
  let lowestValue = Number.POSITIVE_INFINITY;
  for (let index = 0; index < gpuMass.length; index++) {
    worstDifference = Math.max(
      worstDifference,
      Math.abs(gpuMass[index] - cpuMass[index]),
    );
    lowestValue = Math.min(lowestValue, gpuMass[index]);
  }
  assert(
    worstDifference <= PARITY_TOLERANCE,
    `clamped step disagrees with the reference by ${String(worstDifference)}`,
  );
  assert(
    lowestValue >= 0.0,
    `a missing clamp produced negative mass: ${String(lowestValue)}`,
  );

  completedScenarios += 1;
});

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

await test("a source feeds only its own channel", async () => {
  // No current and no decay, so whatever a source releases stays exactly where it landed.
  const graph = createGraph(zero, zero, nothing);
  const oxygenSource = sourceAtTexelCentre(3, 10, 2, 0.2);
  assert(
    graph.addPollutantSource(
      oxygenSource.x,
      oxygenSource.y,
      oxygenSource.radius,
      oxygenSource.amount,
      oxygenSource.species,
    ),
    "addPollutantSource rejected the first source",
  );

  computePasses(graph, 5);

  const gpuMass = readPixels(graph, graph.waterQualityVariable);
  assert(
    gpuMass[texelIndex(3, 10) * 4 + 2] > 0.1,
    `oxygen never arrived: ${String(gpuMass[texelIndex(3, 10) * 4 + 2])}`,
  );

  const totals = channelTotals(gpuMass);
  for (const otherChannel of [0, 1, 3]) {
    assert(
      Math.abs(totals[otherChannel]) <= PARITY_TOLERANCE,
      `species 2 leaked ${String(totals[otherChannel])} into channel ${String(otherChannel)}`,
    );
  }

  completedScenarios += 1;
});

await test("clearPollutantSources stops release", async () => {
  const graph = createGraph(zero, zero, nothing);
  graph.addPollutantSource(8.5, TERRAIN_SIZE - 8.5, 0.4, 0.2, 0);

  computePasses(graph, 3);
  graph.clearPollutantSources();
  const afterClear = channelTotals(
    readPixels(graph, graph.waterQualityVariable),
  );

  computePasses(graph, 6);
  const later = channelTotals(readPixels(graph, graph.waterQualityVariable));

  assert(afterClear[0] > 0, "the source never released anything to clear");
  for (let channel = 0; channel < 4; channel++) {
    assert(
      Math.abs(later[channel] - afterClear[channel]) <= CONSERVATION_TOLERANCE,
      `channel ${String(channel)} kept growing after the sources were cleared`,
    );
  }

  completedScenarios += 1;
});

await test("a full source list is refused rather than silently dropped", async () => {
  const graph = createGraph(zero, zero, nothing);
  let acceptedCount = 0;
  for (let slot = 0; slot < SOURCE_SLOTS * 2; slot++) {
    if (graph.addPollutantSource(1.5, TERRAIN_SIZE - 1.5, 0.4, 0.1, 3)) {
      acceptedCount += 1;
    }
  }

  assert(
    acceptedCount === SOURCE_SLOTS,
    `accepted ${String(acceptedCount)} sources; the shader's uniform arrays hold ${String(SOURCE_SLOTS)}`,
  );

  completedScenarios += 1;
});

// ---------------------------------------------------------------------------
// Parity under injection and decay, so both sides have to move together
// ---------------------------------------------------------------------------

await test("injection matches the CPU reference", async () => {
  const coefficients: Coefficients = {
    fluxFraction: 0.5,
    dtScale: 1.0,
    decayRate: 0.02,
  };
  // A pond at the east edge: transport ends there, so downstream mass has somewhere to collect.
  const stillPondFromColumn = 12;
  const velocityX: ScalarField = (column) =>
    column < stillPondFromColumn ? FLOW_SPEED : 0.0;
  const graph = createGraph(velocityX, zero, nothing, coefficients);

  const sources: QualityInjectSource[] = [
    sourceAtTexelCentre(4, 4, 0, 0.15),
    sourceAtTexelCentre(9, 11, 3, 0.08),
  ];
  for (const source of sources) {
    graph.addPollutantSource(
      source.x,
      source.y,
      source.radius,
      source.amount,
      source.species,
    );
  }

  const passes = 25;
  computePasses(graph, passes);

  const gpuMass = readPixels(graph, graph.waterQualityVariable);
  const cpuMass = simulateWaterQualityReference(
    channelData(nothing),
    velocityField(velocityX, zero),
    WIDTH,
    TERRAIN_SIZE,
    passes,
    coefficients,
    sources,
  );

  let worstDifference = 0;
  for (let index = 0; index < gpuMass.length; index++) {
    worstDifference = Math.max(
      worstDifference,
      Math.abs(gpuMass[index] - cpuMass[index]),
    );
  }
  assert(
    worstDifference <= PARITY_TOLERANCE,
    `injection disagrees with the reference by ${String(worstDifference)}`,
  );

  // The pond must have caught something: mass that cannot leave has to collect downstream of a source.
  let pondMass = 0;
  for (let row = 0; row < WIDTH; row++) {
    for (let column = stillPondFromColumn; column < WIDTH; column++) {
      pondMass += gpuMass[texelIndex(column, row) * 4];
    }
  }
  assert(
    pondMass > 0.5,
    `the pond only collected ${String(pondMass)} nitrogen`,
  );

  completedScenarios += 1;
});

// Announce completion for the playwright wrapper: reaching this line with the expected count means no invariant
// was violated along the way.
assert(
  completedScenarios === SCENARIO_COUNT,
  `only ${String(completedScenarios)} of ${String(SCENARIO_COUNT)} water quality scenarios completed`,
);
document.body.dataset.waterQualityTestsComplete = String(completedScenarios);
