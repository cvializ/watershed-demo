import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  ADVECT_HALF_SPEED,
  CAPACITY_CEILING,
  capacityOf,
  DEFAULT_SEDIMENT_PARAMS,
  DEPOSITION_FACTOR_BARE_DIRT,
  DEPOSITION_FACTOR_GRASS,
  DEPOSITION_FACTOR_ROCKS,
  depositionFactorOf,
  DIRECTION_STEPS,
  EPS,
  ERODIBILITY_BARE_DIRT,
  ERODIBILITY_GRASS,
  ERODIBILITY_ROCKS,
  erodibilityOf,
  MATERIAL_BARE_DIRT,
  MATERIAL_GRASS,
  MATERIAL_ROCKS,
  SLOPE_GAIN,
  STILL_WATER_BOOST,
  WET_THRESHOLD,
  type SedimentGrid,
  type SedimentParams,
  advanceSedimentStep,
  bedrockElevation,
  cloneSedimentGrid,
  createSedimentGrid,
  kahanSum,
  materialTotal,
  routeIndexOf,
  runSedimentSteps,
} from "../sedimentReferenceModel";

/**
 * Invariants of the sediment algorithm checked against the CPU reference model (plan S8/S10, A17 step 5).
 *
 * Why these tests live in plain node and not only on the GPU: every one of them is a statement about which terms
 * talk to each other, and those are testable at double precision and microsecond cost. If an invariant fails here,
 * the algorithm is wrong; if it holds here and fails on the GPU, the model and the shader have drifted apart -
 * which is exactly what the first block below guards against directly, by reading the GLSL text.
 *
 * Tolerances: fields are Float32Array, so each pass rounds into float32 storage exactly as RGBA32F does on the
 * GPU. Drift bounds below are therefore float32-scale (1e-7 relative per pass), not double-scale - and measured,
 * not guessed. A structural term that is wrong shows up at 1e-1 scale, orders of magnitude clear of these.
 */

const SIZE = 16;
const BASE_HEIGHT = 1.0; // static base displacement -> bedrock proxy (A2)
const ERODIBLE_DEPTH = 0.35; // same as the default uniform, and drift-guarded above
const BEDROCK = bedrockElevation(BASE_HEIGHT, ERODIBLE_DEPTH);
const CHANNEL_SPEED = 0.3;
const CUT_TARGET = 0.02; // a depth change that would actually be visible on screen

/** Defaults with overrides applied, so a test states only the regime it cares about. */
const paramsWith = (overrides: Partial<SedimentParams>): SedimentParams => ({
  ...DEFAULT_SEDIMENT_PARAMS,
  ...overrides,
});

/** Rates pinned hard enough that erosion, transport and settling all bind in a handful of passes. */
const FAST_EXCHANGE = paramsWith({ detachRate: 1.0, settleRate: 0.5 });

/** Absolute tolerance on a mass comparison: fields are float32, so ~64 cells of bookkeeping cost ~1e-7. */
const MASS_EPS = 1e-5;

/**
 * Tolerance on an elevation comparison. Fields are Float32Array and `bed` + `pendingDelta` is a sum of two values
 * that were each rounded independently, so one unit in the last place near elevation 1 (~1.2e-7) is the floor's
 * arithmetic noise floor rather than a leak - on GPU it is the same story with RGBA32F. A genuine violation would
 * be dtScale * detachRate * shear scale, i.e. orders of magnitude larger.
 */
const FLOOR_EPS = 1e-6;

/** Relative closeness at float32 fidelity: ratios of summed terms carry ~7 digits, not double's 16. */
const expectRatio = (actual: number, expected: number): void => {
  const relativeError = Math.abs(actual - expected) / Math.abs(expected);
  expect(relativeError).toBeLessThan(1e-5);
};

/** Per-cell field initialiser; index layout matches the model's (row-major, +y north). */
type FieldAt = (column: number, row: number) => number;

/** Flat grid at rest: no water, no load, nothing pending. */
const restingGrid = (
  overrides: {
    baseHeight?: FieldAt;
    bed?: FieldAt;
    depth?: FieldAt;
    velocityX?: FieldAt;
    velocityY?: FieldAt;
    load?: FieldAt;
    material?: FieldAt;
  } = {},
): SedimentGrid =>
  createSedimentGrid(SIZE, {
    baseHeight: () => BASE_HEIGHT,
    bed: () => BASE_HEIGHT,
    ...overrides,
  });

/** The relative change in M* across a run. This is the number every invariant below is written against. */
const relativeDrift = (first: number, last: number): number =>
  Math.abs(last - first) / Math.max(Math.abs(first), 1e-12);

/** Sum of one per-cell term array; Kahan so checker precision never becomes the story. */
const totalOf = (values: Float32Array): number => kahanSum(values);

const allFinite = (fields: ReadonlyArray<Float32Array>): boolean =>
  fields.every((field) => field.every((value) => Number.isFinite(value)));

// ------------------------------------------------------------------------------------------------------------
// The model must stay a mirror of the shader. A reference model that drifts is worse than none, because parity
// then passes while proving nothing about the arithmetic actually running on the GPU.

