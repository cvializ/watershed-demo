import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import { createGpuSedimentFlow } from "@/gpu/waterFlowSimulation/variables/createGpuSedimentFlow.ts";
import { createGpuTerrainHeight } from "@/gpu/waterFlowSimulation/variables/createGpuTerrainHeight.ts";

import { test } from "./clientTestUtils.ts";
import fixturePassthroughShader from "./fixture-passthrough.frag?raw";

// Mini-graph per plan A14: the real sediment variable and the real bed integrator, driven by synthetic
// waterVelocity / waterHeight fixtures instead of the full 512² simulation. Static inputs make the
// boundary conditions exactly controllable, so every gram of movement in the grid is accounted for.
const WIDTH = 16;

// Fixture geometry. A flat static base means bedrock sits at BASE_HEIGHT - erodibleDepth everywhere,
// which makes "the floor is never crossed" checkable against a constant.
const BASE_HEIGHT = 1.0;
const ERODIBLE_DEPTH = 0.35; // A8 default for erodibleDepth
const BEDROCK = BASE_HEIGHT - ERODIBLE_DEPTH;

const CHANNEL_SPEED = 0.3; // water-velocity.frag emits unit direction * speed in this range
const POND_START_X = 12; // columns at/after this hold still water: transport ends, deposition begins

// float32 headroom on heights of order one world unit. The shader rounds per texel; the checker does not.
const FLOOR_TOLERANCE = 1e-5;
// Relative drift allowed on M* = sum(load + bed + scheduled delta). Measured round-off on this fixture is
// ~7e-9 per pass, so this leaves two orders of headroom while still being far below anything a structural
// leak could hide (the removed -rate * 0.02 rescale moved mass at ~1e-2 per step).
const CONSERVATION_TOLERANCE = 1e-6;

type ScalarField = (column: number, row: number) => number;

// Material ids exactly as src/scene/resources/textures/surfaceMaterial.ts encodes them in
// surfaceMaterialMap.r. sediment-flow.frag keys its erodibility and deposition tables off these values with
// the same < 0.5 / < 1.5 thresholds water-velocity.frag uses (plan A9), so this is the only encoding a
// painted bank can reach the shader as.
const MATERIAL_BARE_DIRT = 0.0;
const MATERIAL_GRASS = 1.0;
const MATERIAL_ROCKS = 2.0;

type FixtureFields = {
  baseHeight: ScalarField;
  bed: ScalarField;
  depth: ScalarField;
  velocityX: ScalarField;
  velocityY: ScalarField;
  load: ScalarField;
  /** Omitted means "pass no material map at all": exercises the module-private 1x1 dirt fallback (A8). */
  material?: ScalarField;
};

/** Channel that erodes towards a pond: availability thins to zero at the outlet, so the floor bites. */
const channelFields: FixtureFields = {
  baseHeight: () => BASE_HEIGHT,
  bed: (column) => Math.max(BEDROCK, 0.95 - 0.02 * column),
  depth: () => 0.5,
  velocityX: (column) => (column < POND_START_X ? CHANNEL_SPEED : 0.0),
  velocityY: () => 0.0,
  load: () => 0.0,
};

/** Standing water with no depth at all: capacity is zero, so a seeded load has to settle in place. */
const dryFields: FixtureFields = {
  baseHeight: () => BASE_HEIGHT,
  bed: () => 0.9,
  depth: () => 0.0,
  velocityX: () => 0.0, // water-velocity.frag emits zero below its own wet threshold, so this is coherent
  velocityY: () => 0.0,
  load: (column) => (column >= 4 && column < 8 ? 0.2 : 0.0),
};

const renderer = new THREE.WebGLRenderer();
renderer.setSize(64, 64);
document.body.appendChild(renderer.domElement);

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

