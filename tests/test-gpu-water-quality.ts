import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import { createGpuTerrainQuality } from "@/gpu/waterFlowSimulation/variables/createGpuTerrainQuality.ts";
import {
  createGpuWaterQuality,
  POLLUTANT_SPECIES,
  type PollutantSpeciesId,
} from "@/gpu/waterFlowSimulation/variables/createGpuWaterQuality.ts";
import { SUBSTANCE_EXCHANGE_RATES } from "@/gpu/waterFlowSimulation/variables/substanceExchange.ts";

import { test } from "./clientTestUtils.ts";
import fixturePassthroughShader from "./fixture-passthrough.frag?raw";
import {
  channelTotals,
  simulateWaterQualityReference,
  totalBacteria,
  totalOrganicMatter,
  WET_DEPTH,
  type OrganicDepositSource,
  type QualityInjectSource,
  type SubstanceFields,
  type VelocityTexel,
} from "./waterQualityReferenceModel.ts";

/**
 * GPU tests for dissolved substance transport (`src/shaders/compute/water-quality.frag`) and the ground
 * compartment that exchanges bacterial content with it (`src/shaders/compute/terrain-quality.frag`).
 *
 * Mini-graph in the style of test-gpu-sediment-flow.ts: both quality variables are real and depend on each other,
 * while waterVelocity and waterHeight are passthrough fixtures whose values the harness owns - including depth,
 * which is what decides whether dissolved oxygen survives a cell and whether the two compartments may trade at
 * all. A constant velocity field makes every route in the grid exactly predictable, so whole-texture comparison
 * against the CPU reference - rather than a few spot checks - is what pins transport down.
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

// Depth fixtures against the shaders' WET_DEPTH of 0.01: a hundred times over it, or none at all. Intermediate
// depths would make these scenarios about interpolation rather than about which compartment a substance belongs to.
const STANDING_WATER = 1.0;
const DRY_GROUND = 0.0;

// Uniform-array capacity in water-quality.frag, and thus the ceiling createGpuWaterQuality enforces.
const SOURCE_SLOTS = 8;

// The terrain shader's deposit array holds the same eight, which is the ceiling createGpuTerrainQuality enforces.
const DEPOSIT_SLOTS = 8;

type ScalarField = (column: number, row: number) => number;

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

// Scenarios that actually finished. A throw inside a scenario skips its increment, so the final check is
// evidence of work rather than just a statement having executed.
let completedScenarios = 0;
const SCENARIO_COUNT = 20;

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

/** Per-pass coefficients a scenario runs on, written over the factory defaults of both variables. */
type Coefficients = {
  fluxFraction: number;
  dtScale: number;
  decayRate: number;
  soilAttachRate: number;
  washOffRate: number;
  organicWashOffRate: number;
  soilDecayRate: number;
  organicDecayRate: number;
};

// Pure transport: no fade, no exchange and one pass per step, so totals are exact and any movement came from
// routing alone. Scenarios that care about the compartments override what they need.
const TRANSPORT_ONLY: Coefficients = {
  fluxFraction: 0.5,
  dtScale: 1.0,
  decayRate: 0.0,
  soilAttachRate: 0.0,
  washOffRate: 0.0,
  organicWashOffRate: 0.0,
  soilDecayRate: 0.0,
  organicDecayRate: 0.0,
};

const coefficientsFor = (overrides: Partial<Coefficients>): Coefficients => ({
  ...TRANSPORT_ONLY,
  ...overrides,
});

// The rates production runs on, so a scenario about the trade can use the real one instead of inventing numbers
// that would then quietly disagree with SUBSTANCE_EXCHANGE_RATES.
const EXCHANGE = {
  soilAttachRate: SUBSTANCE_EXCHANGE_RATES.soilAttachRate,
  washOffRate: SUBSTANCE_EXCHANGE_RATES.washOffRate,
  organicWashOffRate: SUBSTANCE_EXCHANGE_RATES.organicWashOffRate,
};

/**
 * Build one scenario's graph: faked flow underneath, both real substance variables on top.
 *
 * @param velocityX - East component of the fixture velocity field
 * @param velocityY - North component of the fixture velocity field
 * @param seedMass - Initial water-column mass per channel, index 0 nitrogen .. 3 bacteria
 * @param coefficients - Per-pass coefficients both shaders and the reference run on
 * @param options.depth - Committed water depth, which gates oxygen and the bacterial exchange (default standing)
 * @param options.seedGround - Initial ground compartments; only index 0 is read (bacteria in the soil)
 */