// Source paths are resolved against the process working directory, which is the repo root for `npm test`
// (playwright.config.ts lives there). A wrong cwd fails loudly with ENOENT rather than skipping.
test.describe("the reference model mirrors sediment-flow.frag", () => {
  const shaderSource = readFileSync(
    "src/shaders/compute/sediment-flow.frag",
    "utf8",
  );
  const uniformSource = readFileSync(
    "src/gpu/waterFlowSimulation/variables/createGpuSedimentFlow.ts",
    "utf8",
  );

  /** Pull one `const float NAME = <number>;` out of the GLSL. */
  const glslConstant = (name: string): number => {
    const match = shaderSource.match(
      new RegExp(`const\\s+float\\s+${name}\\s*=\\s*(-?[0-9.eE+-]+);`),
    );
    if (!match || !match[1]) {
      throw new Error(`sediment-flow.frag no longer declares ${name}`);
    }
    return Number.parseFloat(match[1]);
  };

  /** Pull one `const DEFAULT_NAME = <number>` out of the variable's TypeScript. */
  const uniformDefault = (name: string): number => {
    const match = uniformSource.match(
      new RegExp(`const ${name} = (-?[0-9.eE+-]+);`),
    );
    if (!match || !match[1]) {
      throw new Error(`createGpuSedimentFlow no longer declares ${name}`);
    }
    return Number.parseFloat(match[1]);
  };

  test("mirrors every shader constant", () => {
    // Compared against the model's own exports rather than literals repeated here: the point is that the two
    // sources of truth agree, not that this file happens to remember the same numbers.
    const mirrored = [
      ["EPS", EPS],
      ["ADVECT_HALF_SPEED", ADVECT_HALF_SPEED],
      ["SLOPE_GAIN", SLOPE_GAIN],
      ["WET_THRESHOLD", WET_THRESHOLD],
      ["CAPACITY_CEILING", CAPACITY_CEILING],
      ["STILL_WATER_BOOST", STILL_WATER_BOOST],
    ] as const;

    for (const [name, modelValue] of mirrored) {
      expect(glslConstant(name), name).toBe(modelValue);
    }
  });

  test("mirrors the A9 material tables and their thresholds", () => {
    expect(glslConstant("ERODIBILITY_BARE_DIRT")).toBe(ERODIBILITY_BARE_DIRT);
    expect(glslConstant("ERODIBILITY_GRASS")).toBe(ERODIBILITY_GRASS);
    expect(glslConstant("ERODIBILITY_ROCKS")).toBe(ERODIBILITY_ROCKS);
    expect(glslConstant("DEPOSITION_FACTOR_BARE_DIRT")).toBe(
      DEPOSITION_FACTOR_BARE_DIRT,
    );
    expect(glslConstant("DEPOSITION_FACTOR_GRASS")).toBe(
      DEPOSITION_FACTOR_GRASS,
    );
    expect(glslConstant("DEPOSITION_FACTOR_ROCKS")).toBe(
      DEPOSITION_FACTOR_ROCKS,
    );

    // Thresholds are what make the ids and the tables agree; a reworked comparison is a material change.
    expect(shaderSource).toContain("materialId < 0.5");
    expect(shaderSource).toContain("materialId < 1.5");

    // And the ids themselves come from the texture encoder, not from this file.
    const surfaceMaterialSource = readFileSync(
      "src/scene/resources/textures/surfaceMaterial.ts",
      "utf8",
    );
    for (const [id, name] of [
      [MATERIAL_BARE_DIRT, "bareDirt"],
      [MATERIAL_GRASS, "grass"],
      [MATERIAL_ROCKS, "rocks"],
    ] as const) {
      expect(surfaceMaterialSource).toContain(`${name}: ${id.toFixed(1)}`);
    }
  });

  test("mirrors the eight-direction table and its order", () => {
    // The route predicate's argmax and OPPOSITE_INDEX are both index-based, so a reordered table silently breaks
    // the pairing that makes flux conservative. Pin the order in both languages.
    const tableStart = shaderSource.indexOf("DIRECTION_STEPS[8]");
    if (tableStart < 0) {
      throw new Error(
        "sediment-flow.frag no longer declares DIRECTION_STEPS[8]",
      );
    }
    const tableEnd = shaderSource.indexOf(");", tableStart);
    const table = shaderSource.slice(tableStart, tableEnd);
    const glslOrder = [...table.matchAll(/vec2\((-?[\d.]+), (-?[\d.]+)\)/g)];
    expect(glslOrder).toHaveLength(DIRECTION_STEPS.length);

    for (let index = 0; index < DIRECTION_STEPS.length; index++) {
      const [stepX, stepY] = DIRECTION_STEPS[index];
      expect(Number.parseFloat(glslOrder[index][1]), `step ${index} x`).toBe(
        stepX,
      );
      expect(Number.parseFloat(glslOrder[index][2]), `step ${index} y`).toBe(
        stepY,
      );
    }

    // N<->S, NE<->SW, E<->W, SE<->NW: index +/- 4, which is what makes export and import pair up (A1/S3).
    expect(shaderSource).toContain("return index < 4 ? index + 4 : index - 4;");
  });

  test("mirrors the A8 uniform defaults", () => {
    expect(uniformDefault("DEFAULT_EROSION_COEFFICIENT")).toBe(
      DEFAULT_SEDIMENT_PARAMS.erosionCoefficient,
    );
    expect(uniformDefault("DEFAULT_CAPACITY_EXPONENT")).toBe(
      DEFAULT_SEDIMENT_PARAMS.capacityExponent,
    );
    expect(uniformDefault("DEFAULT_CRITICAL_SPEED")).toBe(
      DEFAULT_SEDIMENT_PARAMS.criticalSpeed,
    );
    expect(uniformDefault("DEFAULT_DETACH_RATE")).toBe(
      DEFAULT_SEDIMENT_PARAMS.detachRate,
    );
    expect(uniformDefault("DEFAULT_SETTLE_RATE")).toBe(
      DEFAULT_SEDIMENT_PARAMS.settleRate,
    );
    expect(uniformDefault("DEFAULT_TRANSFER_CAP")).toBe(
      DEFAULT_SEDIMENT_PARAMS.transferCap,
    );
    expect(uniformDefault("DEFAULT_ERODIBLE_DEPTH")).toBe(
      DEFAULT_SEDIMENT_PARAMS.erodibleDepth,
    );
  });

  test("routes only to the eight canonical directions", () => {
    // A4: no atan2 anywhere, so there is no angle wrap to get wrong. These are the only routes that exist.
    expect(routeIndexOf(0, 0)).toBe(-1); // still water carries nothing
    expect(routeIndexOf(1e-9, 0)).toBe(-1); // below EPS is still
    expect(routeIndexOf(0.3, 0)).toBe(2); // East
    expect(routeIndexOf(0, -0.7)).toBe(4); // South
    const diagonal = 0.7071;
    expect(routeIndexOf(diagonal, diagonal)).toBe(1); // Northeast
    expect(routeIndexOf(-diagonal, diagonal)).toBe(7); // Northwest

    // A vector between two canonical directions still resolves to one of them - never a ninth neighbour.
    const route = routeIndexOf(0.9, 0.4);
    expect(route).toBeGreaterThanOrEqual(0);
    expect(route).toBeLessThan(DIRECTION_STEPS.length);
  });
});

