import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import {
  createTexturesFromState,
  saveGPUSimulationState,
} from "@/gpu/waterFlowSimulation/saveLoadSimulationState.ts";
import { createGpuSedimentFlow } from "@/gpu/waterFlowSimulation/variables/createGpuSedimentFlow.ts";
import { createGpuTerrainHeight } from "@/gpu/waterFlowSimulation/variables/createGpuTerrainHeight.ts";

import { test } from "./clientTestUtils.ts";
import fixturePassthroughShader from "./fixture-passthrough.frag?raw";

// Plan S7's mandated regression: "save -> recreate -> save is byte-stable while paused".
//
// Why this needs a test at all (S7 + A1): channel A of the sediment texture is not a rate, it is the one-off
// signed bed delta that terrain-height.frag adds to the bed on the next committed step. saveGPUSimulationState
// copies all four channels of both render targets, so the suspended load and its pending bed change are a pair:
// if restoration does not put both back exactly as they were committed - or re-blits one of them with a
// different orientation - that transient delta lands twice and silently mints or destroys mass. Nothing else in
// the suite touches save/load for sediment at all, so this file owns it (verified: no other test imports
// src/gpu/waterFlowSimulation/saveLoadSimulationState.ts).
//
// Harness is plan A14's mini-graph copied from tests/test-gpu-sediment-flow.ts on purpose (TESTING.md accepts
// the duplication to keep each suite standalone): real sediment variable, real bed integrator, synthetic static
// waterVelocity / waterHeight so every gram of movement in the grid is attributable.

const WIDTH = 16;

// Fixture geometry, same as the transport suite: a flat base puts bedrock at a constant, which keeps
// "erosion was limited by availability rather than the floor" readable off the numbers.
const BASE_HEIGHT = 1.0;
const ERODIBLE_DEPTH = 0.35; // A8 default for erodibleDepth
const BEDROCK = BASE_HEIGHT - ERODIBLE_DEPTH;

const CHANNEL_SPEED = 0.3;
const POND_START_X = 12; // columns at/after this hold still water: transport ends, deposition begins

// Pass count is chosen so all three non-vacuity conditions below hold at once (the scenario asserts them).
const PASSES_BEFORE_SAVE = 4;

// Restoration must not move mass by any amount, so this budget is exactly zero rather than a small number:
// byte-stable state sums to the same Kahan total because it *is* the same state. A nonzero difference here is
// restoration altering committed data, which is precisely the failure S7 warns about - forgiving it with an
// epsilon would forgive the bug too.
const RESTORED_TOTAL_TOLERANCE = 0.0;

// One pass on restored state must keep M* = sum(suspended + bed + scheduled delta) where physics put it (A13).
// Budget is plan A13's stated relative tolerance, 1e-4 of the grid's mass (~230 bed units for this fixture); the
// measured drift of the restored pass is printed by the scenario and sat orders below it.
const CONSERVED_RELATIVE_TOLERANCE = 1e-4;

type ScalarField = (column: number, row: number) => number;

type FixtureFields = {
  baseHeight: ScalarField;
  bed: ScalarField;
  depth: ScalarField;
  velocityX: ScalarField;
  velocityY: ScalarField;
};

/** Flowing channel into a pond: erodes on the way, deposits in the pond, so both exchanges are live. */
const channelFields: FixtureFields = {
  baseHeight: () => BASE_HEIGHT,
  bed: (column) => Math.max(BEDROCK, 0.95 - 0.02 * column),
  depth: () => 0.5,
  velocityX: (column) => (column < POND_START_X ? CHANNEL_SPEED : 0.0),
  velocityY: () => 0.0,
};

/** Texel index of a fixture coordinate under readRenderTargetPixels (bottom-left origin, row-major). */
const texelIndex = (column: number, row: number): number =>
  row * WIDTH + column;