const createGraph = (
  velocityX: ScalarField,
  velocityY: ScalarField,
  seedMass: readonly ScalarField[],
  coefficients: Coefficients = TRANSPORT_ONLY,
  options: { depth?: ScalarField; seedGround?: readonly ScalarField[] } = {},
) => {
  const gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);

  // rg carries the (direction * speed) pair water-velocity.frag would have written; b keeps the magnitude so a
  // fixture reads at a glance, and the quality shaders ignore it.
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
  const depth = options.depth ?? (() => STANDING_WATER);
  const waterHeightVariable = addFixtureVariable(
    gpuCompute,
    "waterHeight",
    channelData([depth, zero, zero, () => 1.0]),
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

  const groundSeed = options.seedGround ?? nothing;
  const terrain = createTerrainGraph(
    gpuCompute,
    waterHeightVariable,
    quality,
    groundSeed,
  );

  // Override after init and before the first pass: these uniforms are what a scenario's coefficients mean.
  const uniforms = quality.getWaterQualityUniforms();
  uniforms.fluxFraction.value = coefficients.fluxFraction;
  uniforms.decayRate.value = coefficients.decayRate;
  uniforms.soilAttachRate.value = coefficients.soilAttachRate;
  uniforms.washOffRate.value = coefficients.washOffRate;
  uniforms.organicWashOffRate.value = coefficients.organicWashOffRate;

  const terrainUniforms = terrain.getTerrainQualityUniforms();
  terrainUniforms.soilDecayRate.value = coefficients.soilDecayRate;
  terrainUniforms.organicDecayRate.value = coefficients.organicDecayRate;
  terrainUniforms.soilAttachRate.value = coefficients.soilAttachRate;
  terrainUniforms.washOffRate.value = coefficients.washOffRate;
  terrainUniforms.organicWashOffRate.value = coefficients.organicWashOffRate;

  const initError = gpuCompute.init();
  assert(initError === null, `gpuCompute.init() failed: ${String(initError)}`);

  return { gpuCompute, ...quality, ...terrain };
};

/**
 * The ground variable plus the back-edge that lets the water column read it. Split out so the ordering rule is in
 * one place: both Variables must exist before either dependency list can name the other, and the link has to be
 * made before gpuCompute.init() declares the samplers (src/gpu/README.md, section 1).
 */