// ------------------------------------------------------------------------------------------------------------
// The §S8 invariant table, on the model.

test.describe("conservation invariants", () => {
  test("a closed basin conserves total mass exactly, including through a pond", () => {
    // Channel feeding a standing pond with an erodible bed: transport, detachment and settling all bind, and the
    // pond is where over-concentration used to get destroyed. Material varies across the grid (A9), so nothing in
    // this fixture can be explained by a single scalar factor.
    const grid = restingGrid({
      bed: (_column, row) => (row === 8 ? BASE_HEIGHT : 0.7 + 0.1 * (row % 3)),
      depth: (column) => (column >= 12 ? 0.5 : 0.0),
      velocityX: (column, row) =>
        row === 8 && column < SIZE - 1 ? CHANNEL_SPEED : 0.0,
      velocityY: (_column, row) => (row === 8 ? 0.0 : 0.05), // gentle cross-flow so more than one route is live
      load: (column, row) => (row === 8 && column < 4 ? 0.2 : 0.0),
      material: (_column, row) =>
        row >= 3 && row <= 6 ? MATERIAL_GRASS : MATERIAL_BARE_DIRT,
    });

    const initial = materialTotal(grid);
    let current = cloneSedimentGrid(grid);
    let previous = initial;
    let worstPerPassDrift = 0.0;

    for (let pass = 0; pass < 120; pass++) {
      current = advanceSedimentStep(current, FAST_EXCHANGE).grid;
      const total = materialTotal(current);
      expect(Number.isFinite(total)).toBe(true);
      worstPerPassDrift = Math.max(
        worstPerPassDrift,
        relativeDrift(previous, total),
      );
      previous = total;

      // Float32 storage round-off is the only thing allowed to move M*, and it does not accumulate: a structural
      // leak would be visible at this scale from pass one.
      expect(relativeDrift(initial, total)).toBeLessThan(1e-6);
    }

    expect(worstPerPassDrift).toBeLessThan(1e-7);
    expect(allFinite([current.load, current.bed, current.pendingDelta])).toBe(
      true,
    );
  });

  test("export equals import for a single hop, arithmetically", () => {
    // One loaded cell routing east into an empty neighbour. The exporter's loss and the importer's gain are the
    // same function call on the same texel read (plan S3), so this is exact rather than close.
    const grid = restingGrid({
      depth: () => 0.5,
      velocityX: (_column, row) => (row === 8 ? CHANNEL_SPEED : 0.0),
      load: (column, row) => (row === 8 && column === 4 ? 0.2 : 0.0),
    });

    const exporter = 8 * SIZE + 4;
    const importer = 8 * SIZE + 5;
    const before = grid.load[exporter];
    const { grid: next, terms } = advanceSedimentStep(
      grid,
      paramsWith({ detachRate: 0.0, settleRate: 0.0 }),
    );

    expect(terms.outflux[exporter]).toBeGreaterThan(0.0);
    expect(terms.influx[importer]).toBe(terms.outflux[exporter]);

    // Nothing else moved: the exporter loses exactly that much, and no third cell is involved.
    expect(next.load[exporter]).toBeCloseTo(
      before - terms.outflux[exporter],
      12,
    );
    expect(next.load[importer]).toBe(terms.influx[importer]);
    expect(totalOf(terms.influx)).toBe(terms.outflux[exporter]);

    // Telescoping across the whole grid: total export == total import, because border cells contribute zero and
    // every other hop has exactly one pair partner (section 4.2 step 6).
    expect(totalOf(terms.outflux)).toBeCloseTo(totalOf(terms.influx), 15);
  });

  test("erosion is mass-neutral, and cannot settle in the same pass", () => {
    const grid = restingGrid({
      bed: (_column, row) => (row === 8 ? BASE_HEIGHT : 0.72),
      depth: () => 0.5,
      velocityX: (column, row) => (row === 8 && column < SIZE - 1 ? 0.6 : 0.0),
    });

    const { grid: next, terms } = advanceSedimentStep(grid, FAST_EXCHANGE);
    expect(totalOf(terms.erosion)).toBeGreaterThan(0.0);

    for (let index = 0; index < SIZE * SIZE; index++) {
      // The load bookkeeping identity: what left, what arrived, what detached, what dropped out.
      const expectedLoad =
        grid.load[index] -
        terms.outflux[index] +
        terms.influx[index] +
        terms.erosion[index] -
        terms.deposition[index];
      expect(Math.abs(next.load[index] - expectedLoad)).toBeLessThan(1e-9);

      // Bed delta is exactly the other side of the same two numbers, plus the dry talus pair: granular
      // relaxation moves bed material between cells without ever touching the load, so height still cannot
      // come from nowhere - a cell's gain is its over-steepened neighbours' loss.
      expect(
        Math.abs(
          next.pendingDelta[index] -
            (terms.deposition[index] -
              terms.erosion[index] +
              terms.granularInflux[index] -
              terms.granularLoss[index]),
        ),
      ).toBeLessThan(1e-12);

      // A cell never erodes and deposits at once: erosion is bounded by the capacity gap, so carried <= capacity,
      // and settling only draws down load above local capacity (section 4.5).
      expect(terms.erosion[index] * terms.deposition[index]).toBe(0.0);

      // And the floor stays unreachable from above: bed + pending never crosses base - erodibleDepth (A2).
      const bedAfterCommit = grid.bed[index] + next.pendingDelta[index];
      expect(bedAfterCommit).toBeGreaterThanOrEqual(
        bedrockElevation(grid.baseHeight[index], ERODIBLE_DEPTH) - FLOOR_EPS,
      );
    }

    // What erosion took out of the bed is exactly what appeared in the load.
    expect(totalOf(next.load)).toBeCloseTo(
      totalOf(grid.load) + totalOf(terms.erosion) - totalOf(terms.deposition),
      12,
    );
  });

  test("deposition is mass-neutral and lands in the bed one pass later", () => {
    // No flow at all: nothing can advect, so suspended load has exactly one place to go (section 4.5).
    const grid = restingGrid({
      depth: () => 0.3,
      load: (column) => (column >= 12 ? 0.12 : 0.0),
    });

    const seededLoad = totalOf(grid.load);
    expect(seededLoad).toBeGreaterThan(0.0);

    const first = advanceSedimentStep(grid, DEFAULT_SEDIMENT_PARAMS);
    expect(totalOf(first.terms.outflux)).toBe(0.0); // no velocity, so no route (A4)
    expect(totalOf(first.terms.influx)).toBe(0.0);
    expect(totalOf(first.terms.erosion)).toBe(0.0);

    const deposited = totalOf(first.terms.deposition);
    expect(deposited).toBeGreaterThan(0.0);
    // The pending delta is the deposition, and it is still owed to the bed: this pass only moved mass out of
    // suspension (A13's one-step lag, which is why M* counts load + bed + pendingDelta together).
    expect(totalOf(first.grid.pendingDelta)).toBe(deposited);
    expect(
      Math.abs(totalOf(first.grid.load) - (seededLoad - deposited)),
    ).toBeLessThan(MASS_EPS);

    const second = advanceSedimentStep(first.grid, DEFAULT_SEDIMENT_PARAMS);
    expect(
      Math.abs(totalOf(second.grid.bed) - totalOf(grid.bed) - deposited),
    ).toBeLessThan(MASS_EPS);
    // terrain-height.frag is a plain sum: bed gain == deposition, no rescale and no smoothing (S4/A10).
    expect(allFinite([second.grid.bed, second.grid.load])).toBe(true);
  });

  test("nothing leaks at the domain border", () => {
    // Everything routes east off the edge. Without border retention this is a sustained drain that no invariant
    // downstream could distinguish from real export (section 4.2 step 6).
    const grid = restingGrid({
      depth: () => 0.5,
      velocityX: () => CHANNEL_SPEED,
      load: (column) => (column < 4 ? 0.1 : 0.0),
    });

    const initial = materialTotal(grid);
    const { grid: final, terms } = runSedimentSteps(
      grid,
      30,
      paramsWith({ detachRate: 0.0, settleRate: 0.0 }),
    );

    expect(relativeDrift(initial, materialTotal(final))).toBeLessThan(1e-7);
    expect(totalOf(terms.outflux)).toBeCloseTo(totalOf(terms.influx), 15);

    // The last column keeps what arrives instead of shovelling it off-grid...
    let retainedInLastColumn = 0.0;
    for (let row = 0; row < SIZE; row++) {
      const index = row * SIZE + (SIZE - 1);
      expect(terms.outflux[index]).toBe(0.0); // ...because a route to nothing is no route at all...
      retainedInLastColumn += final.load[index] + terms.influx[index];
    }
    expect(retainedInLastColumn).toBeGreaterThan(0.0);

    // ...and mass has not left the grid, so a downstream invariant cannot be blamed on the frame.
    expect(relativeDrift(initial, materialTotal(final))).toBeLessThan(1e-7);
  });

  test("transport capacity binds both exchange terms and stops at its ceiling", () => {
    const params = DEFAULT_SEDIMENT_PARAMS;

    // Capacity is what erosion may fill (carryLimit) and what settling draws down against, so the two edges of it
    // are structural: zero below criticalSpeed means still water cannot erode anything no matter the shear term,
    // and zero on a dry bed means an unsprayed texel cannot transport sediment it never held.
    expect(capacityOf(0.0, 1.0, params)).toBe(0.0);
    expect(capacityOf(params.criticalSpeed, 1.0, params)).toBe(0.0);
    expect(capacityOf(1.0, 0.0, params)).toBe(0.0); // depth is a multiplicand inside the power (A6)

    // Monotone in both drivers: faster water carries more, and so does deeper water at the same speed.
    const fast = capacityOf(0.2, 0.5, params);
    expect(capacityOf(0.1, 0.5, params)).toBeGreaterThan(0.0);
    expect(fast).toBeGreaterThan(capacityOf(0.1, 0.5, params));
    expect(fast).toBeGreaterThan(capacityOf(0.2, 0.25, params));

    // The ceiling is a hard stop rather than an asymptote: at absurd speed and depth the pow overflows to Infinity
    // and min() still returns CAPACITY_CEILING, which is what keeps one pass from entraining unbounded material.
    expect(capacityOf(1e6, 1e6, params)).toBe(CAPACITY_CEILING);
    for (const speed of [0.5, 1.0, 3.0]) {
      expect(capacityOf(speed, 1.0, params)).toBeLessThanOrEqual(
        CAPACITY_CEILING,
      );
    }
  });

  test("a cell at its floor detaches nothing, while its neighbour keeps cutting", () => {
    // The availability limit is per-cell and structural (A2), not a global switch: two identical cells under the
    // same absurd demand differ only in how much soil they have left above their own bedrock.
    const grid = createSedimentGrid(SIZE, {
      baseHeight: () => BASE_HEIGHT,
      // Row 8: columns 0-7 sit exactly on bedrock (nothing left to take), columns 8-15 have the full column.
      bed: (column) => (column < 8 ? BEDROCK : BASE_HEIGHT),
      depth: () => 0.6,
      velocityX: () => 1.2, // fast flow everywhere; shear is nowhere the limiting factor here
    });

    const { terms } = advanceSedimentStep(
      grid,
      paramsWith({
        erodibleDepth: ERODIBLE_DEPTH,
        detachRate: 5.0,
        settleRate: 0.0,
      }),
    );

    let exhaustedCells = 0;
    for (let column = 0; column < SIZE; column++) {
      const index = 8 * SIZE + column;
      if (column < 8) {
        expect(terms.erosion[index]).toBe(0.0); // at bedrock: no soil, no detachment, no phantom sediment
        exhaustedCells += 1;
      } else {
        expect(terms.erosion[index]).toBeGreaterThan(0.0); // same flow, same material, soil available
      }
    }
    expect(exhaustedCells).toBe(8);

    // And the floor is not merely respected once: it stays invariant across frames because base - erodibleDepth is
    // a constant (A2), so nothing re-imposes a clamp and nothing can dig below the immovable layer.
    let current = cloneSedimentGrid(grid);
    const params = paramsWith({
      erodibleDepth: ERODIBLE_DEPTH,
      detachRate: 5.0,
      settleRate: DEFAULT_SEDIMENT_PARAMS.settleRate, // what was cut has somewhere to go, so demand stays live
    });
    const initial = materialTotal(current);
    let worstDrift = 0.0;
    let deepestCutBelowBedrock = 0.0;

    for (let pass = 0; pass < 200; pass++) {
      current = advanceSedimentStep(current, params).grid;
      worstDrift = Math.max(
        worstDrift,
        relativeDrift(initial, materialTotal(current)),
      );
      for (let index = 0; index < SIZE * SIZE; index++) {
        deepestCutBelowBedrock = Math.max(
          deepestCutBelowBedrock,
          bedrockElevation(current.baseHeight[index], ERODIBLE_DEPTH) -
            (current.bed[index] + current.pendingDelta[index]),
        );
      }
    }

    // No clamp anywhere in the bed path: the floor holds because erosion is bounded by available soil, so
    // base - erodibleDepth stays invariant across frames rather than being re-imposed each frame. The residual is
    // one float32 rounding of a two-value sum, not a dig below the immovable layer (FLOOR_EPS explains the size).
    expect(deepestCutBelowBedrock).toBeLessThan(FLOOR_EPS);
    expect(worstDrift).toBeLessThan(1e-6);
    expect(allFinite([current.load, current.bed, current.pendingDelta])).toBe(
      true,
    );

    // Some material really was cut (the test is not vacuously passing on an untouched bed), and where it went is
    // already answered above: M* never moved, so every gram of it is load or downstream bank somewhere.
    const soilAboveFloor = (candidate: SedimentGrid): number => {
      let total = 0.0;
      for (let index = 0; index < SIZE * SIZE; index++) {
        total += Math.max(
          candidate.bed[index] +
            candidate.pendingDelta[index] -
            bedrockElevation(candidate.baseHeight[index], ERODIBLE_DEPTH),
          0.0,
        );
      }
      return total;
    };

    expect(soilAboveFloor(current)).toBeLessThan(soilAboveFloor(grid));
  });

  test("absurd rates return mass instead of destroying it", () => {
    // A8's claim: the min()s bounding erosion by available soil and deposition by carried load are what make this
    // safe, so no slider position can destroy or create material. The plan's tolerance for this case is 1e-4;
    // with float32 fields it lands orders of magnitude tighter.
    const grid = restingGrid({
      bed: (_column, row) => (row === 8 ? BASE_HEIGHT : 0.7),
      depth: (column) => (column % 5 === 0 ? 0.0 : 0.4), // dry cells mixed in: capacity 0, boost maxed
      velocityX: () => 3.0,
      load: (column, row) => (row === 8 && column < 6 ? 0.25 : 0.0),
      material: (_column, row) =>
        row >= 4 && row <= 7 ? MATERIAL_ROCKS : MATERIAL_GRASS,
    });

    const absurd = paramsWith({
      erosionCoefficient: 50.0,
      capacityExponent: 50.0,
      criticalSpeed: 0.0,
      detachRate: 100.0,
      settleRate: 100.0,
      erodibleDepth: ERODIBLE_DEPTH,
      transferCap: 0.999,
      dtScale: 2.0,
    });

    const initial = materialTotal(grid);
    let current = cloneSedimentGrid(grid);
    for (let pass = 0; pass < 60; pass++) {
      const before = current;
      const step = advanceSedimentStep(current, absurd);
      current = step.grid;

      // phi <= transferCap <= 1 is the advective CFL analogue (section 4.4): a cell can never ship more than it
      // holds, so `remaining` stays non-negative structurally and dtScale up to its S6 ceiling of 2 cannot overshoot.
      for (let index = 0; index < SIZE * SIZE; index++) {
        expect(step.terms.outflux[index]).toBeLessThanOrEqual(
          before.load[index],
        );
        expect(current.load[index]).toBeGreaterThanOrEqual(0.0);
      }

      expect(relativeDrift(initial, materialTotal(current))).toBeLessThan(1e-4);
    }

    expect(allFinite([current.load, current.bed, current.pendingDelta])).toBe(
      true,
    );
    for (let index = 0; index < SIZE * SIZE; index++) {
      expect(current.load[index]).toBeGreaterThanOrEqual(0.0); // carried - deposition >= 0 structurally
      expect(
        current.bed[index] + current.pendingDelta[index],
      ).toBeGreaterThanOrEqual(
        bedrockElevation(current.baseHeight[index], ERODIBLE_DEPTH) - FLOOR_EPS,
      );
    }
  });

  test("zero water deposits in place instead of advecting", () => {
    // Section 4.5: a dry cell has no route and no capacity, so its load drops where it stands. Advection is gated
    // on velocity (which water-velocity.frag zeroes when dry), never on depth - that would break the load's units.
    const grid = restingGrid({
      depth: () => 0.0,
      velocityX: () => 0.0,
      load: (column) => (column >= 12 ? 0.1 : 0.0),
    });

    const seededLoad = totalOf(grid.load);
    const { grid: final } = runSedimentSteps(grid, 60, DEFAULT_SEDIMENT_PARAMS);

    expect(totalOf(final.load)).toBeLessThan(MASS_EPS);
    // All of it is now in the terrain, and none of it vanished because there was no water to carry it.
    expect(
      Math.abs(
        totalOf(final.bed) +
          totalOf(final.pendingDelta) -
          (totalOf(grid.bed) + seededLoad),
      ),
    ).toBeLessThan(MASS_EPS);
  });

  test("the same input produces the same output", () => {
    // A3's determinism argument: no accumulation across passes except through the fields themselves, so a fixture
    // replayed twice is bit-identical - which is what makes the CPU/GPU parity diff at step 6 meaningful.
    const grid = restingGrid({
      bed: (_column, row) =>
        row === 8 ? BASE_HEIGHT : 0.75 + 0.02 * (row % 4),
      depth: (column) => (column >= 10 ? 0.45 : 0.05),
      velocityX: () => CHANNEL_SPEED,
      load: (column, row) => (row === 8 && column < 5 ? 0.18 : 0.0),
      material: (_column, row) =>
        row >= 3 && row <= 6 ? MATERIAL_GRASS : MATERIAL_BARE_DIRT,
    });

    const first = runSedimentSteps(grid, 40, FAST_EXCHANGE).grid;
    const second = runSedimentSteps(grid, 40, FAST_EXCHANGE).grid;

    for (const field of ["load", "bed", "pendingDelta"] as const) {
      expect(Array.from(first[field])).toEqual(Array.from(second[field]));
    }
  });
});