/** Float channel offsets within a texel. */
const CHANNEL_BED = 0; // heightMap.r
const CHANNEL_LOAD = 2; // sedimentFlow.b
const CHANNEL_SCHEDULED_DELTA = 3; // sedimentFlow.a: the transient this test is about

type BitComparison = {
  identical: boolean;
  firstDifference: string | null;
};

/**
 * Exact bit equality over two float snapshots, compared as raw IEEE-754 words. Deliberately no epsilon: S7's
 * claim is that a restored state is the *same* state, and only bits can say that - +-0 and NaN payloads are
 * exactly what an approximate comparison would forgive.
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

/** Throwing checker that also narrows for the compiler, so `assert(value !== null, ...)` removes the null. */
type AssertFn = (condition: boolean, message: string) => asserts condition;

const assert: AssertFn = (condition, message) => {
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
    compensation = total - sum - adjusted;
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
      const channelIndex = texelIndex(column, row) * 4;
      data[channelIndex] = fields.red(column, row);
      data[channelIndex + 1] = fields.green(column, row);
      data[channelIndex + 2] = fields.blue(column, row);
      data[channelIndex + 3] = fields.alpha(column, row);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    WIDTH,
    WIDTH,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  // A14: flipY = false makes fixture index equal texel index under readRenderTargetPixels.
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
};

