import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import type { GPUSimulationState } from "@/gpu/waterFlowSimulation/saveLoadSimulationState.ts";

import {
  createTexturesFromState,
  deserializeGPUSimulationState,
  saveGPUSimulationState,
  serializeGPUSimulationState,
} from "@/gpu/waterFlowSimulation/saveLoadSimulationState.ts";
import { createGpuTerrainQuality } from "@/gpu/waterFlowSimulation/variables/createGpuTerrainQuality.ts";
import { createGpuWaterQuality } from "@/gpu/waterFlowSimulation/variables/createGpuWaterQuality.ts";
import { SUBSTANCE_EXCHANGE_RATES } from "@/gpu/waterFlowSimulation/variables/substanceExchange.ts";

import { test } from "./clientTestUtils.ts";
import fixturePassthroughShader from "./fixture-passthrough.frag?raw";

/**
 * Save/load for the two substance compartments (`waterQuality` and `terrainQuality`).
 *
 * The claim under test is a modelling one, so it needs its own suite rather than a paragraph in the transport
 * suite: bacterial content belongs to the water *and* to the ground, which means a snapshot has to carry both or it
 * carries neither. Half a census is not a state a player would recognize - load a save that kept only the plume and
 * every population that settled into soil during play is simply gone, with nothing logged.
 *
 * So this file drives the production entry points end to end: `saveGPUSimulationState` decides what "state" means,
 * `serializeGPUSimulationState` / `deserializeGPUSimulationState` are the format on disk (both directions run here,
 * because a key written under one spelling and read back under another loses a field in total silence), and
 * `createTexturesFromState` is what seeds the recreated graph - exactly as src/storage.ts does on load.
 *
 * Harness follows plan A14 as the sediment save/load suite does: real substance variables, static passthrough
 * fixtures for everything else, so every gram of mass in the grid belongs to one of the two compartments.
 */
const WIDTH = 16;

// Scale only: the quality shaders divide source positions by uTerrainSize, and no scenario here emits a source.
const TERRAIN_SIZE = 16;

// float32 headroom for a few dozen passes of multiply-add on values of order one - the same budget as the transport
// suite, so "the restored world continues identically" means the same thing in both files.
const CONTINUATION_TOLERANCE = 2e-6;

// A restored state *is* the same state rather than an approximation of it, so this budget is exactly zero.
// Forgiving a nonzero difference here would forgive restoration editing committed bytes.
const RESTORED_TOLERANCE = 0.0;

const FLOW_SPEED = 0.25; // eastward, so transport is live across the save boundary too

// Depth against the shaders' WET_DEPTH of 0.01: standing water over most of the grid, a dry strip on the east edge.
// The dry cells matter specifically here - they hold soil bacteria that never trade with anything, so a restore that
// drops the ground compartment loses mass no exchange term could ever have moved either.
const STANDING_WATER = 1.0;
const DRY_GROUND = 0.0;
const DRY_START_COLUMN = 12;

const PASS_COUNT_BEFORE_SAVE = 6;
const PASS_COUNT_AFTER_RESTORE = 4;

// Channel names in POLLUTANT_SPECIES order, for failure messages that name the substance rather than an offset.
const WATER_CHANNEL_LABELS = [
  "water.r (nitrogen)",
  "water.g (organic matter)",
  "water.b (dissolved oxygen)",
  "water.a (bacteria in the column)",
] as const;

// Only R is a substance in the ground texture; G, B and A are written zero on purpose.
const CHANNEL_SOIL_BACTERIA = 0;

type ScalarField = (column: number, row: number) => number;

/** Throwing checker that also narrows for the compiler, so `assert(value !== null, ...)` removes the null. */
type AssertFn = (condition: boolean, message: string) => asserts condition;

const assert: AssertFn = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

// Scenarios that actually finished. The wrapper waits for all of them rather than "more than zero", because a
// persistence regression can leave one scenario green - the non-vacuity preconditions need no restoration at all.
let completedScenarios = 0;
const SCENARIO_COUNT = 6;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(256, 256);
document.body.appendChild(renderer.domElement);

const zero: ScalarField = () => 0.0;

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
  // Unflipped so fixture index equals texel index under readRenderTargetPixels, as in the other GPU harnesses.
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
};