// ------------------------------------------------------------------------------------------------------------
// A9: material factors, and the tuning measurements this model exists to provide cheaply.

test.describe("material factors (A9)", () => {
  test("bare dirt is the identity for both tables, which is what makes A8's fallback sound", () => {
    // createGpuSedimentFlow binds a 1x1 all-dirt texture when nothing was painted and there is no presence flag.
    // That is only equivalent to "no material anywhere" while dirt scores exactly 1 on both tables; the tests below
    // mirror whatever the GLSL currently says, so this pins the requirement itself rather than today's numbers.
    expect(erodibilityOf(MATERIAL_BARE_DIRT)).toBe(1.0);
    expect(depositionFactorOf(MATERIAL_BARE_DIRT)).toBe(1.0);

    // No other material may be neutral too, or "paint nothing" would silently mean something else entirely.
    for (const materialId of [MATERIAL_GRASS, MATERIAL_ROCKS]) {
      const isNeutral =
        erodibilityOf(materialId) === 1.0 &&
        depositionFactorOf(materialId) === 1.0;
      expect(isNeutral).toBe(false);
    }
  });

  test("erodibility scales detachment by material", () => {
    expect(erodibilityOf(MATERIAL_BARE_DIRT)).toBe(ERODIBILITY_BARE_DIRT);
    expect(erodibilityOf(MATERIAL_GRASS)).toBe(ERODIBILITY_GRASS);
    expect(erodibilityOf(MATERIAL_ROCKS)).toBe(ERODIBILITY_ROCKS);

    // Pass 1 from a zero load: no import is possible, capacity cannot bind (0 < capacity), and settling has
    // nothing above capacity to draw down - so the scheduled delta is exactly E and E's material ratio is clean.
    const fixture = (materialId: number): SedimentGrid =>
      restingGrid({
        depth: () => 0.5,
        velocityX: (column) => (column < SIZE - 1 ? CHANNEL_SPEED : 0.0),
        material: () => materialId,
      });

    const eroded = (materialId: number): number => {
      const { terms } = advanceSedimentStep(
        fixture(materialId),
        paramsWith({ detachRate: 1.0, settleRate: 0.0 }),
      );
      return totalOf(terms.erosion);
    };

    const dirt = eroded(MATERIAL_BARE_DIRT);
    expect(dirt).toBeGreaterThan(0.0);

    const grass = eroded(MATERIAL_GRASS);
    const rocks = eroded(MATERIAL_ROCKS);

    expectRatio(grass / dirt, ERODIBILITY_GRASS / ERODIBILITY_BARE_DIRT);
    expectRatio(rocks / grass, ERODIBILITY_ROCKS / ERODIBILITY_GRASS);

    // Material is not a global rate: it must be keyed off the per-cell id (A9).
    const mixed = restingGrid({
      depth: () => 0.5,
      velocityX: (column) => (column < SIZE - 1 ? CHANNEL_SPEED : 0.0),
      material: (_column, row) =>
        row >= 3 && row <= 6 ? MATERIAL_GRASS : MATERIAL_BARE_DIRT,
    });
    const { terms } = advanceSedimentStep(
      mixed,
      paramsWith({ detachRate: 1.0, settleRate: 0.0 }),
    );

    const erosionAtRow = (row: number): number => {
      let sum = 0.0;
      for (let column = 0; column < SIZE; column++) {
        sum += terms.erosion[row * SIZE + column];
      }
      return sum;
    };

    const grassRow = erosionAtRow(4);
    const dirtRow = erosionAtRow(1);
    expect(grassRow).toBeGreaterThan(0.0);
    expectRatio(grassRow / dirtRow, ERODIBILITY_GRASS); // 3x slower for the same flow and bed

    // A missing map is all-dirt, and bare dirt is the identity pair - so it behaves exactly like no material at all.
    const allDirt = restingGrid({
      depth: () => 0.5,
      velocityX: (column) => (column < SIZE - 1 ? CHANNEL_SPEED : 0.0),
      material: () => MATERIAL_BARE_DIRT,
    });
    expect(
      totalOf(advanceSedimentStep(allDirt, FAST_EXCHANGE).terms.bedDelta),
    ).toBe(
      totalOf(
        advanceSedimentStep(
          restingGrid({
            depth: () => 0.5,
            velocityX: (column) => (column < SIZE - 1 ? CHANNEL_SPEED : 0.0),
          }),
          FAST_EXCHANGE,
        ).terms.bedDelta,
      ),
    );
  });

  test("vegetation traps sediment and rock keeps it moving", () => {
    // Carried load above capacity with no flow to entrain more: deposition is the only live term. One pass at a
    // small dtScale so neither cell saturates against `carried` and the ratio stays the table's (S10).
    const settledIn = (materialId: number): SedimentGrid =>
      restingGrid({
        depth: () => 0.5, // capacity > 0, and the seeded load sits above it
        velocityX: () => CHANNEL_SPEED,
        load: () => 0.12,
        material: () => materialId,
      });

    const deposited = (materialId: number): number => {
      const { terms } = advanceSedimentStep(
        settledIn(materialId),
        paramsWith({ detachRate: 0.0, settleRate: 0.06, dtScale: 1.0 }),
      );
      return totalOf(terms.deposition);
    };

    const dirt = deposited(MATERIAL_BARE_DIRT);
    expect(dirt).toBeGreaterThan(0.0);

    const grass = deposited(MATERIAL_GRASS);
    const rocks = deposited(MATERIAL_ROCKS);

    // Vegetation traps sediment (settling is 1.5x) and rock keeps it moving (0.8x), locally per material id (A9).
    expectRatio(
      grass / dirt,
      DEPOSITION_FACTOR_GRASS / DEPOSITION_FACTOR_BARE_DIRT,
    );
    expectRatio(
      rocks / dirt,
      DEPOSITION_FACTOR_ROCKS / DEPOSITION_FACTOR_BARE_DIRT,
    );

    // Locality: with grass only in a band, rows outside it settle exactly the same as all-dirt.
    const mixed = restingGrid({
      depth: () => 0.5,
      velocityX: () => CHANNEL_SPEED,
      load: () => 0.12,
      material: (_column, row) =>
        row >= 3 && row <= 6 ? MATERIAL_GRASS : MATERIAL_BARE_DIRT,
    });
    const allDirt = restingGrid({
      depth: () => 0.5,
      velocityX: () => CHANNEL_SPEED,
      load: () => 0.12,
    });
    const mixedTerms = advanceSedimentStep(
      mixed,
      DEFAULT_SEDIMENT_PARAMS,
    ).terms;
    const dirtTerms = advanceSedimentStep(
      allDirt,
      DEFAULT_SEDIMENT_PARAMS,
    ).terms;

    for (let row = 0; row < SIZE; row++) {
      if (row >= 3 && row <= 6) {
        continue; // the band itself is what changed
      }
      const index = row * SIZE;
      expect(mixedTerms.deposition[index]).toBe(dirtTerms.deposition[index]);
    }
  });

  test("measures how fast real terrain cuts, which is where tuning happens cheaply", () => {
    // S8/S10: the reference model exists so coefficient tuning costs microseconds. These are the numbers that
    // decide whether A8's defaults still make sense now that unpainted terrain arrives as grass (A9) rather than
    // the implicit dirt of steps 2-3 - a 45-second simulation is not how anyone should be finding this out.
    //
    // App-like conditions: water that has already been friction-scaled by whatever covers it, a slope steep
    // enough to keep shear well above critical (tau ~ u^2 * (1 + SLOPE_GAIN * drop), A5), and one pass per frame.
    const passesToCut = (materialId: number): number => {
      const grid = restingGrid({
        depth: () => 0.08, // thin sheet flow, well above WET_THRESHOLD so the still-water boost is off
        velocityX: () => 0.75,
        material: () => materialId,
        bed: (column) => BASE_HEIGHT - 0.02 * column, // steady descent along the flow, so SLOPE_GAIN bites (A5)
      });

      // Measured as a drop from the probe cell's own elevation and well clear of its bedrock, so availability
      // cannot be what stops the cut and the number means "how long until this cell is visibly lower".
      const probe = 8 * SIZE + 4;
      const startBed = grid.bed[probe];

      let current = cloneSedimentGrid(grid);
      for (let pass = 1; pass <= 200000; pass++) {
        current = advanceSedimentStep(current, DEFAULT_SEDIMENT_PARAMS).grid;
        if (
          current.bed[probe] + current.pendingDelta[probe] <=
          startBed - CUT_TARGET
        ) {
          return pass; // ~16.7 ms per pass at 60 fps
        }
      }
      return Number.POSITIVE_INFINITY;
    };

    const grassPasses = passesToCut(MATERIAL_GRASS);
    const dirtPasses = passesToCut(MATERIAL_BARE_DIRT);

    // The ratio is physics, not tuning: at the same flow and slope, cutting grass takes 1/erodibility as long as
    // cutting bare dirt - until capacity or availability binds, which they do not here by construction.
    // Pass counts are integers, so the ratio is quantised at 1/passes - a couple of percent is as tight as this
    // particular measurement can be, and it still separates "material matters" from "material was ignored".
    const passRatio = grassPasses / dirtPasses;
    const expectedPassRatio = ERODIBILITY_BARE_DIRT / ERODIBILITY_GRASS;
    expect(
      Math.abs(passRatio - expectedPassRatio) / expectedPassRatio,
    ).toBeLessThan(0.02);

    // The absolute numbers are the tuning record. Printed rather than asserted at a magic value, because "how
    // long until a channel is visible" is a design judgement; what has to be caught mechanically is an order of
    // magnitude regression in either direction (a detached rate that stopped cutting, or one that cuts in a frame).
    const secondsToCut = (passes: number): string =>
      (passes * (1 / 60)).toFixed(2);
    console.info(
      `[sediment tuning] cut ${CUT_TARGET} bed units at u=0.75, slope drop 0.02/texel: ` +
        `bare dirt ${dirtPasses} passes (~${secondsToCut(dirtPasses)}s), ` +
        `grass ${grassPasses} passes (~${secondsToCut(grassPasses)}s)`,
    );

    expect(dirtPasses).toBeGreaterThan(1); // not cutting in a single frame
    expect(grassPasses).toBeLessThan(60 * 60 * 10); // and not invisible over ten minutes of running
  });
});