const createTerrainGraph = (
  gpuCompute: GPUComputationRenderer,
  waterHeightVariable: Variable,
  quality: ReturnType<typeof createGpuWaterQuality>,
  seedGround: readonly ScalarField[],
) => {
  const terrain = createGpuTerrainQuality(
    gpuCompute,
    WIDTH,
    TERRAIN_SIZE, // world edge: what an organic deposit is placed against, so both sides need the same one
    waterHeightVariable,
    quality.waterQualityVariable,
    createTexture(channelData(seedGround)),
  );
  terrain.initTerrainQuality();

  // The water column's side of the dependency, which only its own factory can add (plan S2: each variable declares
  // what it reads).
  quality.linkWaterQualityToTerrain(terrain.terrainQualityVariable);

  return terrain;
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
    graph.updateTerrainQuality(secondsPerFrame);
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

/** Both committed compartments of a running graph, in the shape the reference model returns. */
const readFields = (graph: Graph): SubstanceFields => ({
  waterMass: readPixels(graph, graph.waterQualityVariable),
  groundMass: readPixels(graph, graph.terrainQualityVariable),
});

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

/** The fixture depth field in reference-model order, which is what oxygen and exchange are read against. */
const depthField = (depth: ScalarField): number[] =>
  Array.from({ length: WIDTH * WIDTH }, (_value, index) =>
    depth(index % WIDTH, Math.floor(index / WIDTH)),
  );

/** Largest per-channel disagreement between a committed texture and the model's answer for it. */
const worstDifference = (
  gpuPixels: Float32Array,
  cpuPixels: Float32Array,
): number => {
  let worst = 0;
  for (let index = 0; index < gpuPixels.length; index++) {
    worst = Math.max(worst, Math.abs(gpuPixels[index] - cpuPixels[index]));
  }
  return worst;
};

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

/**
 * A load of organic matter dropped on one texel's centre - the deposit equivalent of `sourceAtTexelCentre`, and
 * deliberately the same geometry so a pat and a spring land on the cell they were aimed at.
 */
const depositAtTexelCentre = (
  column: number,
  row: number,
  amount: number,
): OrganicDepositSource => ({
  x: column + 0.5,
  y: TERRAIN_SIZE - (row + 0.5),
  radius: 0.4, // under half a cell at this scale, so exactly one texel falls inside
  amount,
});

const zero = (): number => 0;
const nothing = [zero, zero, zero, zero];

/** Mass on one cell only, which is how these scenarios follow a single parcel. */
const atCell =
  (column: number, row: number, value: number): ScalarField =>
  (testColumn, testRow) =>
    testColumn === column && testRow === row ? value : 0;

/** Which compartments each species claims, as the shaders were told to treat them. */
const compartmentsOf = (speciesId: PollutantSpeciesId): string[] => {
  const species = POLLUTANT_SPECIES.find((option) => option.id === speciesId);
  return species === undefined ? [] : [...species.compartments];
};

/**
 * The channel layout is load-bearing in three files and in saved data, and the compartments say which shader owns
 * which substance: oxygen belongs to the water alone, bacteria to both. Guard both before anything else.
 */
await test("four substance channels declare their compartments", () => {
  assert(
    POLLUTANT_SPECIES.length === 4,
    `POLLUTANT_SPECIES holds ${String(POLLUTANT_SPECIES.length)} species; water-quality.frag packs four`,
  );

  // Nitrogen and dissolved oxygen belong to the water alone; organic matter and bacteria are the two species with a
  // home on the land as well. The order of this list is the channel layout, so it doubles as the guard on that.
  const expectedCompartments = [
    "water",
    "terrain,water",
    "water",
    "terrain,water",
  ] as const;
  for (const speciesId of [0, 1, 2, 3] as const) {
    assert(
      compartmentsOf(speciesId).sort().join() ===
        expectedCompartments[speciesId],
      `species ${String(speciesId)} claims ${compartmentsOf(speciesId).join()}; expected ${expectedCompartments[speciesId]}`,
    );
  }

  // The two rules the rest of this file tests: oxygen cannot live in the ground, and the species that do live in both
  // have a terrain channel each - R for bacteria, G for organic matter.
  assert(
    compartmentsOf(2).join() === "water",
    "dissolved oxygen claims a ground compartment; water-quality.frag lets it dry out with the film",
  );

  completedScenarios += 1;
});

// ---------------------------------------------------------------------------
// Transport follows the route the velocity field announced
// ---------------------------------------------------------------------------

await test("transport matches the CPU reference", async () => {
  // East everywhere: every cell's route is the canonical East step, so the whole grid is predictable.
  const seedNitrogen = atCell(4, 8, 1.0);
  const graph = createGraph(() => FLOW_SPEED, zero, [
    seedNitrogen,
    zero,
    zero,
    zero,
  ]);

  const passes = 30;
  computePasses(graph, passes);

  const gpuMass = readPixels(graph, graph.waterQualityVariable);
  const cpuFields = simulateWaterQualityReference(
    {
      waterMass: channelData([seedNitrogen, zero, zero, zero]),
      groundMass: channelData(nothing),
    },
    depthField(() => STANDING_WATER),
    velocityField(() => FLOW_SPEED, zero),
    WIDTH,
    TERRAIN_SIZE,
    passes,
    TRANSPORT_ONLY,
  );

  assert(
    worstDifference(gpuMass, cpuFields.waterMass) <= PARITY_TOLERANCE,
    `GPU and CPU disagree by ${String(worstDifference(gpuMass, cpuFields.waterMass))} after ${String(passes)} passes`,
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
  const seedOrganic = atCell(6, 6, 0.8);
  const graph = createGraph(zero, zero, [zero, seedOrganic, zero, zero]);

  computePasses(graph, 20);

  const gpuMass = readPixels(graph, graph.waterQualityVariable);
  assert(
    Math.abs(gpuMass[texelIndex(6, 6) * 4 + 1] - 0.8) <= PARITY_TOLERANCE,
    `a stationary cell lost mass: ${String(gpuMass[texelIndex(6, 6) * 4 + 1])}`,
  );

  const organicTotal = channelTotals(gpuMass)[1];
  assert(
    Math.abs(organicTotal - 0.8) <= CONSERVATION_TOLERANCE,
    `organic matter spread without a current: total ${String(organicTotal)}`,
  );

  completedScenarios += 1;
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

  // And the mass has to pile up against that eastern border rather than sit where it started. This is the residue
  // of the three species that may dry out in place; dissolved oxygen is tested separately below, and does not
  // arrive here because this scenario's depth fixture keeps it dissolved.
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
  // fluxFraction * dtScale, decayRate * dtScale and both exchange rates all exceed their ceilings here, so a shader
  // that forgot to clamp would go negative or explode rather than merely run faster. The exchange ceiling matters
  // most: it is what stops the water column from handing over more bacteria than it has left after export and fade.
  const coefficients = coefficientsFor({
    fluxFraction: 0.9,
    dtScale: 2.0, // two frames' worth of work in one pass
    decayRate: 0.9,
    soilAttachRate: 0.5,
    washOffRate: 0.5,
    soilDecayRate: 0.9,
  });
  const seedBacteria: ScalarField = () => 0.4;
  const graph = createGraph(
    () => FLOW_SPEED,
    zero,
    [zero, zero, zero, seedBacteria],
    coefficients,
    { seedGround: [seedBacteria, zero, zero, zero] },
  );

  computePasses(graph, 10, 2 / 60); // updateWaterQuality turns this into dtScale 2

  const fields = readFields(graph);
  const cpuFields = simulateWaterQualityReference(
    {
      waterMass: channelData([zero, zero, zero, seedBacteria]),
      groundMass: channelData([seedBacteria, zero, zero, zero]),
    },
    depthField(() => STANDING_WATER),
    velocityField(() => FLOW_SPEED, zero),
    WIDTH,
    TERRAIN_SIZE,
    10,
    coefficients,
  );

  assert(
    worstDifference(fields.waterMass, cpuFields.waterMass) <= PARITY_TOLERANCE,
    `clamped step disagrees with the reference in water by ${String(worstDifference(fields.waterMass, cpuFields.waterMass))}`,
  );
  assert(
    worstDifference(fields.groundMass, cpuFields.groundMass) <=
      PARITY_TOLERANCE,
    `clamped step disagrees with the reference on the ground by ${String(worstDifference(fields.groundMass, cpuFields.groundMass))}`,
  );

  const lowestValue = [...fields.waterMass, ...fields.groundMass].reduce(
    (lowest, value) => Math.min(lowest, value),
    Number.POSITIVE_INFINITY,
  );
  assert(
    lowestValue >= 0.0,
    `a missing clamp produced negative mass: ${String(lowestValue)}`,
  );

  completedScenarios += 1;
});

// ---------------------------------------------------------------------------
// Dissolved oxygen belongs to the water and nowhere else
// ---------------------------------------------------------------------------

await test("oxygen dries out with the water it was dissolved in", async () => {
  // Dry ground, no current, no decay: nitrogen, organic matter and bacteria have nothing to do but sit where they
  // were put, so any of them vanishing would be the oxygen rule applied too broadly - and oxygen surviving would
  // be the terrain treating it as a deposit like the others.
  const dryLoad = atCell(6, 6, 0.4);
  const seedAllChannels: ScalarField[] = [dryLoad, dryLoad, dryLoad, dryLoad];
  const graph = createGraph(
    zero,
    zero,
    seedAllChannels,
    coefficientsFor(EXCHANGE),
    { depth: () => DRY_GROUND },
  );

  computePasses(graph, 20);

  const fields = readFields(graph);
  const seededTexel = texelIndex(6, 6) * 4;

  assert(
    fields.waterMass[seededTexel + 2] <= PARITY_TOLERANCE,
    `dry ground is still holding dissolved oxygen: ${String(fields.waterMass[seededTexel + 2])}`,
  );

  for (const channel of [0, 1, 3]) {
    assert(
      Math.abs(fields.waterMass[seededTexel + channel] - 0.4) <=
        PARITY_TOLERANCE,
      `channel ${String(channel)} dried out along with the oxygen: ${String(fields.waterMass[seededTexel + channel])}`,
    );
  }

  // And none of the water-borne load settled on its way past: a dry cell cannot trade in either direction, so the
  // ground under that parcel is as clean as it was when the scenario started.
  assert(
    Math.abs(fields.groundMass[seededTexel]) <= PARITY_TOLERANCE,
    `bacteria crossed the exchange on a dry bed: ${String(fields.groundMass[seededTexel])}`,
  );

  completedScenarios += 1;
});

await test("an oxygen source on dry ground releases nothing", async () => {
  // Two identical springs, one per species, on terrain with no water on it. Nitrogen lands because it is a property
  // of the ground as much as of anything else; dissolved oxygen does not, because there is no film to hold it.
  const graph = createGraph(zero, zero, nothing, coefficientsFor(EXCHANGE), {
    depth: () => DRY_GROUND,
  });

  for (const species of [0, 2] as const) {
    const source = sourceAtTexelCentre(3, 10, species, 0.2);
    assert(
      graph.addPollutantSource(
        source.x,
        source.y,
        source.radius,
        source.amount,
        source.species,
      ),
      `addPollutantSource rejected species ${String(species)}`,
    );
  }

  computePasses(graph, 5);

  const gpuMass = readPixels(graph, graph.waterQualityVariable);
  assert(
    gpuMass[texelIndex(3, 10) * 4] > 0.1,
    `a nitrogen source on dry ground released nothing: ${String(gpuMass[texelIndex(3, 10) * 4])}`,
  );
  assert(
    channelTotals(gpuMass)[2] <= PARITY_TOLERANCE,
    `an oxygen spring onto dry ground produced ${String(channelTotals(gpuMass)[2])} dissolved oxygen`,
  );

  completedScenarios += 1;
});

await test("oxygen stays while the water stands", async () => {
  // The same spring on standing water, so the scenario above cannot be explained by emitters being broken: with a
  // film under it, dissolved oxygen accumulates.
  const graph = createGraph(zero, zero, nothing);
  const source = sourceAtTexelCentre(3, 10, 2, 0.2);
  graph.addPollutantSource(
    source.x,
    source.y,
    source.radius,
    source.amount,
    source.species,
  );

  computePasses(graph, 5);

  const gpuMass = readPixels(graph, graph.waterQualityVariable);
  assert(
    gpuMass[texelIndex(3, 10) * 4 + 2] > 0.1,
    `oxygen never arrived over standing water: ${String(gpuMass[texelIndex(3, 10) * 4 + 2])}`,
  );

  // A source feeds only its own channel; the other three species have their own springs and their own tests.
  const totals = channelTotals(gpuMass);
  for (const otherChannel of [0, 1, 3]) {
    assert(
      Math.abs(totals[otherChannel]) <= PARITY_TOLERANCE,
      `species 2 leaked ${String(totals[otherChannel])} into channel ${String(otherChannel)}`,
    );
  }

  completedScenarios += 1;
});

await test("oxygen thins with a half-there film, on frame time", async () => {
  // The two scenarios above sit at the ends of the wetness ramp (0 and 1), where every sensible formula agrees.
  // This one sits in the middle, where the difference between oxygen obeying frame rate and ignoring it is enormous:
  // a film half as deep as WET_DEPTH leaves a survival fraction of 0.5 for one nominal pass, so a two-frame pass
  // must leave 0.5 squared - not 0.5 - which is plan S6 applied to a saturating quantity.
  const FILM_FRACTION = 0.5;
  const coefficients = coefficientsFor({ ...EXCHANGE, dtScale: 2 });
  const graph = createGraph(
    zero,
    zero,
    [atCell(4, 4, 0.8), zero, atCell(4, 4, 0.8), atCell(4, 4, 0.6)],
    coefficients,
    {
      depth: () => WET_DEPTH * FILM_FRACTION,
      seedGround: [atCell(4, 4, 0.3), zero, zero, zero],
    },
  );

  computePasses(graph, 1, 2 / 60); // updateWaterQuality turns this into dtScale 2

  const fields = readFields(graph);
  const seededTexel = texelIndex(4, 4) * 4;
  const expectedOxygen = 0.8 * Math.pow(FILM_FRACTION, coefficients.dtScale);
  assert(
    Math.abs(fields.waterMass[seededTexel + 2] - expectedOxygen) <=
      CONSERVATION_TOLERANCE,
    `a two-frame pass over a half-deep film left ${String(fields.waterMass[seededTexel + 2])} oxygen, expected ${String(expectedOxygen)}: the rule is not coupled to frame time`,
  );

  // Nitrogen and organic matter are unaffected by the same film, and bacteria only moved across the boundary - so a
  // blanket drying rule would fail here rather than silently passing on.
  assert(
    Math.abs(fields.waterMass[seededTexel] - 0.8) <= PARITY_TOLERANCE,
    `nitrogen thinned with the film: ${String(fields.waterMass[seededTexel])}`,
  );

  // Then let it run, and hold both compartments to the model over twelve more two-frame passes.
  computePasses(graph, 12, 2 / 60);
  const later = readFields(graph);
  const cpuFields = simulateWaterQualityReference(
    {
      waterMass: channelData([
        atCell(4, 4, 0.8),
        zero,
        atCell(4, 4, 0.8),
        atCell(4, 4, 0.6),
      ]),
      groundMass: channelData([atCell(4, 4, 0.3), zero, zero, zero]),
    },
    depthField(() => WET_DEPTH * FILM_FRACTION),
    velocityField(zero, zero),
    WIDTH,
    TERRAIN_SIZE,
    13,
    coefficients,
  );

  assert(
    worstDifference(later.waterMass, cpuFields.waterMass) <= PARITY_TOLERANCE,
    `a half-dry film disagrees with the reference by ${String(worstDifference(later.waterMass, cpuFields.waterMass))}`,
  );
  assert(
    worstDifference(later.groundMass, cpuFields.groundMass) <= PARITY_TOLERANCE,
    `the ground disagrees under a half-dry film by ${String(worstDifference(later.groundMass, cpuFields.groundMass))}`,
  );

  // And the pair still only moved: total bacteria are untouched by a wetness that scales both directions alike.
  assert(
    Math.abs(totalBacteria(later) - totalBacteria(fields)) <=
      CONSERVATION_TOLERANCE,
    `the transitional band minted or destroyed bacteria: ${String(totalBacteria(fields))} -> ${String(totalBacteria(later))}`,
  );

  completedScenarios += 1;
});

// ---------------------------------------------------------------------------
// Bacteria belongs to the water and to the ground at once
// ---------------------------------------------------------------------------

await test("bacteria settle out of standing water into the ground", async () => {
  // Still water with a bacterial load, exchange switched on and no die-off: everything that appears in the soil has
  // to have left the column, so the pair's total is the invariant and the two compartments are the evidence.
  const seedWaterBacteria = atCell(6, 6, 0.8);
  const coefficients = coefficientsFor(EXCHANGE);
  const graph = createGraph(
    zero,
    zero,
    [zero, zero, zero, seedWaterBacteria],
    coefficients,
  );

  const before = readFields(graph);
  computePasses(graph, 30);
  const after = readFields(graph);

  const seededTexel = texelIndex(6, 6) * 4;
  assert(
    after.groundMass[seededTexel] > 0.05,
    `nothing settled into the ground: ${String(after.groundMass[seededTexel])}`,
  );
  assert(
    after.waterMass[seededTexel + 3] < before.waterMass[seededTexel + 3],
    `the water column kept its whole load: ${String(after.waterMass[seededTexel + 3])}`,
  );

  const totalBefore = totalBacteria(before);
  const totalAfter = totalBacteria(after);
  assert(
    Math.abs(totalAfter - totalBefore) <= CONSERVATION_TOLERANCE,
    `the exchange minted or destroyed bacteria: ${String(totalBefore)} -> ${String(totalAfter)}`,
  );

  completedScenarios += 1;
});

await test("standing water picks bacteria back up off the ground", async () => {
  // The reverse leg, from a load that started in the soil: wash-off needs a film to carry them, so this is also the
  // proof that the exchange runs in both directions rather than being a one-way sink.
  const seedSoilBacteria = atCell(9, 4, 0.6);
  const coefficients = coefficientsFor(EXCHANGE);
  const graph = createGraph(zero, zero, nothing, coefficients, {
    seedGround: [seedSoilBacteria, zero, zero, zero],
  });

  const before = readFields(graph);
  computePasses(graph, 30);
  const after = readFields(graph);

  const seededTexel = texelIndex(9, 4) * 4;
  assert(
    after.waterMass[seededTexel + 3] > 0.02,
    `the ground never gave any bacteria back: ${String(after.waterMass[seededTexel + 3])}`,
  );

  const totalBefore = totalBacteria(before);
  const totalAfter = totalBacteria(after);
  assert(
    Math.abs(totalAfter - totalBefore) <= CONSERVATION_TOLERANCE,
    `wash-off did not conserve the pair: ${String(totalBefore)} -> ${String(totalAfter)}`,
  );

  completedScenarios += 1;
});

await test("dry ground holds what it was given", async () => {
  // The reason this compartment exists at all: contamination in the bed survives the water that brought it, and it
  // cannot leak out through a film that isn't there. Die-off is off here, so "unchanged" means exactly unchanged.
  const seedSoilBacteria = atCell(5, 12, 0.3);
  const graph = createGraph(zero, zero, nothing, coefficientsFor(EXCHANGE), {
    depth: () => DRY_GROUND,
    seedGround: [seedSoilBacteria, zero, zero, zero],
  });

  computePasses(graph, 20);

  const fields = readFields(graph);
  assert(
    Math.abs(fields.groundMass[texelIndex(5, 12) * 4] - 0.3) <=
      PARITY_TOLERANCE,
    `soil bacteria changed across a dry bed: ${String(fields.groundMass[texelIndex(5, 12) * 4])}`,
  );
  assert(
    channelTotals(fields.waterMass)[3] <= PARITY_TOLERANCE,
    `dry ground washed bacteria into water that isn't there: ${String(channelTotals(fields.waterMass)[3])}`,
  );

  completedScenarios += 1;
});

await test("settling and wash-off agree between the two shaders", async () => {
  // The exchange is one helper copied into both shaders, so a divergence would look like mass appearing or vanishing
  // at the boundary. Compare every texel's pair against the model over enough passes for both legs to matter:
  // bacteria start in the water on the wet half and in the soil on the dry half.
  const depth: ScalarField = (column) =>
    column < 8 ? STANDING_WATER : DRY_GROUND;
  const coefficients = coefficientsFor({ ...EXCHANGE, soilDecayRate: 0.01 });
  const seedWaterBacteria = (column: number): number =>
    column < 8 && column % 2 === 0 ? 0.5 : 0;
  const seedSoilBacteria = (column: number): number =>
    column >= 8 && column % 3 === 0 ? 0.4 : 0;

  const graph = createGraph(
    zero,
    zero,
    [zero, zero, zero, seedWaterBacteria],
    coefficients,
    { depth, seedGround: [seedSoilBacteria, zero, zero, zero] },
  );

  const passes = 40;
  computePasses(graph, passes);

  const fields = readFields(graph);
  const cpuFields = simulateWaterQualityReference(
    {
      waterMass: channelData([zero, zero, zero, seedWaterBacteria]),
      groundMass: channelData([seedSoilBacteria, zero, zero, zero]),
    },
    depthField(depth),
    velocityField(zero, zero),
    WIDTH,
    TERRAIN_SIZE,
    passes,
    coefficients,
  );

  assert(
    worstDifference(fields.waterMass, cpuFields.waterMass) <= PARITY_TOLERANCE,
    `the water column disagrees with the reference by ${String(worstDifference(fields.waterMass, cpuFields.waterMass))}`,
  );
  assert(
    worstDifference(fields.groundMass, cpuFields.groundMass) <=
      PARITY_TOLERANCE,
    `the ground disagrees with the reference by ${String(worstDifference(fields.groundMass, cpuFields.groundMass))} - the two copies of exchangeAt have drifted apart`,
  );

  completedScenarios += 1;
});

// ---------------------------------------------------------------------------
// Organic matter lies on the ground, and only ever leaves it with water
// ---------------------------------------------------------------------------

await test("a deposit stays on dry ground where it was dropped", async () => {
  // The path an animal's pat takes across a field that has no water on it: mass arrives in a cell that nothing
  // drains through, and can only leave when a film covers it. Decay is off here, so "unchanged" means unchanged,
  // and clearing the deposit proves the declaration was for one pass rather than a permanent spring.
  const graph = createGraph(zero, zero, nothing, coefficientsFor(EXCHANGE), {
    depth: () => DRY_GROUND,
  });

  assert(
    graph.addOrganicDeposit(depositAtTexelCentre(6, 6, 0.1)),
    "addOrganicDeposit refused a free slot",
  );
  computePasses(graph, 4);
  // Production clears deposits after every pass (createGpuWaterFlowSimulation.compute); this raw graph has to do it
  // by hand, and doing it here is what makes the second half of this scenario about persistence.
  graph.clearOrganicDeposits();

  const patTexel = texelIndex(6, 6) * 4;
  const fields = readFields(graph);
  assert(
    fields.groundMass[patTexel + 1] > 0.3,
    `four passes of a 0.1 deposit left only ${String(fields.groundMass[patTexel + 1])} on the ground`,
  );

  // The pat fills one texel at this scale, so its centre holds about four times the per-pass amount before anything
  // else happens to it - which is also why a deposit needs the disc's soft edge and not a hard one.
  assert(
    fields.groundMass[patTexel + 1] <= 0.5,
    `a dry pat accumulated ${String(fields.groundMass[patTexel + 1])} from four passes of 0.1`,
  );
  assert(
    channelTotals(fields.waterMass)[1] <= PARITY_TOLERANCE,
    `dry ground washed ${String(channelTotals(fields.waterMass)[1])} of organic matter into water that isn't there`,
  );

  computePasses(graph, 20);
  const later = readFields(graph);
  assert(
    Math.abs(
      later.groundMass[patTexel + 1] - fields.groundMass[patTexel + 1],
    ) <= PARITY_TOLERANCE,
    `the ground's organic matter moved on a dry bed, or the cleared deposit kept releasing: ${String(fields.groundMass[patTexel + 1])} -> ${String(later.groundMass[patTexel + 1])}`,
  );

  completedScenarios += 1;
});

await test("standing water scours organic matter off the ground", async () => {
  // The leg that makes a pat matter downstream: a film over the manure picks it up, and what the ground loses the
  // water gains - one number either side of the boundary, exactly like the bacterial wash-off.
  const graph = createGraph(zero, zero, nothing, coefficientsFor(EXCHANGE));

  assert(
    graph.addOrganicDeposit(depositAtTexelCentre(6, 6, 0.1)),
    "addOrganicDeposit refused a free slot",
  );
  computePasses(graph, 3);
  graph.clearOrganicDeposits(); // stop the loading so runoff is all that happens from here on

  const fields = readFields(graph);
  const totalBefore = totalOrganicMatter(fields);
  assert(
    totalBefore > 0.2,
    `the pat never loaded the ground: ${String(totalBefore)}`,
  );

  computePasses(graph, 30);
  const after = readFields(graph);
  const patTexel = texelIndex(6, 6) * 4;

  assert(
    after.waterMass[patTexel + 1] > 0.02,
    `the film never picked any organic matter up off the ground: ${String(after.waterMass[patTexel + 1])}`,
  );
  assert(
    Math.abs(totalOrganicMatter(after) - totalBefore) <= CONSERVATION_TOLERANCE,
    `runoff minted or destroyed organic matter: ${String(totalBefore)} -> ${String(totalOrganicMatter(after))}`,
  );

  completedScenarios += 1;
});

await test("organic matter never settles out of the flow into the ground", async () => {
  // The counter-leg to the two above. Bacteria do settle, so a scenario claiming organics don't has to prove the
  // settling mechanism is running in the same pass - and then show that litter did not follow it into the bed.
  const coefficients = coefficientsFor(EXCHANGE);
  const graph = createGraph(
    zero,
    zero,
    [zero, atCell(4, 4, 0.8), zero, atCell(4, 4, 0.5)],
    coefficients,
  );

  computePasses(graph, 30);
  const fields = readFields(graph);
  const seededTexel = texelIndex(4, 4) * 4;

  assert(
    fields.groundMass[seededTexel] > 0.02,
    `bacteria never settled, so this scenario cannot show organics don't: ${String(fields.groundMass[seededTexel])}`,
  );
  const groundOrganic = channelTotals(fields.groundMass)[1];
  assert(
    groundOrganic <= PARITY_TOLERANCE,
    `the flow banked ${String(groundOrganic)} of organic matter in the ground; nothing here scrapes the column`,
  );

  completedScenarios += 1;
});

await test("deposits match the CPU reference", async () => {
  // The deposit disc is a third copy of one falloff law (water-sources.frag, water-quality.frag's emissionAt and
  // terrain-quality.frag's depositAt), crossing into the film on the wet half of this grid and sitting in place on the
  // dry half. Whole-texture parity over both compartments is what pins that law - and its dtScale coupling - down.
  const depth: ScalarField = (column) =>
    column < 8 ? STANDING_WATER : DRY_GROUND;
  const coefficients = coefficientsFor({ ...EXCHANGE, organicDecayRate: 0.01 });
  const graph = createGraph(zero, zero, nothing, coefficients, { depth });

  const deposits: OrganicDepositSource[] = [
    depositAtTexelCentre(3, 5, 0.12), // over standing water, where it will run off as it lands
    depositAtTexelCentre(11, 9, 0.08), // on the dry half, where it can only weather in place
  ];
  for (const deposit of deposits) {
    assert(
      graph.addOrganicDeposit(deposit),
      `addOrganicDeposit refused a free slot at ${String(deposit.x)}, ${String(deposit.y)}`,
    );
  }

  // No clear between passes: the reference applies its list every pass too, which is what a depositor that keeps
  // declaring each frame looks like - and it means parity here also proves deposits are per-pass on both sides.
  const passes = 12;
  computePasses(graph, passes);

  const fields = readFields(graph);
  const cpuFields = simulateWaterQualityReference(
    {
      waterMass: channelData(nothing),
      groundMass: channelData(nothing),
    },
    depthField(depth),
    velocityField(zero, zero),
    WIDTH,
    TERRAIN_SIZE,
    passes,
    coefficients,
    [],
    deposits,
  );

  assert(
    worstDifference(fields.waterMass, cpuFields.waterMass) <= PARITY_TOLERANCE,
    `deposits disagree with the reference in water by ${String(worstDifference(fields.waterMass, cpuFields.waterMass))}`,
  );
  assert(
    worstDifference(fields.groundMass, cpuFields.groundMass) <=
      PARITY_TOLERANCE,
    `deposits disagree with the reference on the ground by ${String(worstDifference(fields.groundMass, cpuFields.groundMass))} - the two copies of the disc law have drifted apart`,
  );

  // Both halves must be holding something, or parity was won by nothing happening: the wet half scoured part of its
  // pat into the film, and the dry half kept the whole of the other one.
  assert(
    channelTotals(fields.groundMass)[1] > 0,
    "no organic matter anywhere on the ground",
  );
  const runoff = channelTotals(fields.waterMass)[1];
  assert(
    runoff > 0,
    `the wet half scoured nothing off its deposit: water holds ${String(runoff)}`,
  );

  // Mineralisation is on in this scenario, so the pair's total has to have fallen from what the two deposits put in.
  const deposited = deposits.reduce((sum, deposit) => sum + deposit.amount, 0);
  const remainingOrganic = totalOrganicMatter(fields);
  assert(
    remainingOrganic < deposited * passes,
    `twelve passes of ${String(deposited)} per pass left ${String(remainingOrganic)} organic matter with mineralisation switched on`,
  );

  completedScenarios += 1;
});

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

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

  // The deposit array is a second fixed-size list with the same failure mode, and animals do not stop defecating
  // because eight loads were already declared this pass - so it has to refuse out loud too.
  let acceptedDeposits = 0;
  for (let slot = 0; slot < DEPOSIT_SLOTS * 2; slot++) {
    if (
      graph.addOrganicDeposit({
        x: 1.5,
        y: TERRAIN_SIZE - 1.5,
        radius: 0.4,
        amount: 0.05,
      })
    ) {
      acceptedDeposits += 1;
    }
  }

  assert(
    acceptedDeposits === DEPOSIT_SLOTS,
    `accepted ${String(acceptedDeposits)} deposits; terrain-quality.frag's array holds ${String(DEPOSIT_SLOTS)}`,
  );

  completedScenarios += 1;
});

