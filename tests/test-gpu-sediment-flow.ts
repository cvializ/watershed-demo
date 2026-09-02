import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import { createGpuSedimentFlow } from "@/gpu/waterFlowSimulation/variables/createGpuSedimentFlow.ts";
import { createGpuTerrainHeight } from "@/gpu/waterFlowSimulation/variables/createGpuTerrainHeight.ts";

import { test } from "./clientTestUtils.ts";
import fixturePassthroughShader from "./fixture-passthrough.frag?raw";
import {
  advanceSedimentStep,
  createSedimentGrid,
  DEFAULT_SEDIMENT_PARAMS,
  type SedimentGrid,
  type SedimentParams,
} from "./sedimentReferenceModel.ts";

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

const createFixtureTexture = (
  fields: {
    red: ScalarField;
    green: ScalarField;
    blue: ScalarField;
    alpha: ScalarField;
  },
  // A14 keeps fixtures unflipped so fixture index equals texel index. The orientation probe uploads the base
  // map flipped instead, because that is how the app ships it (A15) and the probe exists to pin that choice.
  { flipY = false }: { flipY?: boolean } = {},
): THREE.DataTexture => {
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
  texture.flipY = flipY;
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

/** How a scenario's inputs are wired, as opposed to the numbers it runs on. */
type GraphOptions = {
  /**
   * Let `createGpuTerrainHeight` seed the bed from the base map instead of injecting a fixture bed. Every
   * other scenario overrides the bed precisely because that path carries the app's flipY convention (A15);
   * the orientation probe wants the convention itself, so it opts out of the override.
   */
  seedBedFromBaseMap?: boolean;
  /**
   * Bind this texture as the base map instead of building one from fields.baseHeight. The orientation probe uses
   * it to hand in a RedFormat / flipY = true map, i.e. exactly what src/scene/resources/textures/displacement.ts
   * uploads in production (A15) - and the shape createGpuTerrainHeight's own seed copy expects.
   */
  baseHeightMap?: THREE.DataTexture;
};

const createSedimentGraph = (
  fields: FixtureFields,
  options: GraphOptions = {},
) => {
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
  const baseHeightMapTexture =
    options.baseHeightMap ??
    createFixtureTexture(
      {
        red: fields.baseHeight,
        green: () => 0.0,
        blue: () => 0.0,
        alpha: () => 1.0,
      },
      { flipY: options.seedBedFromBaseMap === true },
    );
  const bedSeedTexture = createFixtureTexture({
    red: fields.bed,
    green: () => 0.0,
    blue: () => 0.0,
    alpha: () => 1.0,
  });
  const { heightMapVariable, linkBedToSediment } = createGpuTerrainHeight(
    gpuCompute,
    WIDTH,
    baseHeightMapTexture,
    options.seedBedFromBaseMap
      ? undefined // production seed: copy the base map through the app's own path (A15)
      : bedSeedTexture,
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

/** Texel index of a fixture coordinate, matching the readRenderTargetPixels layout (A14). */
const texelIndex = (column: number, row: number): number =>
  row * WIDTH + column;

/** Float channel offset within a texel: 0 bed / R, and 2 load, 3 scheduled delta for sedimentFlow. */
const CHANNEL_LOAD = 2;
const CHANNEL_SCHEDULED_DELTA = 3;

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
      const scheduledDelta =
        sedimentPixels[texelIndex(column, row) * 4 + CHANNEL_SCHEDULED_DELTA];
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
    const load = sedimentPixels[channelIndex + CHANNEL_LOAD];
    const scheduledDelta =
      sedimentPixels[channelIndex + CHANNEL_SCHEDULED_DELTA];
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
/** What a scenario may check about a single committed pass, on top of the invariants audited for all of them. */
type PassObserver = (context: {
  passIndex: number;
  previous: PassAudit;
  current: PassAudit;
}) => void;

const runAndAudit = (
  graph: SedimentGraph,
  passCount: number,
  onPass?: PassObserver,
) => {
  const initialAudit = auditPass(graph, -1); // seeded state, before any exchange
  let finalAudit = initialAudit;
  let previousAudit = initialAudit;
  let minScheduledDelta = 0.0; // most negative delta seen anywhere: erosion
  let maxScheduledDelta = 0.0; // most positive delta seen anywhere: deposition

  for (let passIndex = 0; passIndex < passCount; passIndex++) {
    graph.updateSedimentFlow(1 / 60); // dtScale for a nominal frame (S6)
    graph.gpuCompute.compute();
    finalAudit = auditPass(graph, passIndex);
    if (onPass !== undefined) {
      onPass({ passIndex, previous: previousAudit, current: finalAudit });
    }
    previousAudit = finalAudit;

    const scheduledDeltas = readPixels(graph, graph.sedimentFlowVariable);
    for (let texel = 0; texel < WIDTH * WIDTH; texel++) {
      const scheduledDelta =
        scheduledDeltas[texel * 4 + CHANNEL_SCHEDULED_DELTA];
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
const SCENARIO_COUNT = 14;

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

    // Pinned rather than inherited, because this scenario reads a ratio out of one pass and that only works while
    // no cell saturates against `carried`: settling is bounded by dtScale * settleRate * factor * 8 (dry cells get
    // the still-water boost), so the measured table stays honest only below settleRate = 1 / (8 * 1.5). Inheriting
    // the module default would mean a later retune of A8's rates silently turns this assertion into 1.0 == 1.0.
    graph.sedimentUniforms.settleRate.value = 0.06;

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

// ---------------------------------------------------------------------------
// Plan A17 step 6: the §S8 rows that were still open - single hop symmetry, erosion mass-neutrality per step,
// border retention, availability-limited exchange and seed orientation (A15) - plus CPU/GPU parity against
// tests/sedimentReferenceModel.ts. Parity is what turns "the invariants hold on the GPU" into "the GPU computes
// the algorithm the reference model documents": conservation alone can be satisfied by a shader that quietly
// stops exchanging material, and only texel-for-texel agreement rules that out.
//
// All ten §S8 rows, with the scenario on this page that owns each. tests/unit/sedimentConservation.test.ts
// proves the same rows without a GPU; these are the ones that need a real render target:
//   closed basin conserves total mass ... "erosion and deposition conserve M* while a channel cuts towards its floor"
//   single hop symmetry ............... "one cell exports to exactly the neighbour it routes to"
//   erosion is mass-neutral ........... "erosion is mass-neutral: the bed's loss is the water's gain"
//   deposition is mass-neutral ........ "deposition in still water is mass-neutral to the gram" (load fans out of a channel into a still, shallow pool)
//   no leak at domain border .......... "load driven at the domain edge stays inside the grid"
//   erosion limited by availability ... "exhausted soil stops the cut instead of minting load"
//   clamps return mass ................ "absurd rates still conserve mass and never cross the floor"
//   zero water = deposit in place ..... the dry, still control cell inside "one cell exports to exactly the neighbour it routes to"
//   deterministic replay .............. "identical fixtures replay bit-for-bit" (all four channels)
//   seed orientation .................. "the bed's seed and the sediment's land at matching UVs"
//
// §S8 then asks for one more thing below its table - "assert GPU output matches [the reference model] on a 16x16
// fixture" - which is the last scenario here, "the CPU reference model reproduces the GPU texel for texel".

/** Machine epsilon of float32: the format the shader computes in, so the unit round-off is 6e-8 (S8). */
const FLOAT_EPSILON = 6e-8;
/**
 * A handful of ulps. Round-off lives here; anything structural is orders of magnitude larger - a mis-routed hop
 * moves a whole transferCap fraction, and measured on this suite the quantities compared with this budget come out
 * exact (a single hop exports and imports 0.125 on both sides of the CPU/GPU boundary).
 */
const FLOAT_TOLERANCE = 4 * FLOAT_EPSILON;

/** Uniforms and reference-model params are one set of numbers, so parity compares like with like (A8). */
const paramsWith = (overrides: Partial<SedimentParams>): SedimentParams => ({
  ...DEFAULT_SEDIMENT_PARAMS,
  ...overrides,
});

const applyParams = (graph: SedimentGraph, params: SedimentParams): void => {
  const uniforms = graph.sedimentUniforms;
  uniforms.erosionCoefficient.value = params.erosionCoefficient;
  uniforms.capacityExponent.value = params.capacityExponent;
  uniforms.criticalSpeed.value = params.criticalSpeed;
  uniforms.detachRate.value = params.detachRate;
  uniforms.settleRate.value = params.settleRate;
  uniforms.transferCap.value = params.transferCap;
  uniforms.erodibleDepth.value = params.erodibleDepth;
};

/** The same fixture in the reference model's representation: one source of inputs for both sides. */
const referenceGridFrom = (fields: FixtureFields): SedimentGrid =>
  createSedimentGrid(WIDTH, {
    baseHeight: fields.baseHeight,
    bed: fields.bed,
    depth: fields.depth,
    velocityX: fields.velocityX,
    velocityY: fields.velocityY,
    load: fields.load,
    // A8: no painted map means the module-private all-dirt texture, and dirt is the neutral pair of factors.
    material: fields.material ?? (() => MATERIAL_BARE_DIRT),
  });

/** Rates that bound how fast mass moves but never where it goes (S6/A3): transport with exchange switched off. */
const TRANSPORT_ONLY_PARAMS = paramsWith({
  detachRate: 0.0,
  settleRate: 0.0,
});

// ---------------------------------------------------------------------------

/** Interior cell with all eight neighbours present, so "the neighbour it routes to" has no ambiguity. */
const HOP_SOURCE = { column: 4, row: 9 };
const HOP_LOAD = 0.25; // a quarter of a bed-equivalent unit: exactly representable in float32

/** Dry and still: capacity zero, depth zero, velocity zero - a load here has nowhere to go (§S8 row). */
const DRY_STILL_CELL = { column: 12, row: 3 };

/** One cell of load in an otherwise empty grid, with the flow only there (§S8 "single hop symmetry"). */
const hopFields: FixtureFields = {
  baseHeight: () => BASE_HEIGHT,
  bed: () => 0.9, // flat, so nothing about shear can be blamed for where mass ends up
  depth: (column, row) =>
    column === DRY_STILL_CELL.column && row === DRY_STILL_CELL.row ? 0.0 : 0.5,
  velocityX: (column, row) =>
    column === HOP_SOURCE.column && row === HOP_SOURCE.row
      ? CHANNEL_SPEED
      : 0.0,
  velocityY: () => 0.0, // due east: DIRECTION_STEPS index 2, i.e. +1 column at the same row (A4)
  load: (column, row) =>
    column === HOP_SOURCE.column && row === HOP_SOURCE.row
      ? HOP_LOAD
      : column === DRY_STILL_CELL.column && row === DRY_STILL_CELL.row
        ? HOP_LOAD // the dry, still control below
        : 0.0,
};

await test("one cell exports to exactly the neighbour it routes to", async () => {
  const graph = createSedimentGraph(hopFields);
  applyParams(graph, TRANSPORT_ONLY_PARAMS); // advection is then the only term alive

  // Ask the reference model who moved what first: if it does not pair this hop, comparing anything against it
  // would prove nothing, and that has to be a failure rather than an silently-agreeing pair of zeros.
  const reference = advanceSedimentStep(
    referenceGridFrom(hopFields),
    TRANSPORT_ONLY_PARAMS,
  );
  const sourceIndex = texelIndex(HOP_SOURCE.column, HOP_SOURCE.row);
  const targetIndex = texelIndex(HOP_SOURCE.column + 1, HOP_SOURCE.row);
  const exportedByModel = reference.terms.outflux[sourceIndex];
  assert(
    exportedByModel > 0.0 && exportedByModel < HOP_LOAD,
    `reference model exported ${String(exportedByModel)} of load ${String(HOP_LOAD)}`,
  );
  assert(
    reference.terms.influx[targetIndex] === exportedByModel,
    "reference model's import does not equal its export; the harness has nothing to compare against",
  );

  computeOnce(graph); // one hop only: fresh erosion would not be transportable for another step anyway (A3)
  const pixels = readPixels(graph, graph.sedimentFlowVariable);
  const bedPixels = readPixels(graph, graph.heightMapVariable);

  // Zero water = deposit in place (§S8): a load on dry, still ground can neither be carried - capacity and depth
  // are both zero - nor deposited, since deposition comes from max(0, capacity - depth) with both terms zero. So
  // that cell's gram count may not shift by so much as a rounding step, and the bed under it may not move. This is
  // where a shader that lets load evaporate over dry ground shows up, which is why the control rides along here.
  const dryIndex = texelIndex(DRY_STILL_CELL.column, DRY_STILL_CELL.row);
  assert(
    pixels[dryIndex * 4 + CHANNEL_LOAD] === HOP_LOAD,
    `a dry, still cell lost load: ${String(pixels[dryIndex * 4 + CHANNEL_LOAD])} of ${String(HOP_LOAD)} left`,
  );
  assert(
    pixels[dryIndex * 4 + CHANNEL_SCHEDULED_DELTA] === 0.0,
    `a dry, still cell scheduled bed delta ${String(pixels[dryIndex * 4 + CHANNEL_SCHEDULED_DELTA])}`,
  );
  // Within a few ulps rather than exactly: the load above is 0.25, which float32 holds exactly, while this seeded
  // bed of 0.9 does not survive the round trip as a double - and an actual deposit would be orders larger.
  assert(
    Math.abs(bedPixels[dryIndex * 4] - 0.9) <= FLOAT_TOLERANCE,
    `the bed under a dry, still cell moved to ${String(bedPixels[dryIndex * 4])} from 0.9`,
  );

  // Export and import are read as two independent measurements of one number: what the source lost, and what the
  // neighbour gained. Both sides of A4's symmetry have to land on the model's flux within a few ulps.
  const exportedByGpu = HOP_LOAD - pixels[sourceIndex * 4 + CHANNEL_LOAD];
  const importedByGpu = pixels[targetIndex * 4 + CHANNEL_LOAD];
  assert(
    Math.abs(exportedByGpu - exportedByModel) <= FLOAT_TOLERANCE,
    `source export ${String(exportedByGpu)} vs reference model ${String(exportedByModel)}`,
  );
  assert(
    Math.abs(importedByGpu - exportedByModel) <= FLOAT_TOLERANCE,
    `neighbour import ${String(importedByGpu)} vs reference model ${String(exportedByModel)}`,
  );
  assert(
    Math.abs(importedByGpu - exportedByGpu) <= FLOAT_TOLERANCE,
    `hop is asymmetric: source lost ${String(exportedByGpu)}, neighbour gained ${String(importedByGpu)}`,
  );

  // A hop, not a smear: no other texel may move at all. This is what catches routing through the wrong table
  // entry (diagonals included), or an influx loop that accepts a neighbour which does not route back.
  for (let row = 0; row < WIDTH; row++) {
    for (let column = 0; column < WIDTH; column++) {
      const index = texelIndex(column, row);
      if (
        index === sourceIndex ||
        index === targetIndex ||
        index === dryIndex // the control above is checked on its own terms
      ) {
        continue;
      }
      const untouched = pixels[index * 4 + CHANNEL_LOAD];
      assert(
        untouched === 0.0,
        `texel (${String(column)}, ${String(row)}) holds load ${String(untouched)} after a single hop`,
      );
    }
  }

  // The debug view's direction channel records the same route (section 4.1): unit east at the source, and dead
  // calm in the diagonal neighbour that must NOT have received anything.
  const sourceDirectionX = pixels[sourceIndex * 4];
  const sourceDirectionY = pixels[sourceIndex * 4 + 1];
  assert(
    Math.abs(sourceDirectionX - 1.0) <= FLOAT_TOLERANCE &&
      Math.abs(sourceDirectionY) <= FLOAT_TOLERANCE,
    `source direction channel reads (${String(sourceDirectionX)}, ${String(sourceDirectionY)}), expected due east`,
  );
  const diagonalIndex = texelIndex(HOP_SOURCE.column + 1, HOP_SOURCE.row + 1);
  assert(
    pixels[diagonalIndex * 4] === 0.0 && pixels[diagonalIndex * 4 + 1] === 0.0,
    "the northeast neighbour has a transport direction with no flow behind it",
  );

  console.log(
    `[sediment:single-hop] exported=${String(exportedByGpu)} imported=${String(importedByGpu)} (model ${String(exportedByModel)}), dry-cell load kept ${String(pixels[dryIndex * 4 + CHANNEL_LOAD])}`,
  );
});
completedScenarios += 1;

// ---------------------------------------------------------------------------

/** Uniform slope, wet and flowing everywhere: erosion is available at every texel (§S8 row). */
const slopeFields: FixtureFields = {
  baseHeight: () => BASE_HEIGHT,
  // One uniform descent that stops short of the floor: every texel has soil to give, so "this cell eroded nothing"
  // always means something went wrong rather than this cell simply being spent (A2).
  bed: (column) => 0.95 - 0.008 * column,
  depth: () => 0.5,
  velocityX: () => CHANNEL_SPEED, // the whole grid is a wetted flume: shear and capacity everywhere
  velocityY: () => 0.0,
  load: () => 0.0,
};

await test("erosion is mass-neutral: the bed's loss is the water's gain", async () => {
  const graph = createSedimentGraph(slopeFields);
  // Settling off, so the bed can only give: then "bed loss equals suspended gain" is not a number netted against
  // a deposit elsewhere. detachRate up is rate-only (section 4.7's reasoning) and lifts per-pass exchange above
  // the float32 resolution of a bed of order one, where a smaller cut would be unmeasurable rather than neutral.
  applyParams(graph, paramsWith({ detachRate: 1.0, settleRate: 0.0 }));

  computeOnce(graph);
  const firstPixels = readPixels(graph, graph.sedimentFlowVariable);

  // Pass 1, at texel resolution. Nothing was suspended anywhere when the pass began, so every cell's outflux is
  // identically zero - A3 makes freshly eroded material transportable only next step - and the load a cell gains
  // is exactly minus the delta it scheduled for the bed. No aggregate, no lag: per-texel equality.
  let worstPerCellMismatch = 0.0;
  for (let texel = 0; texel < WIDTH * WIDTH; texel++) {
    const gainedLoad = firstPixels[texel * 4 + CHANNEL_LOAD];
    const scheduledDelta = firstPixels[texel * 4 + CHANNEL_SCHEDULED_DELTA];
    assert(
      gainedLoad > 0.0,
      `texel ${String(texel)} eroded nothing on a wet, flowing slope with soil above its floor (delta=${String(scheduledDelta)})`,
    );
    worstPerCellMismatch = Math.max(
      worstPerCellMismatch,
      Math.abs(gainedLoad + scheduledDelta),
    );
  }
  assert(
    worstPerCellMismatch <= FLOAT_TOLERANCE,
    `pass 1 load gain and scheduled bed loss differ by ${String(worstPerCellMismatch)}`,
  );

  // From pass 2 on transport is alive, so the statement moves to the aggregate: the flux telescopes to zero
  // across a grid that retains at its borders (A13), hence d/dt sum(load) == -sum(D - E) every step.
  let worstAggregateMismatch = 0.0;
  runAndAudit(graph, 40, ({ passIndex, previous, current }) => {
    const loadGain = current.suspendedLoadSum - previous.suspendedLoadSum;
    const exchanged = Math.abs(current.scheduledDeltaSum);
    assert(
      exchanged > 0.0,
      `pass ${String(passIndex)} cut nothing anywhere in a wet, flowing flume`,
    );
    assert(
      current.scheduledDeltaSum < 0.0,
      `pass ${String(passIndex)} scheduled net deposition ${String(current.scheduledDeltaSum)} with settling switched off`,
    );
    worstAggregateMismatch = Math.max(
      worstAggregateMismatch,
      Math.abs(loadGain + current.scheduledDeltaSum),
    );
  });

  // Budget: 1e-5 absolute, against a measured worst case of 2.3e-7 (about two ulps of the summed quantities).
  // Looser than FLOAT_TOLERANCE on purpose - this compares two Kahan sums of values that each went through
  // float32 rounding separately - and still four orders below the transferCap-per-pass a border leak would add.
  assert(
    worstAggregateMismatch <= 1e-5,
    `sum(load) gain and sum(D - E) disagree by ${String(worstAggregateMismatch)} across 40 passes of pure erosion`,
  );
  console.log(
    `[sediment:erosion-neutral] per-cell mismatch=${String(worstPerCellMismatch)}, aggregate mismatch=${String(worstAggregateMismatch)}`,
  );
});
completedScenarios += 1;

// ---------------------------------------------------------------------------

/** East-flowing water across the whole grid: the entire east column would export off-grid (§S8 row). */
const offshoreFields: FixtureFields = {
  baseHeight: () => BASE_HEIGHT,
  bed: () => 0.9,
  depth: () => 0.5,
  velocityX: () => CHANNEL_SPEED, // uniform flow east, so routing is nowhere to hide behind a boundary
  velocityY: () => 0.0,
  load: () => HOP_LOAD, // the grid starts full of what could walk off its edge
};

await test("load driven at the domain edge stays inside the grid", async () => {
  const graph = createSedimentGraph(offshoreFields);
  applyParams(graph, TRANSPORT_ONLY_PARAMS); // pure advection: any missing mass can only have left the grid

  const { initialAudit, finalAudit } = runAndAudit(graph, 60);

  // The leak detector. Border retention (A4) says a cell that would ship off-grid keeps its load, so sum(load)
  // is constant; if the east column exported into nothing instead, it would drop transferCap of its content
  // every single pass - about three percent of the grid's whole mass on the first pass alone.
  const totalLoadDrift =
    Math.abs(finalAudit.suspendedLoadSum - initialAudit.suspendedLoadSum) /
    initialAudit.suspendedLoadSum;
  assert(
    totalLoadDrift <= 1e-5,
    `suspended load changed by ${String(totalLoadDrift)} of its total while advecting into a closed border`,
  );

  // And the motion proof, so this cannot pass because nothing moved: mass has to pile up against the edge it is
  // driven at and drain out of the column that has no upstream to refill it.
  const finalSedimentPixels = readPixels(graph, graph.sedimentFlowVariable);
  const columnLoad = (column: number): number => {
    let total = 0.0;
    for (let row = 0; row < WIDTH; row++) {
      total += finalSedimentPixels[texelIndex(column, row) * 4 + CHANNEL_LOAD];
    }
    return total;
  };
  const eastSum = columnLoad(WIDTH - 1);
  const westSum = columnLoad(0);
  assert(
    eastSum >= 0.99 * initialAudit.suspendedLoadSum,
    `the east edge holds ${String(eastSum)} of an original ${String(initialAudit.suspendedLoadSum)}; the packet did not walk the grid`,
  );
  assert(
    westSum <= 1e-6 * initialAudit.suspendedLoadSum,
    `the west edge still holds ${String(westSum)}: nothing was moving, so retention proved nothing`,
  );

  console.log(
    `[sediment:border] drift=${String(totalLoadDrift)}, east=${String(eastSum)}, west=${String(westSum)}`,
  );
});
completedScenarios += 1;

// ---------------------------------------------------------------------------

/** One finger of soil over rock, in water that could carry a hundred times it (§S8 row). */
const SOIL_DEPTH = 0.05;
const RIVER_SPEED = 0.5; // with depth below, capacity sits at CAPACITY_CEILING: transport is never the limit
const thinSoilFields: FixtureFields = {
  baseHeight: () => BASE_HEIGHT,
  bed: () => BEDROCK + SOIL_DEPTH,
  depth: () => 0.6,
  velocityX: () => RIVER_SPEED,
  velocityY: () => 0.0,
  load: () => 0.0,
};

await test("exhausted soil stops the cut instead of minting load", async () => {
  const graph = createSedimentGraph(thinSoilFields);
  // Absurd hydraulic limits, so availability is the only thing that can stop this cut: shear and capacity stay
  // enormous for every pass, which is what excludes "the flow went slack" as the reason erosion stopped.
  applyParams(
    graph,
    paramsWith({
      erosionCoefficient: 1e6,
      detachRate: 1e3,
      settleRate: 0.0,
    }),
  );

  const soilVolume = SOIL_DEPTH * WIDTH * WIDTH;
  const erosionByPass: number[] = [];
  const { initialAudit, finalAudit } = runAndAudit(graph, 8, ({ current }) => {
    // With settling off, a negative scheduled delta is erosion and nothing else.
    erosionByPass.push(Math.max(0.0, -current.scheduledDeltaSum));
  });

  const erodedTotal = erosionByPass.reduce(
    (total: number, amount: number) => total + amount,
    0.0,
  );
  assert(
    Math.abs(erodedTotal - soilVolume) <= 1e-4 * soilVolume,
    `the grid lost ${String(erodedTotal)} of bed while it only had ${String(soilVolume)} of soil above bedrock`,
  );

  // Soil exhausted: the cut stops even though nothing about the flow changed. Pass 0 lifts the whole finger, so
  // every pass after it has to schedule essentially nothing (float32 residue in availableSoil is all that's left).
  const erosionAfterExhaustion = erosionByPass
    .slice(1)
    .reduce((total: number, amount: number) => total + amount, 0.0);
  assert(
    erosionAfterExhaustion <= 1e-4 * soilVolume,
    `the bed kept giving ${String(erosionAfterExhaustion)} after its soil was spent (first pass ${String(erosionByPass[0])})`,
  );

  // The bed came to rest on the floor rather than through it, and every gram of the vanished bed is suspended:
  // exhaustion must not manufacture load out of rock (auditPass pins M* and the floor underneath all of this).
  const bedrockSum = BEDROCK * WIDTH * WIDTH;
  assert(
    Math.abs(finalAudit.bedSum - bedrockSum) <= 1e-4 * bedrockSum,
    `bed sum ${String(finalAudit.bedSum)} did not settle on its floor at ${String(bedrockSum)}`,
  );
  assert(
    Math.abs(finalAudit.suspendedLoadSum - erodedTotal) <= 1e-4 * soilVolume,
    `suspended load ${String(finalAudit.suspendedLoadSum)} does not account for the ${String(erodedTotal)} the bed lost`,
  );

  console.log(
    `[sediment:availability] eroded=${String(erodedTotal)} of soil=${String(soilVolume)}, later passes=${String(erosionAfterExhaustion)}, M* drift=${String(Math.abs(finalAudit.materialTotal - initialAudit.materialTotal))}`,
  );
});
completedScenarios += 1;

// ---------------------------------------------------------------------------

/**
 * Base map authored like the app uploads it: flipY = true, raw index = rowBase * WIDTH + column (A15). The step
 * per row is far above float32 resolution at elevation ~1, so a flipped read cannot be mistaken for round-off;
 * the smaller per-column term catches a transpose, which would leave rows alone.
 */
const RAMP_PER_ROW = 0.02;
const RAMP_PER_COLUMN = 0.001;
const rampRawAt = (rawRow: number, column: number): number =>
  BASE_HEIGHT + RAMP_PER_ROW * rawRow + RAMP_PER_COLUMN * column;

/** Availability read-out depth: well under capacity, so scheduled delta equals availability instead of it. */
const PROBE_ERODIBLE_DEPTH = 0.05;

/**
 * The base map as the app uploads one: one float per texel (RedFormat) and flipY = true. Both details matter -
 * createGpuTerrainHeight's seed copy indexes the raw array by texel, so an RGBA fixture would silently feed it a
 * stride-4 walk through rgba values instead of heights, and this probe is about the real upload convention.
 */
const createAuthoredBaseMap = (
  field: (rawRow: number, column: number) => number,
): THREE.DataTexture => {
  const data = new Float32Array(WIDTH * WIDTH);
  for (let rawRow = 0; rawRow < WIDTH; rawRow++) {
    for (let column = 0; column < WIDTH; column++) {
      data[rawRow * WIDTH + column] = field(rawRow, column);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    WIDTH,
    WIDTH,
    THREE.RedFormat,
    THREE.FloatType,
  );
  texture.flipY = true; // production displacement maps are uploaded flipped (A15)
  texture.needsUpdate = true;
  return texture;
};

const orientationFields: FixtureFields = {
  baseHeight: () => BASE_HEIGHT, // replaced by the authored map below; kept so the fixture type is complete
  bed: (column, row) => rampRawAt(row, column), // ignored: this graph must use the production seed path
  depth: () => 0.6,
  velocityX: () => RIVER_SPEED,
  velocityY: () => 0.0,
  load: () => 0.0,
};

await test("the bed's seed and the sediment's land at matching UVs", async () => {
  // (1) Availability read-out, on the production seed path. A2 limits erosion against effBed - bedrock, i.e.
  // against heightMap.r AND uBaseHeightMap.r sampled at this pass' own uv. Production seeds the bed by copying
  // the base map, so those two samples agree everywhere and availability is exactly erodibleDepth in every
  // texel. Any disagreement between the bed's orientation and the sediment pass' uv makes it vary with row:
  // measured on the reference model, a vertically flipped pair yields deltas spread over [-0.25, 0] instead of
  // a flat -0.05, i.e. a full ramp step per row rather than a rounding difference.
  const authoredBaseMap = createAuthoredBaseMap(rampRawAt);
  const probing = createSedimentGraph(orientationFields, {
    seedBedFromBaseMap: true,
    baseHeightMap: authoredBaseMap,
  });
  applyParams(
    probing,
    paramsWith({
      erosionCoefficient: 1e6,
      detachRate: 1e3,
      settleRate: 0.0,
      erodibleDepth: PROBE_ERODIBLE_DEPTH,
    }),
  );
  const probeInitial = auditPass(probing, -1);
  computeOnce(probing);

  const probePixels = readPixels(probing, probing.sedimentFlowVariable);
  let worstAvailabilityError = 0.0;
  for (let texel = 0; texel < WIDTH * WIDTH; texel++) {
    const scheduledDelta = probePixels[texel * 4 + CHANNEL_SCHEDULED_DELTA];
    // -erodibleDepth: the whole soil column is available, capacity is at its ceiling and rate limits are absurd.
    worstAvailabilityError = Math.max(
      worstAvailabilityError,
      Math.abs(scheduledDelta + PROBE_ERODIBLE_DEPTH),
    );
  }
  // Budget sits three orders under the failure signal and three above the noise: this GPU measures 4.8e-8 on
  // correct code, while sampling the base map at flipped v - tried as a mutation - spreads availability by 0.2,
  // four full rows of the authored ramp.
  assert(
    worstAvailabilityError <= 1e-4,
    `availability varies by ${String(worstAvailabilityError)} across the grid, so bed and base map do not agree at identical UVs (A15)`,
  );

  // One pass of exchange is neutral in the channels it writes: what the water now holds is exactly what the bed
  // agreed to give up - and this sums 256 float32s twice, hence a few ulps per term rather than one budget.
  const probeLoadSum = kahanSum(probePixels, CHANNEL_LOAD);
  const probeDeltaSum = kahanSum(probePixels, CHANNEL_SCHEDULED_DELTA);
  assert(
    Math.abs(probeLoadSum + probeDeltaSum) <= FLOAT_TOLERANCE * WIDTH,
    `one pass moved ${String(probeLoadSum)} onto the bed and ${String(probeDeltaSum)} off it`,
  );

  // A1's lag, read off the same evidence: terrain-height applies what a previous pass scheduled, so this pass left
  // the bed exactly where its seed put it while M* - load, plus bed, plus what is owed to that bed - stayed put.
  const probeAfter = auditPass(probing, 0);
  assert(
    probeAfter.bedSum === probeInitial.bedSum,
    `the bed had already sunk by ${String(probeInitial.bedSum - probeAfter.bedSum)} on the pass that only scheduled its delta (A1)`,
  );
  const probeDrift =
    Math.abs(probeAfter.materialTotal - probeInitial.materialTotal) /
    Math.abs(probeInitial.materialTotal);
  assert(
    probeDrift <= CONSERVATION_TOLERANCE,
    `M* drifted by ${String(probeDrift)} of ${String(probeInitial.materialTotal)} across one orientation-probe pass`,
  );

  // (2) Absolute read-back orientation, on a grid where nothing is exchanged: bed values come straight from the
  // production seed, so this reads A15's mapping itself - row y of the bed render target equals raw row N-1-y of
  // the base map. Water/sediment seeds stay flipY = false (A14), which is what lets a sediment marker and that
  // bed texel be addressed by one index below.
  const markerCell = { column: 5, row: 2 };
  const resting = createSedimentGraph(
    {
      ...orientationFields,
      depth: () => 0.0, // dry and still: capacity zero, nothing to settle out of a load that is already under it
      velocityX: () => 0.0,
      load: (column, row) =>
        column === markerCell.column && row === markerCell.row ? HOP_LOAD : 0.0,
    },
    { seedBedFromBaseMap: true, baseHeightMap: authoredBaseMap },
  );
  applyParams(resting, TRANSPORT_ONLY_PARAMS);
  computeOnce(resting);

  const restingSediment = readPixels(resting, resting.sedimentFlowVariable);
  const restingBed = readPixels(resting, resting.heightMapVariable);
  const markerChannel = texelIndex(markerCell.column, markerCell.row) * 4;

  assert(
    Math.abs(restingSediment[markerChannel + CHANNEL_LOAD] - HOP_LOAD) <=
      FLOAT_TOLERANCE,
    `the sediment marker is not where its fixture index says it is: ${String(restingSediment[markerChannel + CHANNEL_LOAD])}`,
  );

  // Same index, other texture: the bed texel under that load marker is the base map's flipped raw row - which is
  // exactly the agreement S3 needs between sampling uBaseHeightMap in a shader and reading the dynamic bed back.
  const expectedBedAtMarker = rampRawAt(
    WIDTH - 1 - markerCell.row,
    markerCell.column,
  );
  assert(
    Math.abs(restingBed[markerChannel] - expectedBedAtMarker) <=
      FLOAT_TOLERANCE,
    `bed under the load marker reads ${String(restingBed[markerChannel])}, expected ${String(expectedBedAtMarker)} from raw row ${String(WIDTH - 1 - markerCell.row)}`,
  );

  // Nothing smeared on the way: every other texel kept its own seed and scheduled no exchange.
  for (let row = 0; row < WIDTH; row++) {
    for (let column = 0; column < WIDTH; column++) {
      const index = texelIndex(column, row);
      if (index === Math.floor(markerChannel / 4)) {
        continue;
      }
      assert(
        restingSediment[index * 4 + CHANNEL_LOAD] === 0.0,
        `texel (${String(column)}, ${String(row)}) holds load ${String(restingSediment[index * 4 + CHANNEL_LOAD])} in a grid that only ever sampled its own uv`,
      );
      assert(
        Math.abs(restingBed[index * 4] - rampRawAt(WIDTH - 1 - row, column)) <=
          FLOAT_TOLERANCE,
        `bed texel (${String(column)}, ${String(row)}) reads ${String(restingBed[index * 4])}, not the base map's flipped raw value`,
      );
    }
  }

  console.log(
    `[sediment:orientation] availability error=${String(worstAvailabilityError)}, bed under load marker=${String(restingBed[markerChannel])}`,
  );
});
completedScenarios += 1;

// ---------------------------------------------------------------------------

/**
 * Divergence budget for CPU/GPU parity. Both sides store float32; only the arithmetic on top differs - doubles in
 * the model, per-operation rounding in the shader - and shear feeds the bed back into erosion every pass.
 *
 * Measured over PARITY_PASS_COUNT passes: committed bed agrees bit-for-bit (0), scheduled delta drifts by 7e-10,
 * suspended load by 1.5e-8, which is half an ulp of a load of order 0.25. The budget is two orders above the worst
 * of those rather than hugging them because rounding here belongs to the driver and shader compiler of whatever
 * machine runs this, while anything wired differently - wrong capacity form, missing lag, uv read in the other
 * orientation - lands at 1e-2 and up. See this scenario's console line for the numbers on the current run.
 */
const PARITY_TOLERANCE = 1e-6;

const PARITY_PASS_COUNT = 12;
const PARITY_PARAMS = paramsWith({ detachRate: 0.2, settleRate: 0.3 });

/**
 * Rows matter here, and they matter differently per channel - the bed ramps across rows as well as along the
 * flow, a load plume is seeded on one row only, and the outlet sits on the far row - so if either side read the
 * grid in the other's orientation this fixture would notice instead of agreeing by symmetry (S5/A14). A material
 * band adds the A9 factors to the comparison.
 */
const parityFields: FixtureFields = {
  baseHeight: () => BASE_HEIGHT,
  // slope east so shear is amplified along the flow, plus a cross-channel ramp so row confusion cannot hide
  bed: (column, row) => Math.max(BEDROCK, 0.95 - 0.02 * column + 0.004 * row),
  depth: (column) => (column < POND_START_X ? 0.5 : 0.02), // a channel feeding shallower water
  velocityX: (column) => (column < POND_START_X ? CHANNEL_SPEED : 0.0), // ... that it stops being able to hold
  velocityY: (column, row) =>
    row === WIDTH - 1 && column > POND_START_X ? -CHANNEL_SPEED : 0.0, // one outlet off-grid: border retention has to match too
  load: (column, row) =>
    row === 2 && column >= 1 && column <= 3 ? HOP_LOAD : 0.0, // a seeded plume, so transport is live from pass 1
  material: (column) =>
    inBand(column, { from: 6, to: 8 }) ? MATERIAL_GRASS : MATERIAL_BARE_DIRT,
};

await test("the CPU reference model reproduces the GPU texel for texel", async () => {
  const graph = createSedimentGraph(parityFields);
  applyParams(graph, PARITY_PARAMS); // one set of numbers drives both sides (A8)
  let referenceGrid = referenceGridFrom(parityFields);

  /** Largest texel-wise difference between the committed GPU state and the model, per channel. */
  const worstDivergence = (): { load: number; delta: number; bed: number } => {
    const gpuLoadAndDelta = readPixels(graph, graph.sedimentFlowVariable);
    const gpuBed = readPixels(graph, graph.heightMapVariable);

    let load = 0.0;
    let delta = 0.0;
    let bed = 0.0;
    for (let texel = 0; texel < WIDTH * WIDTH; texel++) {
      load = Math.max(
        load,
        Math.abs(
          gpuLoadAndDelta[texel * 4 + CHANNEL_LOAD] - referenceGrid.load[texel],
        ),
      );
      delta = Math.max(
        delta,
        Math.abs(
          gpuLoadAndDelta[texel * 4 + CHANNEL_SCHEDULED_DELTA] -
            referenceGrid.pendingDelta[texel],
        ),
      );
      // The bed render target is RGBA too: channel 0 of texel `texel` lives at texel * 4 (A14's layout).
      bed = Math.max(
        bed,
        Math.abs(gpuBed[texel * 4] - referenceGrid.bed[texel]),
      );
    }
    return { load, delta, bed };
  };

  let worstSeen = { load: 0.0, delta: 0.0, bed: 0.0 };
  for (let passIndex = 0; passIndex < PARITY_PASS_COUNT; passIndex++) {
    computeOnce(graph);
    referenceGrid = advanceSedimentStep(referenceGrid, PARITY_PARAMS).grid;

    const divergence = worstDivergence();
    worstSeen = {
      load: Math.max(worstSeen.load, divergence.load),
      delta: Math.max(worstSeen.delta, divergence.delta),
      bed: Math.max(worstSeen.bed, divergence.bed),
    };

    assert(
      divergence.load <= PARITY_TOLERANCE,
      `pass ${String(passIndex)}: suspended load differs by ${String(divergence.load)}`,
    );
    assert(
      divergence.delta <= PARITY_TOLERANCE,
      `pass ${String(passIndex)}: scheduled bed delta differs by ${String(divergence.delta)}`,
    );
    assert(
      divergence.bed <= PARITY_TOLERANCE,
      `pass ${String(passIndex)}: committed bed differs by ${String(divergence.bed)}`,
    );
  }

  console.log(
    `[sediment:parity] over ${String(PARITY_PASS_COUNT)} passes: worst load=${String(worstSeen.load)}, delta=${String(worstSeen.delta)}, bed=${String(worstSeen.bed)}`,
  );
});
completedScenarios += 1;

assert(
  completedScenarios === SCENARIO_COUNT,
  `only ${String(completedScenarios)} of ${String(SCENARIO_COUNT)} sediment scenarios completed`,
);
document.body.dataset.sedimentFlowTestsComplete = String(completedScenarios);