/** A variable re-emitting its own seeded value every pass: a boundary condition the harness owns (A14). */
const addFixtureVariable = (
  gpuCompute: GPUComputationRenderer,
  name: "waterVelocity" | "waterHeight" | "cloudDensity",
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

/** Static inputs are rebuilt identically for both graphs; only the dynamic state comes back through save/load. */
const addStaticFixtures = (gpuCompute: GPUComputationRenderer) => {
  const waterVelocityVariable = addFixtureVariable(
    gpuCompute,
    "waterVelocity",
    createFixtureTexture({
      red: channelFields.velocityX,
      green: channelFields.velocityY,
      blue: (column, row) =>
        Math.hypot(
          channelFields.velocityX(column, row),
          channelFields.velocityY(column, row),
        ),
      alpha: () => 1.0,
    }),
  );
  const waterHeightVariable = addFixtureVariable(
    gpuCompute,
    "waterHeight",
    createFixtureTexture({
      red: channelFields.depth,
      green: () => 0.0,
      blue: () => 0.0,
      alpha: () => 1.0,
    }),
  );
  // saveGPUSimulationState reads five render targets, clouds included; in this mini-graph clouds are a static
  // boundary condition and only have to exist with something committed in them.
  const cloudVariable = addFixtureVariable(
    gpuCompute,
    "cloudDensity",
    createFixtureTexture({
      red: () => 0.25,
      green: () => 0.0,
      blue: () => 0.0,
      alpha: () => 1.0,
    }),
  );
  return { waterVelocityVariable, waterHeightVariable, cloudVariable };
};

/** Seed for the second graph: the textures save/load hands back, instead of freshly authored fixtures. */
type RestoredSeed = {
  bedTexture: THREE.DataTexture;
  sedimentTexture: THREE.DataTexture;
};

const createSedimentGraph = (restored?: RestoredSeed) => {
  const gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
  const { waterVelocityVariable, waterHeightVariable, cloudVariable } =
    addStaticFixtures(gpuCompute);

  // The base map is scene content, not simulation state: both graphs get the same one, and it doubles as the
  // immovable bedrock floor uBaseHeightMap (A2).
  const baseHeightMapTexture = createFixtureTexture({
    red: channelFields.baseHeight,
    green: () => 0.0,
    blue: () => 0.0,
    alpha: () => 1.0,
  });

  // Bed seed: authored fixture for graph one, restored render-target contents for graph two - that override is
  // exactly the save/load path under test (createGpuTerrainHeight's savedTexture parameter).
  const authoredBedTexture = createFixtureTexture({
    red: channelFields.bed,
    green: () => 0.0,
    blue: () => 0.0,
    alpha: () => 1.0,
  });
  const bedSeedTexture =
    restored === undefined ? authoredBedTexture : restored.bedTexture;
  const { heightMapVariable, linkBedToSediment } = createGpuTerrainHeight(
    gpuCompute,
    WIDTH,
    baseHeightMapTexture,
    bedSeedTexture,
  );

  const { sedimentFlowVariable, updateSedimentFlow, getSedimentFlowUniforms } =
    createGpuSedimentFlow(
      gpuCompute,
      WIDTH,
      baseHeightMapTexture,
      waterVelocityVariable,
      waterHeightVariable,
      heightMapVariable,
      null, // no surface material map: exercises the module-private 1x1 all-dirt fallback (A8)
      // suspended load AND its pending bed delta, as a pair (S7)
      restored === undefined ? undefined : restored.sedimentTexture,
    );

  linkBedToSediment(sedimentFlowVariable);

  const initError = gpuCompute.init();
  assert(initError === null, `gpuCompute.init() failed: ${initError}`);

  return {
    gpuCompute,
    heightMapVariable,
    sedimentFlowVariable,
    waterVelocityVariable,
    waterHeightVariable,
    cloudVariable,
    sedimentUniforms: getSedimentFlowUniforms(),
    updateSedimentFlow,
  };
};

type SedimentGraph = ReturnType<typeof createSedimentGraph>;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(64, 64);
document.body.appendChild(renderer.domElement);

/** Commit exactly one pass at a nominal frame rate (S6). */
const computeOnce = (graph: SedimentGraph): void => {
  graph.updateSedimentFlow(1 / 60);
  graph.gpuCompute.compute();
};

/** Open exchange so bed movement is visible in a handful of passes rather than hundreds. */
const withFastExchange = (graph: SedimentGraph): void => {
  graph.sedimentUniforms.detachRate.value = 1.0;
  graph.sedimentUniforms.settleRate.value = 0.5;
};

/** Read one variable's committed render target into a fresh float buffer. */
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

/** The bed as it was authored into the fixture, for "the bed actually moved" checks. */
const seededBedValue = (column: number, row: number): number =>
  channelFields.bed(column, row);

let completedScenarios = 0;
const SCENARIO_COUNT = 3;

// A saved snapshot plus derived facts, kept as one object so the scenarios cannot disagree about which bytes
// they are talking about.
type SaveSnapshot = {
  sedimentPixels: Float32Array;
  bedPixels: Float32Array;
};

const readSnapshot = (graph: SedimentGraph): SaveSnapshot => ({
  sedimentPixels: readPixels(graph, graph.sedimentFlowVariable),
  bedPixels: readPixels(graph, graph.heightMapVariable),
});

await test("paused state is non-trivial before anything is saved", async () => {
  const graph = createSedimentGraph();
  withFastExchange(graph);
  for (let pass = 0; pass < PASSES_BEFORE_SAVE; pass++) {
    computeOnce(graph);
  }

  // "Paused": nothing below calls compute(). The state that gets saved is exactly what the last committed pass
  // left in the render targets, pending transient included.
  const snapshot = readSnapshot(graph);

  let bedMovedBy = 0.0;
  let maxLoad = 0.0;
  let maxScheduledDelta = 0.0;
  for (let row = 0; row < WIDTH; row++) {
    for (let column = 0; column < WIDTH; column++) {
      const channelIndex = texelIndex(column, row) * 4;
      bedMovedBy = Math.max(
        bedMovedBy,
        Math.abs(
          snapshot.bedPixels[channelIndex] - seededBedValue(column, row),
        ),
      );
      maxLoad = Math.max(maxLoad, snapshot.sedimentPixels[channelIndex + 2]);
      maxScheduledDelta = Math.max(
        maxScheduledDelta,
        Math.abs(
          snapshot.sedimentPixels[channelIndex + CHANNEL_SCHEDULED_DELTA],
        ),
      );
    }
  }

  // All three at once is the precondition that keeps byte stability meaningful: a state with no suspended load
  // and no pending delta would be saved and restored correctly by any broken implementation too, because there
  // would be nothing transient to get wrong.
  assert(
    bedMovedBy > 1e-6,
    `bed never moved from its seeded value (worst ${String(bedMovedBy)} after ${String(PASSES_BEFORE_SAVE)} passes): the scenario is inert`,
  );
  assert(
    maxLoad > 0.0,
    `no texel holds suspended load (max ${String(maxLoad)}): there would be no transient to restore`,
  );
  assert(
    maxScheduledDelta > 0.0,
    `no texel holds a scheduled bed delta (max ${String(maxScheduledDelta)}): channel A is the whole point of this test`,
  );

  console.log(
    `[sediment:save-load] pre-save state: bed moved by up to ${String(bedMovedBy)}, max load ${String(maxLoad)}, max |scheduled delta| ${String(maxScheduledDelta)}`,
  );
  completedScenarios += 1;
});

await test("save -> recreate -> save is byte-stable while paused", async () => {
  const graph = createSedimentGraph();
  withFastExchange(graph);
  for (let pass = 0; pass < PASSES_BEFORE_SAVE; pass++) {
    computeOnce(graph);
  }

  // The production entry point, not a test-local reimplementation: this is the code that decides what "state"
  // means on disk.
  const savedState = saveGPUSimulationState(
    {
      heightMapVariable: graph.heightMapVariable,
      waterHeightVariable: graph.waterHeightVariable,
      velocityVariable: graph.waterVelocityVariable,
      sedimentVariable: graph.sedimentFlowVariable,
      cloudVariable: graph.cloudVariable,
    },
    graph.gpuCompute,
    renderer,
  );
  assert(savedState !== null, "saveGPUSimulationState returned null");
  const state = savedState;

  // The snapshot is the saved bytes themselves - so a mismatch below means the round trip through
  // createTexturesFromState -> GCR seed blit -> render target changed bits, not that two readers disagreed.
  assert(state.sedimentData !== null, "saved sediment data is null");
  assert(state.heightMapData !== null, "saved height map data is null");
  // Independent copies of the saved bytes. createTexturesFromState wraps state.sedimentData itself rather than
  // cloning it, so comparing against the live array would let the restoration seed and the expected value share one
  // buffer - a comparison that can never disagree with itself. These copies are what gets compared.
  const savedSediment = new Float32Array(state.sedimentData);
  const savedBed = new Float32Array(state.heightMapData);

  for (const [label, values] of [
    ["saved sediment", savedSediment],
    ["saved bed", savedBed],
  ] as const) {
    for (let index = 0; index < values.length; index++) {
      assert(
        Number.isFinite(values[index]),
        `${label} word ${String(index)} is not finite: ${String(values[index])}`,
      );
    }
  }

  // Recreate: the restored textures seed a brand new graph, exactly as storage.ts does on load. No compute() may
  // run before reading it back, or the pending delta would be applied and this test would be measuring physics.
  const restoredTextures = createTexturesFromState(state);
  const restoredGraph = createSedimentGraph({
    bedTexture: restoredTextures.heightMapTexture,
    sedimentTexture: restoredTextures.sedimentTexture,
  });

  for (const [channelOffset, channelLabel] of [
    [0, "sediment.r (transport x)"],
    [1, "sediment.g (transport y)"],
    [2, "sediment.b (suspended load)"],
    [3, "sediment.a (scheduled bed delta)"],
  ] as const) {
    const comparison = compareBits(
      savedSediment,
      readPixels(restoredGraph, restoredGraph.sedimentFlowVariable),
      channelOffset,
      channelLabel,
    );
    assert(
      comparison.identical,
      `restored ${comparison.firstDifference ?? channelLabel}`,
    );
  }

  const bedComparison = compareBits(
    savedBed,
    readPixels(restoredGraph, restoredGraph.heightMapVariable),
    CHANNEL_BED,
    "heightmap.r (bed)",
  );
  assert(bedComparison.identical, `restored ${bedComparison.firstDifference}`);

  console.log(
    `[sediment:save-load] byte-stable across save -> recreate for all four sediment channels and the bed, over ${String(WIDTH * WIDTH)} texels`,
  );
  completedScenarios += 1;
});

await test("restoring as a pair leaves total mass where physics put it", async () => {
  const graph = createSedimentGraph();
  withFastExchange(graph);
  for (let pass = 0; pass < PASSES_BEFORE_SAVE; pass++) {
    computeOnce(graph);
  }

  const savedState = saveGPUSimulationState(
    {
      heightMapVariable: graph.heightMapVariable,
      waterHeightVariable: graph.waterHeightVariable,
      velocityVariable: graph.waterVelocityVariable,
      sedimentVariable: graph.sedimentFlowVariable,
      cloudVariable: graph.cloudVariable,
    },
    graph.gpuCompute,
    renderer,
  );
  assert(savedState !== null, "saveGPUSimulationState returned null");

  const restoredTextures = createTexturesFromState(savedState);
  const restoredGraph = createSedimentGraph({
    bedTexture: restoredTextures.heightMapTexture,
    sedimentTexture: restoredTextures.sedimentTexture,
  });
  withFastExchange(restoredGraph); // same coefficients the live graph ran with

  // M* = sum(suspended + bed + scheduled delta) is the quantity A13 defines as invariant per pass. The scheduled
  // delta belongs in the sum because load and delta are written by the same step (sNew = carried - D + influx,
  // A = D - E), so sNew + A is exactly what left this cell's ledger. Measuring M* across one restored pass asks
  // whether that pairing survived save/load: a stale alpha applied twice would move bed height that nothing
  // subtracted, and M* would jump by precisely the double-applied delta.
  const materialTotalOf = (target: SedimentGraph): number => {
    const sedimentPixels = readPixels(target, target.sedimentFlowVariable);
    const bedPixels = readPixels(target, target.heightMapVariable);
    return (
      kahanSum(sedimentPixels, CHANNEL_LOAD) +
      kahanSum(bedPixels, CHANNEL_BED) +
      kahanSum(sedimentPixels, CHANNEL_SCHEDULED_DELTA)
    );
  };

  const beforeRestore = materialTotalOf(graph);
  const afterRestoreBeforePass = materialTotalOf(restoredGraph);
  assert(
    Math.abs(afterRestoreBeforePass - beforeRestore) <=
      RESTORED_TOTAL_TOLERANCE,
    `restoring the pair changed total mass by ${String(afterRestoreBeforePass - beforeRestore)} (budget ${String(RESTORED_TOTAL_TOLERANCE)})`,
  );

  computeOnce(restoredGraph);
  const afterRestoredPass = materialTotalOf(restoredGraph);
  const drift = Math.abs(afterRestoredPass - afterRestoreBeforePass);
  // Relative, because the absolute total depends on fixture geometry: this grid carries ~230 bed units of mass.
  assert(
    drift <= CONSERVED_RELATIVE_TOLERANCE * Math.abs(beforeRestore),
    `one pass on restored state moved total mass by ${String(drift)} against a budget of ${String(CONSERVED_RELATIVE_TOLERANCE * Math.abs(beforeRestore))}`,
  );

  console.log(
    `[sediment:save-load] M* before save ${String(beforeRestore)}, after restore ${String(afterRestoreBeforePass)}, after one pass ${String(afterRestoredPass)}; drift ${String(drift)} relative to budget ${String(CONSERVED_RELATIVE_TOLERANCE * Math.abs(beforeRestore))}`,
  );
  completedScenarios += 1;
});

assert(
  completedScenarios === SCENARIO_COUNT,
  `only ${String(completedScenarios)} of ${String(SCENARIO_COUNT)} sediment save/load scenarios completed`,
);
document.body.dataset.sedimentSaveLoadTestsComplete =
  String(completedScenarios);