/** A variable that re-emits its own seeded value every pass: a boundary condition the harness owns. */
const addFixtureVariable = (
  gpuCompute: GPUComputationRenderer,
  name: string,
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

const texelIndex = (column: number, row: number): number =>
  row * WIDTH + column;

/** One cell of a substance, everything else zero: enough structure to make byte comparison non-vacuous. */
const atCell =
  (column: number, row: number, value: number): ScalarField =>
  (candidateColumn, candidateRow) =>
    candidateColumn === column && candidateRow === row ? value : 0.0;

/** A rectangle of a substance, so a channel is populated over an area rather than at one texel. */
const inBlock =
  (value: number): ScalarField =>
  (column, row) =>
    column < 6 && row >= 2 && row <= 8 ? value : 0.0;

// Static boundary conditions and seeds: identical for both graphs, since only *saved* dynamic state may come back
// through save/load. Authoring them differently per graph would let a broken restore hide behind the difference.
const fixtureVelocityX: ScalarField = () => FLOW_SPEED;
const fixtureVelocityY: ScalarField = zero;
const fixtureDepth: ScalarField = (column) =>
  column >= DRY_START_COLUMN ? DRY_GROUND : STANDING_WATER;

// Water column channels: nitrogen, organic matter, dissolved oxygen, bacteria. The blobs are placed so several
// routes and both wetness regimes carry mass by the time the snapshot is taken.
const seedWaterMass: readonly ScalarField[] = [
  atCell(3, 3, 0.8),
  atCell(7, 10, 0.5),
  () => 0.4,
  inBlock(0.9),
];

// Ground channels: only R (soil bacteria) is a substance, seeded both under standing water - where the exchange runs
// in both directions - and on the dry strip, where nothing can move it.
const seedGroundMass: readonly ScalarField[] = [
  (column, row) =>
    Math.max(
      column >= DRY_START_COLUMN && row % 2 === 0 ? 0.7 : 0.0,
      atCell(3, 3, 0.5)(column, row),
    ),
  zero,
  zero,
  zero,
];

/** Per-pass coefficients both compartments run on, written over the factory defaults. */
type Coefficients = {
  fluxFraction: number;
  decayRate: number;
  soilAttachRate: number;
  washOffRate: number;
  soilDecayRate: number;
};

// The rates production runs on, so the trade exercised here is the real one rather than invented numbers that would
// then quietly disagree with SUBSTANCE_EXCHANGE_RATES. Decay stays off: mass that survives a round trip should be
// attributable to save/load alone, not to a decay curve this file happens to have picked.
const COEFFICIENTS: Coefficients = {
  fluxFraction: 0.5,
  decayRate: 0.0,
  soilAttachRate: SUBSTANCE_EXCHANGE_RATES.soilAttachRate,
  washOffRate: SUBSTANCE_EXCHANGE_RATES.washOffRate,
  soilDecayRate: 0.0,
};

/** The textures a second graph takes from save/load instead of freshly authored fixtures. */
type RestoredSeed = {
  waterQualityTexture: THREE.DataTexture;
  terrainQualityTexture: THREE.DataTexture;
};

/**
 * Build one graph: faked flow and the four unrelated fields underneath, both real substance variables on top.
 *
 * @param restored - Substance textures handed back by createTexturesFromState, in place of authored seeds
 */
const createGraph = (restored?: RestoredSeed) => {
  const gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);

  const waterVelocityVariable = addFixtureVariable(
    gpuCompute,
    "waterVelocity",
    channelData([
      fixtureVelocityX,
      fixtureVelocityY,
      () => FLOW_SPEED,
      () => 1.0,
    ]),
  );
  const waterHeightVariable = addFixtureVariable(
    gpuCompute,
    "waterHeight",
    channelData([fixtureDepth, zero, zero, () => 1.0]),
  );

  // saveGPUSimulationState reads five fields besides the substance pair. In this mini-graph they are static
  // fixtures: what they hold is beside the point, that they exist and are read is not - the production call picks
  // them by key, so a swap between two of them writes the wrong field into the file with nothing to show for it.
  const heightMapVariable = addFixtureVariable(
    gpuCompute,
    "terrainHeight",
    channelData([() => 1.0, zero, zero, () => 1.0]),
  );
  const sedimentVariable = addFixtureVariable(
    gpuCompute,
    "sedimentFlow",
    channelData([zero, zero, () => 0.2, () => 1.0]),
  );
  const cloudVariable = addFixtureVariable(
    gpuCompute,
    "cloudDensity",
    channelData([() => 0.25, zero, zero, () => 1.0]),
  );

  // The substance pair: authored fixtures for the first graph, restored render-target contents for the second -
  // that override is the save/load path under test (both factories take their seed texture as their last argument).
  const quality = createGpuWaterQuality(
    gpuCompute,
    WIDTH,
    TERRAIN_SIZE,
    waterVelocityVariable,
    waterHeightVariable,
    restored === undefined
      ? createTexture(channelData(seedWaterMass))
      : restored.waterQualityTexture,
  );
  quality.initWaterQuality();

  const terrain = createGpuTerrainQuality(
    gpuCompute,
    WIDTH,
    waterHeightVariable,
    quality.waterQualityVariable,
    restored === undefined
      ? createTexture(channelData(seedGroundMass))
      : restored.terrainQualityTexture,
  );
  terrain.initTerrainQuality();

  // The cycle both halves of the exchange need: linked before init(), which is where dependency samplers get
  // declared (src/gpu/README.md, section 1). Both graphs build identically apart from their seeds.
  quality.linkWaterQualityToTerrain(terrain.terrainQualityVariable);

  const waterUniforms = quality.getWaterQualityUniforms();
  waterUniforms.fluxFraction.value = COEFFICIENTS.fluxFraction;
  waterUniforms.decayRate.value = COEFFICIENTS.decayRate;
  waterUniforms.soilAttachRate.value = COEFFICIENTS.soilAttachRate;
  waterUniforms.washOffRate.value = COEFFICIENTS.washOffRate;

  const terrainUniforms = terrain.getTerrainQualityUniforms();
  terrainUniforms.soilDecayRate.value = COEFFICIENTS.soilDecayRate;
  terrainUniforms.soilAttachRate.value = COEFFICIENTS.soilAttachRate;
  terrainUniforms.washOffRate.value = COEFFICIENTS.washOffRate;

  const initError = gpuCompute.init();
  assert(initError === null, `gpuCompute.init() failed: ${String(initError)}`);

  return {
    gpuCompute,
    heightMapVariable,
    waterHeightVariable,
    waterVelocityVariable,
    sedimentVariable,
    cloudVariable,
    ...quality,
    ...terrain,
  };
};