// ---------------------------------------------------------------------------
// Parity under injection and decay, so both sides have to move together
// ---------------------------------------------------------------------------

await test("injection matches the CPU reference", async () => {
  const coefficients = coefficientsFor({
    decayRate: 0.02,
    ...EXCHANGE,
    soilDecayRate: 0.01,
  });
  // A pond at the east edge: transport ends there, so downstream mass has somewhere to collect. Half the grid is
  // dry, which puts oxygen carry, emission gating and one-sided exchange all in the same run.
  const stillPondFromColumn = 12;
  const velocityX: ScalarField = (column) =>
    column < stillPondFromColumn ? FLOW_SPEED : 0.0;
  const depth: ScalarField = (column) =>
    column === WIDTH - 1 ? DRY_GROUND : STANDING_WATER;

  const graph = createGraph(velocityX, zero, nothing, coefficients, {
    depth,
    seedGround: [atCell(2, 2, 0.4), zero, zero, zero],
  });

  const sources: QualityInjectSource[] = [
    sourceAtTexelCentre(4, 4, 0, 0.15),
    sourceAtTexelCentre(9, 11, 3, 0.08),
    sourceAtTexelCentre(6, 7, 2, 0.1),
    sourceAtTexelCentre(15, 15, 2, 0.1), // on the dry column: must add nothing
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

  const fields = readFields(graph);
  const cpuFields = simulateWaterQualityReference(
    {
      waterMass: channelData(nothing),
      groundMass: channelData([atCell(2, 2, 0.4), zero, zero, zero]),
    },
    depthField(depth),
    velocityField(velocityX, zero),
    WIDTH,
    TERRAIN_SIZE,
    passes,
    coefficients,
    sources,
  );

  assert(
    worstDifference(fields.waterMass, cpuFields.waterMass) <= PARITY_TOLERANCE,
    `injection disagrees with the reference in water by ${String(worstDifference(fields.waterMass, cpuFields.waterMass))}`,
  );
  assert(
    worstDifference(fields.groundMass, cpuFields.groundMass) <=
      PARITY_TOLERANCE,
    `injection disagrees with the reference on the ground by ${String(worstDifference(fields.groundMass, cpuFields.groundMass))}`,
  );

  // The pond must have caught something: mass that cannot leave has to collect downstream of a source.
  let pondMass = 0;
  for (let row = 0; row < WIDTH; row++) {
    for (let column = stillPondFromColumn; column < WIDTH; column++) {
      pondMass += fields.waterMass[texelIndex(column, row) * 4];
    }
  }
  assert(
    pondMass > 0.5,
    `the pond only collected ${String(pondMass)} nitrogen`,
  );

  // The dry column has no dissolved oxygen in it even though a spring was aimed at it - while the wet one does, so
  // this cannot be explained by the emitter or the channel being broken.
  let dryColumnOxygen = 0;
  let wetOxygen = 0;
  for (let row = 0; row < WIDTH; row++) {
    dryColumnOxygen += fields.waterMass[texelIndex(WIDTH - 1, row) * 4 + 2];
    for (let column = 0; column < WIDTH - 1; column++) {
      wetOxygen += fields.waterMass[texelIndex(column, row) * 4 + 2];
    }
  }
  assert(
    dryColumnOxygen <= PARITY_TOLERANCE,
    `dissolved oxygen exists on the dry column: ${String(dryColumnOxygen)}`,
  );
  assert(
    wetOxygen > 0.1,
    `no dissolved oxygen anywhere in the water: ${String(wetOxygen)}`,
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