/** Kahan-compensated strided sum: the shader is float32, the checker must not be (plan S8). */
const kahanSum = (pixels: Float32Array, channelOffset: number): number => {
  let sum = 0.0;
  let compensation = 0.0;
  for (let index = channelOffset; index < pixels.length; index += 4) {
    const value = pixels[index];
    const adjusted = value - compensation;
    const total = sum + adjusted;
    compensation = total - sum - adjusted; // the bit that round-off swallowed
    sum = total;
  }
  return sum;
};

const createFixtureTexture = (fields: {
  red: ScalarField;
  green: ScalarField;
  blue: ScalarField;
  alpha: ScalarField;
}): THREE.DataTexture => {
  const data = new Float32Array(WIDTH * WIDTH * 4);
  for (let row = 0; row < WIDTH; row++) {
    for (let column = 0; column < WIDTH; column++) {
      const texelIndex = (row * WIDTH + column) * 4;
      data[texelIndex] = fields.red(column, row);
      data[texelIndex + 1] = fields.green(column, row);
      data[texelIndex + 2] = fields.blue(column, row);
      data[texelIndex + 3] = fields.alpha(column, row);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    WIDTH,
    WIDTH,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  // A14: with flipY = false the fixture index equals the texel index under readRenderTargetPixels
  // (bottom-left origin, row-major), so assertions can speak in fixture coordinates.
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
};

/** A variable that re-emits its own seeded value every pass: a boundary condition the harness owns. */
const addFixtureVariable = (
  gpuCompute: GPUComputationRenderer,
  name: "waterVelocity" | "waterHeight",
  texture: THREE.DataTexture,
): Variable => {
  const variable = gpuCompute.addVariable(
    name,
    fixturePassthroughShader.replace(/__SAMPLER__/g, name),
    texture,
  );
  // The self-dependency is what makes GCR inject the sampler this copy shader reads.
  gpuCompute.setVariableDependencies(variable, [variable]);
  return variable;
};

const createSedimentGraph = (fields: FixtureFields) => {
  const gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);

  const waterVelocityVariable = addFixtureVariable(
    gpuCompute,
    "waterVelocity",
    createFixtureTexture({
      red: fields.velocityX,
      green: fields.velocityY,
      blue: (column, row) =>
        Math.hypot(
          fields.velocityX(column, row),
          fields.velocityY(column, row),
        ),
      alpha: () => 1.0,
    }),
  );
  const waterHeightVariable = addFixtureVariable(
    gpuCompute,
    "waterHeight",
    createFixtureTexture({
      red: fields.depth,
      green: () => 0.0,
      blue: () => 0.0,
      alpha: () => 1.0,
    }),
  );

  // Real bed integrator with the fixture bed injected through its texture override (A14). The base map
  // is only a seed fallback here; it also becomes uBaseHeightMap below, i.e. the immovable floor.
  const baseHeightMapTexture = createFixtureTexture({
    red: fields.baseHeight,
    green: () => 0.0,
    blue: () => 0.0,
    alpha: () => 1.0,
  });
  const { heightMapVariable, linkBedToSediment } = createGpuTerrainHeight(
    gpuCompute,
    WIDTH,
    baseHeightMapTexture,
    createFixtureTexture({
      red: fields.bed,
      green: () => 0.0,
      blue: () => 0.0,
      alpha: () => 1.0,
    }),
  );

  // Real sediment variable. A fixture material map is a plain RGBA float texture like the production one;
  // omitting it leaves createGpuSedimentFlow to bind its 1x1 all-dirt fallback (A8).
  const surfaceMaterialTexture = fields.material
    ? createFixtureTexture({
        red: fields.material,
        green: () => 0.0,
        blue: () => 0.0,
        alpha: () => 1.0,
      })
    : null;
  const { sedimentFlowVariable, updateSedimentFlow, getSedimentFlowUniforms } =
    createGpuSedimentFlow(
      gpuCompute,
      WIDTH,
      baseHeightMapTexture,
      waterVelocityVariable,
      waterHeightVariable,
      heightMapVariable,
      surfaceMaterialTexture,
      createFixtureTexture({
        red: () => 0.0,
        green: () => 0.0,
        blue: fields.load,
        alpha: () => 0.0,
      }),
    );

  linkBedToSediment(sedimentFlowVariable);

  const initError = gpuCompute.init();
  assert(initError === null, `gpuCompute.init() failed: ${initError}`);

  // Guard the constant every floor assertion is written against.
  const sedimentUniforms = getSedimentFlowUniforms();
  assert(
    Math.abs(sedimentUniforms.erodibleDepth.value - ERODIBLE_DEPTH) < 1e-9,
    `erodibleDepth drifted from the A8 default: ${String(sedimentUniforms.erodibleDepth.value)}`,
  );

  return {
    gpuCompute,
    heightMapVariable,
    sedimentFlowVariable,
    sedimentUniforms,
    updateSedimentFlow,
  };
};

type SedimentGraph = ReturnType<typeof createSedimentGraph>;

/** Commit exactly one pass at a nominal frame rate (S6). */
const computeOnce = (graph: SedimentGraph): void => {
  graph.updateSedimentFlow(1 / 60);
  graph.gpuCompute.compute();
};

/** Inclusive column band: the vegetated strip in the bank fixtures (plan A9). */
type ColumnBand = { from: number; to: number };

const inBand = (column: number, band: ColumnBand): boolean =>
  column >= band.from && column <= band.to;

/**
 * Exchange scheduled inside a column band, read straight out of channel A (D - E) rather than inferred from
 * the bed: it is available on the very first pass, before float32 round-off in a bed of order one can hide
 * a small exchange.
 */
const bandExchange = (
  sedimentPixels: Float32Array,
  band: ColumnBand,
  sign: -1 | 1, // -1 for erosion (negative delta), +1 for deposition
): number => {
  let total = 0.0;
  for (let row = 0; row < WIDTH; row++) {
    for (let column = 0; column < WIDTH; column++) {
      if (!inBand(column, band)) {
        continue;
      }
      const scheduledDelta = sedimentPixels[(row * WIDTH + column) * 4 + 3];
      // sign flips the channel so each direction of exchange is a positive magnitude on its own.
      total += Math.max(0.0, sign * scheduledDelta);
    }
  }
  return total;
};

const readPixels = (graph: SedimentGraph, variable: Variable): Float32Array => {
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

/** Metrics sampled after a committed pass; plan A13 says which of these may move. */
type PassAudit = {
  materialTotal: number; // M* = sum(load + bed + scheduled delta): invariant exactly
  suspendedLoadSum: number;
  scheduledDeltaSum: number;
  bedSum: number;
  worstFloorViolation: number; // largest amount by which the bed beat bedrock, if any
};

const auditPass = (graph: SedimentGraph, passIndex: number): PassAudit => {
  const sedimentPixels = readPixels(graph, graph.sedimentFlowVariable);
  const bedPixels = readPixels(graph, graph.heightMapVariable);

  let worstFloorViolation = 0.0;
  for (let texel = 0; texel < WIDTH * WIDTH; texel++) {
    const channelIndex = texel * 4;
    const load = sedimentPixels[channelIndex + 2];
    const scheduledDelta = sedimentPixels[channelIndex + 3];
    const bed = bedPixels[channelIndex];

    assert(
      Number.isFinite(load) &&
        Number.isFinite(scheduledDelta) &&
        Number.isFinite(bed),
      `pass ${passIndex}: non-finite texel ${texel} (load=${String(load)}, delta=${String(scheduledDelta)}, bed=${String(bed)})`,
    );

    // sNew = carried - deposition + influx with deposition <= carried, so load >= 0 is structural. A
    // negative value would mean a leak was papered over by a clamp somewhere upstream.
    assert(
      load >= 0.0,
      `pass ${passIndex}: texel ${texel} reached load=${String(load)}, which cannot come out of structurally non-negative arithmetic`,
    );

    // A2 limits erosion against the bed once the pending delta lands, so neither the committed bed nor
    // the value terrain-height.frag is about to write may reach bedrock from above.
    worstFloorViolation = Math.max(
      worstFloorViolation,
      BEDROCK - bed,
      BEDROCK - (bed + scheduledDelta),
    );
  }

  assert(
    worstFloorViolation <= FLOOR_TOLERANCE,
    `pass ${passIndex}: the bed crossed the immovable floor by ${String(worstFloorViolation)} (bedrock=${String(BEDROCK)})`,
  );

  const suspendedLoadSum = kahanSum(sedimentPixels, 2);
  const scheduledDeltaSum = kahanSum(sedimentPixels, 3);
  const bedSum = kahanSum(bedPixels, 0);

  return {
    materialTotal: suspendedLoadSum + bedSum + scheduledDeltaSum,
    suspendedLoadSum,
    scheduledDeltaSum,
    bedSum,
    worstFloorViolation,
  };
};

/**
 * Step the graph and audit every committed pass. Exchange is tracked as a running min/max across all
 * passes rather than sampled at the end: cells that have cut down to their availability stop scheduling a
 * delta, so an end-of-run sample can look like "nothing happened" in exactly the scenario where the floor
 * did its job (A2).
 */
const runAndAudit = (graph: SedimentGraph, passCount: number) => {
  const initialAudit = auditPass(graph, -1); // seeded state, before any exchange
  let finalAudit = initialAudit;
  let minScheduledDelta = 0.0; // most negative delta seen anywhere: erosion
  let maxScheduledDelta = 0.0; // most positive delta seen anywhere: deposition

  for (let passIndex = 0; passIndex < passCount; passIndex++) {
    graph.updateSedimentFlow(1 / 60); // dtScale for a nominal frame (S6)
    graph.gpuCompute.compute();
    finalAudit = auditPass(graph, passIndex);

    const scheduledDeltas = readPixels(graph, graph.sedimentFlowVariable);
    for (let texel = 0; texel < WIDTH * WIDTH; texel++) {
      const scheduledDelta = scheduledDeltas[texel * 4 + 3];
      minScheduledDelta = Math.min(minScheduledDelta, scheduledDelta);
      maxScheduledDelta = Math.max(maxScheduledDelta, scheduledDelta);
    }

    const relativeDrift =
      Math.abs(finalAudit.materialTotal - initialAudit.materialTotal) /
      Math.abs(initialAudit.materialTotal);
    assert(
      relativeDrift <= CONSERVATION_TOLERANCE,
      `pass ${passIndex}: M* drifted by ${String(relativeDrift)} of ${String(initialAudit.materialTotal)} (M*=${String(finalAudit.materialTotal)})`,
    );
  }

  return {
    initialAudit,
    finalAudit,
    minScheduledDelta,
    maxScheduledDelta,
  };
};

// Scenarios below. The completion marker carries this count, so it can only be reached by actually running
// every scenario rather than by a flag assignment that happens to sit after the assertions.
let completedScenarios = 0;
const SCENARIO_COUNT = 8;

const channelBedAt = (column: number): number =>
  Math.max(BEDROCK, 0.95 - 0.02 * column);

// ---------------------------------------------------------------------------

/** Assert actual / denominator sits at expected ± tolerance, with the numbers in the failure message. */
const assertRatio = (
  numerator: number,
  denominator: number,
  expected: number,
  tolerance: number,
  label: string,
): void => {
  assert(
    denominator > 0.0,
    `${label}: denominator ${String(denominator)} is not measurable`,
  );
  const ratio = numerator / denominator;
  assert(
    Math.abs(ratio - expected) <= tolerance,
    `${label}: ${String(numerator)} / ${String(denominator)} = ${String(ratio)}, expected ${String(expected)} +/- ${String(tolerance)}`,
  );
};

await test("erosion and deposition conserve M* while a channel cuts towards its floor", async () => {
  const graph = createSedimentGraph(channelFields);

  // Rates only, never structure: detachRate = 1 is section 4.7's "no rate limit" (the A8 default of 0.004
  // puts per-pass exchange on this gentle fixture below the float32 resolution of a bed of order one), and
  // settleRate is raised so downstream aggradation completes inside the run. Conservation, availability and
  // the floor have to hold at any rate - that is what the absurd-rates scenario hammers on.
  graph.sedimentUniforms.detachRate.value = 1.0;
  graph.sedimentUniforms.settleRate.value = 0.5;

  const { initialAudit, finalAudit, minScheduledDelta, maxScheduledDelta } =
    runAndAudit(graph, 300);

  // Pairing has to be observable: the bed lost material somewhere and gained it somewhere else. If this
  // ever passes vacuously (no exchange at all), conservation would prove nothing about the pairing.
  const bedPixels = readPixels(graph, graph.heightMapVariable);

  let lowestBedChange = Number.POSITIVE_INFINITY;
  let highestBedChange = Number.NEGATIVE_INFINITY;
  for (let row = 0; row < WIDTH; row++) {
    for (let column = 0; column < WIDTH; column++) {
      const channelIndex = (row * WIDTH + column) * 4;
      const bedChange = bedPixels[channelIndex] - channelBedAt(column);
      lowestBedChange = Math.min(lowestBedChange, bedChange);
      highestBedChange = Math.max(highestBedChange, bedChange);
    }
  }

  assert(
    minScheduledDelta < -1e-7,
    `no texel ever scheduled erosion across 300 passes (min delta=${String(minScheduledDelta)})`,
  );
  assert(
    maxScheduledDelta > 1e-7,
    `no texel ever scheduled deposition across 300 passes (max delta=${String(maxScheduledDelta)})`,
  );
  assert(
    lowestBedChange < -1e-4,
    `the channel never lowered (min bed change=${String(lowestBedChange)})`,
  );
  assert(
    highestBedChange > 1e-4,
    `the pond never aggraded (max bed change=${String(highestBedChange)})`,
  );

  // Suspended load came out of the bed and stayed in the grid: nothing was minted at the interface.
  assert(
    finalAudit.suspendedLoadSum > 0.0,
    "no suspended load was ever picked up",
  );
  console.log(
    `[sediment:channel] M* ${String(initialAudit.materialTotal)} -> ${String(finalAudit.materialTotal)}, load=${String(finalAudit.suspendedLoadSum)}, bedChange=[${String(lowestBedChange)}, ${String(highestBedChange)}], scheduledDelta=[${String(minScheduledDelta)}, ${String(maxScheduledDelta)}]`,
  );
});
completedScenarios += 1;

await test("deposition in still water is mass-neutral to the gram", async () => {
  const graph = createSedimentGraph(dryFields);
  const initialBedSum = auditPass(graph, -1).bedSum;

  const { initialAudit } = runAndAudit(graph, 60);

  // Dry cells: capacity is zero and settling is boosted, so a seeded load has to end up on the bed where
  // it started rather than ride off-grid or evaporate with the water (section 4.5).
  const finalSedimentPixels = readPixels(graph, graph.sedimentFlowVariable);
  const finalBedPixels = readPixels(graph, graph.heightMapVariable);
  const finalLoadSum = kahanSum(finalSedimentPixels, 2);
  const finalBedSum = kahanSum(finalBedPixels, 0);

  assert(
    initialAudit.suspendedLoadSum > 0.0,
    "the dry fixture started without load",
  );
  assert(
    finalLoadSum < 1e-3 * initialAudit.suspendedLoadSum,
    `load should have settled in place, still suspended: ${String(finalLoadSum)} of ${String(initialAudit.suspendedLoadSum)}`,
  );

  // Bed gain equals load loss. This is the §S8 "deposition is mass-neutral" invariant, and it only holds
  // because deposition's clamp takes min(carried, ...) instead of minting height.
  const bedGain = finalBedSum - initialBedSum;
  const loadLoss = initialAudit.suspendedLoadSum - finalLoadSum;
  assert(
    Math.abs(bedGain - loadLoss) <= 1e-5 * Math.max(1.0, loadLoss),
    `bed gained ${String(bedGain)} while load lost ${String(loadLoss)}`,
  );

  console.log(`[sediment:dry] settled in place, bed gain=${String(bedGain)}`);
});
completedScenarios += 1;

await test("absurd rates still conserve mass and never cross the floor", async () => {
  const graph = createSedimentGraph(channelFields);

  // The UI slider can reach whatever its range allows, so the clamps have to hold at absurd values too:
  // this is what catches a silent max(0, ...) sink (§S8 "clamps return mass").
  graph.sedimentUniforms.erosionCoefficient.value = 1e6;
  graph.sedimentUniforms.detachRate.value = 1e3;
  graph.sedimentUniforms.settleRate.value = 5.0;
  graph.sedimentUniforms.transferCap.value = 1.0; // CFL analogue at its limit: export <= inventory
  graph.sedimentUniforms.criticalSpeed.value = 0.0;

  const { initialAudit, finalAudit } = runAndAudit(graph, 200);
  console.log(
    `[sediment:absurd] M* ${String(initialAudit.materialTotal)} -> ${String(finalAudit.materialTotal)}, worstFloorViolation=${String(finalAudit.worstFloorViolation)}`,
  );
});
completedScenarios += 1;

await test("identical fixtures replay bit-for-bit", async () => {
  const firstGraph = createSedimentGraph(channelFields);
  const secondGraph = createSedimentGraph(channelFields);

  for (let passIndex = 0; passIndex < 5; passIndex++) {
    computeOnce(firstGraph);
    computeOnce(secondGraph);
  }

  // Any dependence on which physical ping-pong buffer happened to be bound (plan S1) shows up here as
  // a difference between two graphs built from identical numbers.
  const variablePairs: Array<[Variable, Variable]> = [
    [firstGraph.sedimentFlowVariable, secondGraph.sedimentFlowVariable],
    [firstGraph.heightMapVariable, secondGraph.heightMapVariable],
  ];

  for (const [firstVariable, secondVariable] of variablePairs) {
    const firstPixels = readPixels(firstGraph, firstVariable);
    const secondPixels = readPixels(secondGraph, secondVariable);

    for (let index = 0; index < firstPixels.length; index++) {
      assert(
        Object.is(firstPixels[index], secondPixels[index]),
        `replay diverged at channel ${index} of ${firstVariable.name}: ${String(firstPixels[index])} vs ${String(secondPixels[index])}`,
      );
    }
  }
});
completedScenarios += 1;

// The Playwright wrapper waits for this marker rather than only for page errors: a GPU run of hundreds of
// passes must not be able to report success before its assertions have had a chance to fail. It carries the
// number of finished scenarios so that hoisting the assignment cannot fake a pass.
// ---------------------------------------------------------------------------
// Plan A17 step 4: the material tables (A9). Erodibility and deposition factor are keyed per texel off
// surfaceMaterialMap.r, so these scenarios compare runs that differ ONLY in that map. Every one of them runs
// through runAndAudit, which keeps asserting M* conservation and the immovable floor: stabilising a bank may
// not be bought with mass.

/** Columns whose bed is vegetated/rocked in the banded fixtures; everywhere else stays bare dirt. */
const BANK_BAND = { from: 3, to: 6 };

/** Flume that erodes along its whole length: flow east, still water from POND_START_X onward. */
const bankBase: FixtureFields = {
  baseHeight: () => BASE_HEIGHT,
  bed: (column) => Math.max(BEDROCK, 0.95 - 0.02 * column),
  depth: () => 0.5,
  velocityX: (column) => (column < POND_START_X ? CHANNEL_SPEED : 0.0),
  velocityY: () => 0.0,
  load: () => 0.0,
};

/** Standing water, no flow at all: the only exchange available is settling of a seeded load. */
const trappingBase: FixtureFields = {
  ...bankBase,
  bed: () => 0.9,
  depth: () => 0.0, // dry: capacity 0 and stillWaterBoost engaged, so the whole load wants to drop
  velocityX: () => 0.0,
  load: (column) => (inBand(column, BANK_BAND) ? 0.2 : 0.0),
};

/**
 * Rates only, never structure (same reasoning as the channel scenario): detachRate = 1 lifts per-pass
 * exchange above float32 resolution of a bed of order one, and both runs share the rates, so any ratio
 * measured between them is the material table talking.
 */
const withFastExchange = (graph: SedimentGraph): void => {
  graph.sedimentUniforms.detachRate.value = 1.0;
  graph.sedimentUniforms.settleRate.value = 0.5;
};

await test("erodibility is per material, and only where that material is painted", async () => {
  const control = createSedimentGraph({
    ...bankBase,
    material: () => MATERIAL_BARE_DIRT,
  });
  const vegetatedBank = createSedimentGraph({
    ...bankBase,
    material: (column) =>
      inBand(column, BANK_BAND) ? MATERIAL_GRASS : MATERIAL_BARE_DIRT,
  });

  withFastExchange(control);
  withFastExchange(vegetatedBank);

  // First pass: load starts at zero everywhere, so no cell can import, capacity is nowhere near binding,
  // and settling has nothing above capacity to draw down. Scheduled delta is therefore exactly -E, i.e.
  // dtScale * erosionCoefficient * detachRate * erodibility * (shear - criticalShear): a direct read of the
  // erodibility table with no other term in the way.
  computeOnce(control);
  computeOnce(vegetatedBank);

  const controlPixels = readPixels(control, control.sedimentFlowVariable);
  const grassPixels = readPixels(
    vegetatedBank,
    vegetatedBank.sedimentFlowVariable,
  );

  const controlBandErosion = bandExchange(controlPixels, BANK_BAND, -1);
  assertRatio(
    bandExchange(grassPixels, BANK_BAND, -1),
    controlBandErosion,
    0.3, // A9: grass erodibility / dirt erodibility
    0.02,
    "grass vs dirt erosion in the bank band",
  );

  // The same flow next to the vegetation cuts bare soil at full rate: the factors must be keyed off the
  // texel's own material, not smeared across the grid or applied as a global average.
  const controlBareErosion = bandExchange(
    controlPixels,
    { from: BANK_BAND.to + 1, to: WIDTH - 1 },
    -1,
  );
  assertRatio(
    bandExchange(grassPixels, { from: BANK_BAND.to + 1, to: WIDTH - 1 }, -1),
    controlBareErosion,
    1.0,
    1e-4,
    "bare cells downstream of a grass band vs the all-dirt control",
  );

  // Stabilising the bank must not cost mass, nor let anything cross the floor, over a long run.
  const { finalAudit } = runAndAudit(vegetatedBank, 200);
  console.log(
    `[sediment:erodibility] band erosion grass=${String(bandExchange(grassPixels, BANK_BAND, -1))} dirt=${String(controlBandErosion)}, M* after 200 passes=${String(finalAudit.materialTotal)}`,
  );
});
completedScenarios += 1;

await test("rock resists more than grass, in the same flume and the same flow", async () => {
  const vegetated = createSedimentGraph({
    ...bankBase,
    material: (column) =>
      inBand(column, BANK_BAND) ? MATERIAL_GRASS : MATERIAL_BARE_DIRT,
  });
  const armoured = createSedimentGraph({
    ...bankBase,
    material: (column) =>
      inBand(column, BANK_BAND) ? MATERIAL_ROCKS : MATERIAL_BARE_DIRT,
  });

  withFastExchange(vegetated);
  withFastExchange(armoured);

  computeOnce(vegetated);
  computeOnce(armoured);

  const grassBandErosion = bandExchange(
    readPixels(vegetated, vegetated.sedimentFlowVariable),
    BANK_BAND,
    -1,
  );
  assertRatio(
    bandExchange(
      readPixels(armoured, armoured.sedimentFlowVariable),
      BANK_BAND,
      -1,
    ),
    grassBandErosion,
    0.1 / 0.3, // A9: rock erodibility / grass erodibility
    0.02,
    "rock vs grass erosion in the bank band",
  );

  runAndAudit(armoured, 150);
});
completedScenarios += 1;

await test("vegetation traps sediment that bare soil and rock let travel on", async () => {
  // Deposition factor only: with no flow at all nothing can be exported or eroded, so whatever the bed gains
  // in the band settled out of the seeded load, and its rate carries depositionFactor (A9).
  const settledIn = (materialId: number): number => {
    const graph = createSedimentGraph({
      ...trappingBase,
      material: () => materialId,
    });

    computeOnce(graph);

    const deposited = bandExchange(
      readPixels(graph, graph.sedimentFlowVariable),
      BANK_BAND,
      1,
    );
    runAndAudit(graph, 40); // the rest of the load settles too, still conserving M*
    return deposited;
  };

  const dirtDeposited = settledIn(MATERIAL_BARE_DIRT);
  assertRatio(
    settledIn(MATERIAL_GRASS),
    dirtDeposited,
    1.5, // A9: grass deposition factor
    0.02,
    "grass vs dirt settling in one pass",
  );
  assertRatio(
    settledIn(MATERIAL_ROCKS),
    dirtDeposited,
    0.8, // A9: smooth rock keeps sediment moving
    0.02,
    "rock vs dirt settling in one pass",
  );
});
completedScenarios += 1;

await test("the all-dirt fallback map is bit-for-bit the neutral factors", async () => {
  // A8 replaces uHasSurfaceMaterialMap with a module-private 1x1 all-dirt texture, which is only sound if
  // "dirt" is exactly the identity for both tables (erodibility 1.0, deposition factor 1.0) - otherwise
  // painting nothing would silently behave differently from painting bare dirt everywhere.
  const fallbackGraph = createSedimentGraph(bankBase); // material omitted -> no texture passed at all
  const paintedDirtGraph = createSedimentGraph({
    ...bankBase,
    material: () => MATERIAL_BARE_DIRT,
  });

  withFastExchange(fallbackGraph);
  withFastExchange(paintedDirtGraph);

  for (let passIndex = 0; passIndex < 5; passIndex++) {
    computeOnce(fallbackGraph);
    computeOnce(paintedDirtGraph);
  }

  const variablePairs: Array<[Variable, Variable]> = [
    [fallbackGraph.sedimentFlowVariable, paintedDirtGraph.sedimentFlowVariable],
    [fallbackGraph.heightMapVariable, paintedDirtGraph.heightMapVariable],
  ];

  for (const [firstVariable, secondVariable] of variablePairs) {
    const firstPixels = readPixels(fallbackGraph, firstVariable);
    const secondPixels = readPixels(paintedDirtGraph, secondVariable);

    for (let index = 0; index < firstPixels.length; index++) {
      assert(
        Object.is(firstPixels[index], secondPixels[index]),
        `${firstVariable.name} differs at channel ${index}: no map gave ${String(firstPixels[index])}, all-dirt map gave ${String(secondPixels[index])}`,
      );
    }
  }
});
completedScenarios += 1;

assert(
  completedScenarios === SCENARIO_COUNT,
  `only ${String(completedScenarios)} of ${String(SCENARIO_COUNT)} sediment scenarios completed`,
);
document.body.dataset.sedimentFlowTestsComplete = String(completedScenarios);