type Graph = ReturnType<typeof createGraph>;

/** Commit passes at the nominal frame rate; dtScale follows from it the way it does in production (plan S6). */
const computePasses = (graph: Graph, passes: number): void => {
  for (let pass = 0; pass < passes; pass++) {
    graph.updateWaterQuality(1 / 60);
    graph.updateTerrainQuality(1 / 60);
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

/** Both committed compartments of a running graph. */
const readCompartments = (graph: Graph) => ({
  water: readPixels(graph, graph.waterQualityVariable),
  ground: readPixels(graph, graph.terrainQualityVariable),
});

/** The production save call, with the substance pair among the variables it is told to read. */
const saveState = (graph: Graph) => {
  const state = saveGPUSimulationState(
    {
      heightMapVariable: graph.heightMapVariable,
      waterHeightVariable: graph.waterHeightVariable,
      velocityVariable: graph.waterVelocityVariable,
      sedimentVariable: graph.sedimentVariable,
      cloudVariable: graph.cloudVariable,
      waterQualityVariable: graph.waterQualityVariable,
      terrainQualityVariable: graph.terrainQualityVariable,
    },
    graph.gpuCompute,
    renderer,
  );
  assert(state !== null, "saveGPUSimulationState returned null");

  // Narrowed once here so every scenario reads fields that exist rather than re-checking for a missing compartment.
  const waterQualityData = state.waterQualityData;
  const terrainQualityData = state.terrainQualityData;
  assert(
    waterQualityData !== null && terrainQualityData !== null,
    "snapshot is missing a substance compartment: the Variables never reached saveGPUSimulationState",
  );

  return { ...state, waterQualityData, terrainQualityData };
};

/** The whole persistence format, both directions: the bytes a save writes, then the state a load reads back. */
const roundTrip = (state: GPUSimulationState) =>
  deserializeGPUSimulationState(serializeGPUSimulationState(state));

/** Seed a second graph from a snapshot, which is what src/storage.ts does on load. */
const recreateFrom = (state: GPUSimulationState): Graph => {
  const textures = createTexturesFromState(roundTrip(state));
  return createGraph({
    waterQualityTexture: textures.waterQualityTexture,
    terrainQualityTexture: textures.terrainQualityTexture,
  });
};

type BitComparison = {
  identical: boolean;
  firstDifference: string | null;
};

/**
 * Exact bit equality over one channel of two float snapshots, compared as raw IEEE-754 words. Deliberately no
 * epsilon: "restored" means the same bytes, and only bits can say that - a tolerance here would forgive restoration
 * rewriting committed state, which is the failure class this suite exists to catch.
 */
const compareBits = (
  saved: Float32Array,
  restored: Float32Array,
  channelOffset: number,
  channelLabel: string,
): BitComparison => {
  const savedWords = new Uint32Array(saved.buffer);
  const restoredWords = new Uint32Array(restored.buffer);

  for (let texel = 0; texel < WIDTH * WIDTH; texel++) {
    const wordIndex = texel * 4 + channelOffset;
    if (savedWords[wordIndex] !== restoredWords[wordIndex]) {
      return {
        identical: false,
        firstDifference:
          `${channelLabel} at texel ${String(texel)} ` +
          `(column ${String(texel % WIDTH)}, row ${String(Math.floor(texel / WIDTH))}): ` +
          `saved bits 0x${String(savedWords[wordIndex].toString(16).padStart(8, "0"))}` +
          ` (${String(saved[wordIndex])}) vs restored bits ` +
          `0x${String(restoredWords[wordIndex].toString(16).padStart(8, "0"))}` +
          ` (${String(restored[wordIndex])})`,
      };
    }
  }

  return { identical: true, firstDifference: null };
};

/** Assert one channel of a saved field came back bit for bit. */
const assertChannelRestored = (
  saved: Float32Array,
  restored: Float32Array,
  channelOffset: number,
  channelLabel: string,
): void => {
  const comparison = compareBits(saved, restored, channelOffset, channelLabel);
  assert(
    comparison.identical,
    `restored ${String(comparison.firstDifference ?? channelLabel)}`,
  );
};

/** Assert every substance channel of the water column matches, then the ground's bacterial channel. */
const assertBothCompartmentsIdentical = (
  saved: { waterQualityData: Float32Array; terrainQualityData: Float32Array },
  restoredGraph: Graph,
): void => {
  const restoredWater = readPixels(
    restoredGraph,
    restoredGraph.waterQualityVariable,
  );
  for (let channel = 0; channel < WATER_CHANNEL_LABELS.length; channel++) {
    assertChannelRestored(
      saved.waterQualityData,
      restoredWater,
      channel,
      WATER_CHANNEL_LABELS[channel],
    );
  }

  assertChannelRestored(
    saved.terrainQualityData,
    readPixels(restoredGraph, restoredGraph.terrainQualityVariable),
    CHANNEL_SOIL_BACTERIA,
    "ground.r (bacteria bound to the bed)",
  );
};

/** Kahan-compensated strided sum: the shader is float32, the checker must not be (plan S8). */
const kahanSum = (pixels: Float32Array, channelOffset: number): number => {
  let sum = 0.0;
  let compensation = 0.0;
  for (let index = channelOffset; index < pixels.length; index += 4) {
    const value = pixels[index];
    const adjusted = value - compensation;
    const total = sum + adjusted;
    compensation = total - sum - adjusted;
    sum = total;
  }
  return sum;
};

const countNonZero = (pixels: Float32Array, channelOffset: number): number => {
  let populated = 0;
  for (let index = channelOffset; index < pixels.length; index += 4) {
    if (pixels[index] !== 0.0) {
      populated++;
    }
  }
  return populated;
};

/** Largest absolute per-channel gap between two float snapshots. */
const worstDifference = (
  left: Float32Array,
  right: Float32Array,
  channelOffset: number,
): number => {
  let worst = 0.0;
  for (let index = channelOffset; index < left.length; index += 4) {
    worst = Math.max(worst, Math.abs(left[index] - right[index]));
  }
  return worst;
};

/** A snapshot written before the substance keys existed, at this suite's grid size. */
const preSubstanceSnapshot = (width: number): string =>
  JSON.stringify({
    heightMapData: [],
    waterHeightData: [],
    velocityData: [],
    sedimentData: [],
    cloudsData: [],
    surfaceMaterialData: [],
    width,
    height: width,
    gameTime: 3.5,
  });

/** Soil bacteria standing on the dry strip, where no exchange term can ever reach them. */
const dryStripSoilBacteria = (groundPixels: Float32Array): number => {
  let total = 0.0;
  for (let row = 0; row < WIDTH; row++) {
    for (let column = DRY_START_COLUMN; column < WIDTH; column++) {
      total +=
        groundPixels[texelIndex(column, row) * 4 + CHANNEL_SOIL_BACTERIA];
    }
  }
  return total;
};

// ---------------------------------------------------------------------------
// The snapshot has to contain both compartments at all
// ---------------------------------------------------------------------------

await test("the snapshot carries the water column and the ground", async () => {
  const graph = createGraph();
  computePasses(graph, PASS_COUNT_BEFORE_SAVE);

  const committed = readCompartments(graph);

  // Preconditions first: if either compartment were empty, everything asserted below would be vacuously true of a
  // snapshot holding nothing. The dry strip's soil bacteria are the sharpest case - mass that only the ground
  // compartment can hold, so it cannot have arrived there by way of the water column.
  assert(
    countNonZero(committed.water, 3) > 0 &&
      countNonZero(committed.ground, CHANNEL_SOIL_BACTERIA) > 0,
    `pre-save state is empty: ${String(countNonZero(committed.water, 3))} texels of water bacteria, ` +
      `${String(countNonZero(committed.ground, CHANNEL_SOIL_BACTERIA))} with soil bacteria`,
  );
  const drySoil = dryStripSoilBacteria(committed.ground);
  assert(
    drySoil > 0.1,
    `no bacteria on the dry strip to lose: ${String(drySoil)}`,
  );

  const state = saveState(graph);

  // Reading the right field, not merely *a* full-length field: the saved bytes have to equal what that Variable
  // holds right now, or a save could write velocity into a substance slot and still produce plausible-looking data.
  for (const [label, saved, live] of [
    ["water quality", state.waterQualityData, committed.water],
    ["terrain quality", state.terrainQualityData, committed.ground],
  ] as const) {
    for (let channel = 0; channel < 4; channel++) {
      assertChannelRestored(
        saved,
        live,
        channel,
        `${label} channel ${String(channel)}`,
      );
    }
    for (let index = 0; index < saved.length; index++) {
      assert(
        Number.isFinite(saved[index]),
        `${label} word ${String(index)} is not finite: ${String(saved[index])}`,
      );
    }
  }

  console.log(
    `[substance:save] snapshot holds both compartments: ${String(countNonZero(committed.water, 3))} texels of water bacteria, ` +
      `${String(drySoil)} soil bacteria on the dry strip`,
  );
  completedScenarios += 1;
});

await test("the JSON format round-trips both compartments", async () => {
  const graph = createGraph();
  computePasses(graph, PASS_COUNT_BEFORE_SAVE);
  const state = saveState(graph);

  // Independent copies of the saved bytes: createTexturesFromState wraps the state's own arrays rather than cloning
  // them, so comparing against those buffers could not disagree with itself.
  const savedWater = new Float32Array(state.waterQualityData);
  const savedGround = new Float32Array(state.terrainQualityData);

  const restored = roundTrip(state);
  assert(
    restored.waterQualityData !== null,
    "water quality did not survive the JSON round trip: key mismatch or lost field",
  );
  assert(
    restored.terrainQualityData !== null,
    "terrain quality did not survive the JSON round trip: key mismatch or lost field",
  );

  // float32 -> number -> string -> number -> float32 is exact for finite values, so bits are the right test: a
  // difference means the mapping dropped or renamed something, not that arithmetic drifted.
  assertChannelRestored(
    savedWater,
    restored.waterQualityData,
    0,
    "water quality through JSON",
  );
  assertChannelRestored(
    savedGround,
    restored.terrainQualityData,
    0,
    "terrain quality through JSON",
  );

  const populatedInFormat = countNonZero(restored.waterQualityData, 3);
  assert(
    populatedInFormat === countNonZero(savedWater, 3),
    `the format changed how much of the water column is populated: ${String(countNonZero(savedWater, 3))} -> ${String(populatedInFormat)}`,
  );

  assert(
    restored.width === state.width && restored.height === state.height,
    `restored grid size ${String(restored.width)}x${String(restored.height)} != saved ${String(state.width)}x${String(state.height)}`,
  );

  console.log(
    `[substance:save] both compartments survive the JSON format bit for bit over ${String(savedWater.length / 4)} texels`,
  );
  completedScenarios += 1;
});

// ---------------------------------------------------------------------------
// A restored graph is the same state, in both compartments
// ---------------------------------------------------------------------------

await test("restore -> recreate is byte-stable for both compartments", async () => {
  const graph = createGraph();
  computePasses(graph, PASS_COUNT_BEFORE_SAVE);
  const state = saveState(graph);

  // Storage.ts's route on load: bytes -> textures -> a brand new graph seeded by them. No compute() may run before
  // reading it back, or physics would move the very state this scenario measures.
  const restoredGraph = recreateFrom(state);
  assertBothCompartmentsIdentical(state, restoredGraph);

  // The ground texture's unused channels must come back as they were written rather than as uninitialized texels: a
  // one in G would read as mass for any future species assigned that channel.
  const restoredGround = readPixels(
    restoredGraph,
    restoredGraph.terrainQualityVariable,
  );
  for (const unusedChannel of [1, 2, 3]) {
    assert(
      countNonZero(restoredGround, unusedChannel) === 0 &&
        countNonZero(state.terrainQualityData, unusedChannel) === 0,
      `ground channel ${String(unusedChannel)} holds mass; the field is written as zeros`,
    );
  }

  console.log(
    "[substance:save] byte-stable across save -> recreate for all four water channels and the ground compartment",
  );
  completedScenarios += 1;
});

await test("restoring the pair keeps the whole bacterial census", async () => {
  const graph = createGraph();
  computePasses(graph, PASS_COUNT_BEFORE_SAVE);
  const state = saveState(graph);

  // Total bacteria is what this model defines as invariant except for decay - and decay is off here, so it is exactly
  // conserved across a pass and must be exactly conserved across a load too.
  const committed = readCompartments(graph);
  const waterBeforeSave = kahanSum(committed.water, 3);
  const groundBeforeSave = kahanSum(committed.ground, CHANNEL_SOIL_BACTERIA);

  const restoredGraph = recreateFrom(state);
  const restored = readCompartments(restoredGraph);
  const waterAfterRestore = kahanSum(restored.water, 3);
  const groundAfterRestore = kahanSum(restored.ground, CHANNEL_SOIL_BACTERIA);

  assert(
    Math.abs(
      waterAfterRestore +
        groundAfterRestore -
        (waterBeforeSave + groundBeforeSave),
    ) <= RESTORED_TOLERANCE,
    `the census moved across save/load: ${String(waterBeforeSave + groundBeforeSave)} before, ` +
      `${String(waterAfterRestore + groundAfterRestore)} after`,
  );

  // And the split between compartments has to be preserved too. Equal totals in the wrong proportions would still be
  // wrong - it would mean one compartment was restored from the other's bytes, or that only one of them came back.
  assert(
    Math.abs(waterAfterRestore - waterBeforeSave) <= RESTORED_TOLERANCE &&
      Math.abs(groundAfterRestore - groundBeforeSave) <= RESTORED_TOLERANCE,
    `the compartments came back in the wrong proportions: ${String(waterBeforeSave)} water / ${String(groundBeforeSave)} soil became ` +
      `${String(waterAfterRestore)} / ${String(groundAfterRestore)}`,
  );

  console.log(
    `[substance:save] census intact: ${String(waterBeforeSave)} in the column + ${String(groundBeforeSave)} in the soil`,
  );
  completedScenarios += 1;
});

// ---------------------------------------------------------------------------
// Format compatibility and continuation
// ---------------------------------------------------------------------------

await test("a snapshot from before substances existed restores empty fields", async () => {
  // Files written before this feature simply lack the keys. The correct reading of absence is "no data", which
  // createTexturesFromState turns into a zero-filled field - what a fresh world starts with - rather than an image
  // with no texels in it, which is what a naive `data ? new Float32Array(data) : null` does to an empty array.
  const state = deserializeGPUSimulationState(preSubstanceSnapshot(WIDTH));
  assert(
    state.waterQualityData === null && state.terrainQualityData === null,
    "absent substance keys did not read as missing data",
  );
  assert(
    state.gameTime === 3.5,
    "an older snapshot's game time did not survive",
  );

  const textures = createTexturesFromState(state);
  for (const [label, texture] of [
    ["waterQualityTexture", textures.waterQualityTexture],
    ["terrainQualityTexture", textures.terrainQualityTexture],
  ] as const) {
    const data = texture.image.data;
    // A guard rather than an assertion: this is the field createTexturesFromState built, and if it ever stops being
    // float32 the suite should say so instead of reading garbage out of a typed-array union.
    assert(
      data instanceof Float32Array,
      `${label} is not a float32 field: ${String(data)}`,
    );
    assert(
      data.length === WIDTH * WIDTH * 4,
      `${label} was zero filled to ${String(data.length)} floats, expected ${String(WIDTH * WIDTH * 4)}`,
    );
    for (let index = 0; index < data.length; index++) {
      assert(
        data[index] === 0 && Number.isFinite(data[index]),
        `${label} word ${String(index)} is not a clean zero: ${String(data[index])}`,
      );
    }
  }

  // And a world seeded from those fields has to run without conjuring mass out of an unset texture.
  const graph = recreateFrom(state);
  computePasses(graph, 2);

  const committed = readCompartments(graph);
  for (let channel = 0; channel < 4; channel++) {
    assert(
      countNonZero(committed.water, channel) === 0 &&
        countNonZero(committed.ground, channel) === 0,
      `a world loaded without substance data grew mass in channel ${String(channel)}`,
    );
  }

  console.log(
    "[substance:save] pre-substance snapshots load as clean empty fields and stay empty",
  );
  completedScenarios += 1;
});

await test("a restored world continues where the saved one stopped", async () => {
  const graph = createGraph();
  computePasses(graph, PASS_COUNT_BEFORE_SAVE);
  const state = saveState(graph);
  const restoredGraph = recreateFrom(state);
  // Precondition: the two graphs start on byte-identical state, so any divergence below came from the continuation.
  assertBothCompartmentsIdentical(state, restoredGraph);

  // Both graphs now run the same physics from what must be the same state. Any divergence after a few passes means
  // restore put committed data where the simulation does not read it - into only one of the two ping-pong buffers,
  // say, which no single-pass byte comparison can see because GCR only ever reads the target compute() last wrote.
  computePasses(graph, PASS_COUNT_AFTER_RESTORE);
  computePasses(restoredGraph, PASS_COUNT_AFTER_RESTORE);

  const live = readCompartments(graph);
  const continued = readCompartments(restoredGraph);

  assert(
    kahanSum(live.water, 3) > 0.1,
    `no bacteria anywhere after continuing: ${String(kahanSum(live.water, 3))}`,
  );

  for (let channel = 0; channel < WATER_CHANNEL_LABELS.length; channel++) {
    assert(
      worstDifference(live.water, continued.water, channel) <=
        CONTINUATION_TOLERANCE,
      `after continuing, ${WATER_CHANNEL_LABELS[channel]} diverged by ${String(worstDifference(live.water, continued.water, channel))}`,
    );
  }
  const groundDivergence = worstDifference(
    live.ground,
    continued.ground,
    CHANNEL_SOIL_BACTERIA,
  );
  assert(
    groundDivergence <= CONTINUATION_TOLERANCE,
    `after continuing, ground.r (soil bacteria) diverged by ${String(groundDivergence)}`,
  );

  console.log(
    `[substance:save] restored world matches the saved one after ${String(PASS_COUNT_AFTER_RESTORE)} further passes`,
  );
  completedScenarios += 1;
});

// Announce completion for the playwright wrapper: reaching this line with the expected count means no invariant was
// violated along the way.
assert(
  completedScenarios === SCENARIO_COUNT,
  `only ${String(completedScenarios)} of ${String(SCENARIO_COUNT)} substance save/load scenarios completed`,
);
document.body.dataset.substanceSaveLoadTestsComplete =
  String(completedScenarios);
