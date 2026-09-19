/**
 * CPU reference model for the sediment pass: src/shaders/compute/sediment-flow.frag plus the one-line
 * bed integration of terrain-height.frag (plan S8/S10, A17 step 5).
 *
 * The point of this file is that every invariant in SEDIMENT-CONSERVATION-PLAN.md can be checked in double
 * precision at microsecond cost, against the same arithmetic the GPU runs - so a conservation failure has one
 * explanation left: the model and the shader have drifted apart. tests/unit/sedimentConservation.test.ts pins
 * that drift with source-level assertions on the GLSL text, and A17 step 6 imports this same module into the
 * browser page to compare it texel-for-texel with the real variable.
 *
 * It is a transcription, not a reimplementation: each shader helper has exactly one counterpart here, in the
 * same evaluation order (A3), and nothing else. Deviating here means the parity test is comparing two
 * different algorithms and proving nothing.
 *
 * One precision caveat worth naming before anyone is surprised by it: fields are Float32Array here exactly as they
 * are RGBA32F on the GPU, so a value that has to hold both "elevation ~1.0" and "change of 5e-9" rounds the change
 * away. A cell parked on its bedrock with sub-ulp soil left therefore nibbles at itself - availableSoil comes back
 * as a residue of two roundings, erosion equals that residue, and committing it can round to nothing while the load
 * side absorbs something, or vice versa. Measured: ~1e-4 relative drift in M* over thousands of passes of exactly
 * that pathological state (rates pinned absurdly high, settleRate 0, every cell at its floor), against ~1e-7 per
 * pass whenever a cut is actually moving more mass than an ulp. That is storage precision, not the algorithm: no
 * term in this file creates or destroys material, and the invariant tests are written with the two regimes apart so
 * neither one gets to excuse the other. Raising bed elevation resolution (packing it across two channels) would fix
 * the noise floor; nothing in steps 1-5 needs that yet.
 *
 * Two differences from the GPU are deliberate and bounded:
 * - The arithmetic on top of the fields is double precision, so no term accumulates order-dependent round-off and
 *   nothing has to be reasoned about per-operation. Field writes stay float32 exactly as RGBA32F does, which puts
 *   measured conservation at float32 storage noise (~1e-7 relative per pass) rather than double's 1e-15: see the
 *   note above. What that buys is scale separation - a structural term wired wrong shows up around 1e-1, orders of
 *   magnitude clear of the noise floor, so the invariants can be asserted tightly without ever being ambiguous.
 * - Texel sampling mirrors NEAREST filtering: GPUComputationRenderer.addVariable seeds every variable with
 *   NearestFilter and createRenderTarget passes it straight through, so no dependency texture is interpolated
 *   inside a compute pass. An offset read therefore resolves to floor(own + 0.5 + offset), clamping at the edge
 *   exactly as a clamp-to-edge fetch does. For the eight canonical directions water-velocity.frag can emit that is
 *   the neighbour texel - including diagonals, whose unit components are 0.7071 > 0.5, which is why bedShearAt's
 *   diagonal shear reads the diagonal bank rather than a blend of it and this cell. If three ever changes those
 *   filter defaults, offsetTexel is the place that has to change with it (and the parity diff at step 6 will say so
 *   loudly).
 */

// --- Shader constants (mirrored; drift-guarded by tests/unit/sedimentConservation.test.ts) --------------

export const EPS = 1e-7; // every divide in the shader is guarded by max(x, EPS)
export const ADVECT_HALF_SPEED = 0.1; // phi reaches half its cap at this speed
export const SLOPE_GAIN = 20.0; // how strongly a downhill drop amplifies bed shear (A5)
export const WET_THRESHOLD = 0.01; // depth below which settling stops being boosted
export const CAPACITY_CEILING = 0.25; // capacity has to saturate, or erosion pins at availability (A6)
export const STILL_WATER_BOOST = 8.0; // settling multiplier in still water (A7, section 4.5)

// Granular relaxation (dry talus avalanche). TALUS_MOVE_CEILING bounds a cell's total outflow against its
// shallowest over-steepened edge, which is what keeps every edge above the repose line instead of ringing.
const TALUS_MOVE_CEILING = 0.5;
const RELAX_COEFFICIENT_CEILING = 1.0; // relaxRate * dtScale saturates against the excess itself

// Surface material ids, as src/scene/resources/textures/surfaceMaterial.ts encodes them in
// surfaceMaterialMap.r, and the A9 factors keyed off them with the shader's < 0.5 / < 1.5 thresholds.
export const MATERIAL_BARE_DIRT = 0.0;
export const MATERIAL_GRASS = 1.0;
export const MATERIAL_ROCKS = 2.0;

export const ERODIBILITY_BARE_DIRT = 1.0;
export const ERODIBILITY_GRASS = 0.3; // roots bind soil (A9)
export const ERODIBILITY_ROCKS = 0.1; // rock resists being cut (A9)

export const DEPOSITION_FACTOR_BARE_DIRT = 1.0;
export const DEPOSITION_FACTOR_GRASS = 1.5; // vegetation traps sediment (A9)
export const DEPOSITION_FACTOR_ROCKS = 0.8; // smooth rock keeps it moving (A9)

/** A8 defaults, i.e. what createGpuSedimentFlow seeds its uniforms with. */
export type SedimentParams = {
  erosionCoefficient: number; // driven by world.erosionRate
  capacityExponent: number;
  criticalSpeed: number;
  detachRate: number;
  settleRate: number;
  transferCap: number; // <= 1: advective CFL analogue + mass safety knob
  erodibleDepth: number; // bedrock = baseHeight - erodibleDepth (A2)
  dtScale: number; // S6 frame-rate coupling, clamped to [0.25, 2] by the sim
  reposeTangent: number; // tan(angle of repose): drop across one edge at which the material comes to rest
  relaxRate: number; // fraction of an over-steepened drop relocated per pass, dtScale-scaled
  texelSpan: number; // world units per texel: turns reposeTangent into a height threshold
};

export const DEFAULT_SEDIMENT_PARAMS: SedimentParams = {
  erosionCoefficient: 0.01,
  capacityExponent: 1.5,
  criticalSpeed: 0.02,
  detachRate: 0.004,
  settleRate: 0.06,
  transferCap: 0.5,
  erodibleDepth: 0.35,
  dtScale: 1.0,
  reposeTangent: 1.7320508, // tan(60 degrees), the steep default above
  relaxRate: 0.25,
  texelSpan: 12 / 512, // terrainSize / SIM_SIZE, i.e. production geometry
};

// The direction table water-velocity.frag emits from and sediment-flow.frag snaps back to (A4). Texel steps,
// so diagonals are deliberately unnormalised; index order is the shader's, and OPPOSITE_INDEX relies on it.
export const DIRECTION_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // North
  [1, 1], // Northeast
  [1, 0], // East
  [1, -1], // Southeast
  [0, -1], // South
  [-1, -1], // Southwest
  [-1, 0], // West
  [-1, 1], // Northwest
];

const OPPOSITE_OFFSET = 4; // N<->S, NE<->SW, E<->W, SE<->NW

// --- Grid state -----------------------------------------------------------------------------------------

/**
 * One grid of simulation state, row-major with index = row * size + column, in the same orientation a
 * readRenderTargetPixels buffer comes back in (bottom-left origin, flipY = false fixtures): increasing `row`
 * is +y / north. Float32Array so field values carry into the model at GPU precision even though the arithmetic
 * on top of them is double - reading a fixture is part of what parity means.
 */
export type SedimentGrid = {
  size: number;
  baseHeight: Float32Array; // static base displacement -> immovable bedrock proxy (A2)
  bed: Float32Array; // committed dynamic bed, heightMap.r
  depth: Float32Array; // waterHeight.r
  velocityX: Float32Array; // waterVelocity.r = direction * speed
  velocityY: Float32Array; // waterVelocity.g
  load: Float32Array; // sedimentFlow.b, suspended load in bed-equivalent height units
  material: Float32Array; // surfaceMaterialMap.r, a material id per cell (A9)
  pendingDelta: Float32Array; // sedimentFlow.a as terrain-height.frag sees it at the start of this pass
};

/** Per-cell terms of one pass. Returned for assertions and diagnostics; nothing here feeds back in. */
export type SedimentPassTerms = {
  capacity: Float32Array;
  outflux: Float32Array;
  influx: Float32Array;
  erosion: Float32Array;
  deposition: Float32Array;
  bedDelta: Float32Array; // D - E + granularInflux - granularLoss, the value written to sedimentFlow.a
  route: Int32Array; // where this cell's load went, or -1 for "nothing could leave" (A4)
  granularLoss: Float32Array; // bed material this cell relocated downhill, dry (talus avalanche)
  granularInflux: Float32Array; // bed material this cell received from over-steepened neighbours
};

/** Fresh zeroed grid with a caller-chosen base/bed/material. Every field is owned by the grid. */
export const createSedimentGrid = (
  size: number,
  fields: {
    baseHeight?: (column: number, row: number) => number;
    bed?: (column: number, row: number) => number;
    depth?: (column: number, row: number) => number;
    velocityX?: (column: number, row: number) => number;
    velocityY?: (column: number, row: number) => number;
    load?: (column: number, row: number) => number;
    material?: (column: number, row: number) => number;
  } = {},
): SedimentGrid => {
  const cellCount = size * size;
  const grid: SedimentGrid = {
    size,
    baseHeight: new Float32Array(cellCount),
    bed: new Float32Array(cellCount),
    depth: new Float32Array(cellCount),
    velocityX: new Float32Array(cellCount),
    velocityY: new Float32Array(cellCount),
    load: new Float32Array(cellCount),
    material: new Float32Array(cellCount),
    pendingDelta: new Float32Array(cellCount),
  };

  const fill = (
    target: Float32Array,
    field?: (column: number, row: number) => number,
  ): void => {
    if (!field) {
      return; // zero-filled already, which is what "no water / no load / no pending delta" means
    }
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        target[row * size + column] = field(column, row);
      }
    }
  };

  fill(grid.baseHeight, fields.baseHeight);
  fill(grid.bed, fields.bed);
  fill(grid.depth, fields.depth);
  fill(grid.velocityX, fields.velocityX);
  fill(grid.velocityY, fields.velocityY);
  fill(grid.load, fields.load);
  fill(grid.material, fields.material);

  return grid;
};

/** Copy of a grid with independent buffers: lets a test run the same fixture twice and compare bit-for-bit. */
export const cloneSedimentGrid = (grid: SedimentGrid): SedimentGrid => ({
  size: grid.size,
  baseHeight: new Float32Array(grid.baseHeight),
  bed: new Float32Array(grid.bed),
  depth: new Float32Array(grid.depth),
  velocityX: new Float32Array(grid.velocityX),
  velocityY: new Float32Array(grid.velocityY),
  load: new Float32Array(grid.load),
  material: new Float32Array(grid.material),
  pendingDelta: new Float32Array(grid.pendingDelta),
});

// --- Shader helpers, transcribed one-for-one -------------------------------------------------------------

const clampToInt = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/**
 * sediment-flow.frag OPPOSITE_INDEX. Module-private on purpose: the pairing itself is pinned from outside by
 * DIRECTION_STEPS' order plus the shader's `index < 4 ? index + 4 : index - 4`, so exporting this would add surface
 * that no test can reach (and knip cannot see tests/, so nothing else would notice). */
const oppositeIndex = (index: number): number =>
  index < OPPOSITE_OFFSET ? index + OPPOSITE_OFFSET : index - OPPOSITE_OFFSET;

/**
 * sediment-flow.frag outfluxAt's route predicate: argmax of dot(velocity, unit step) over the canonical table.
 * Exact rather than approximate because water-velocity.frag only ever emits one of those eight directions
 * times a magnitude (A4) - no atan2, so there is no angle wrap to get wrong. Returns -1 for still or dry cells,
 * which carry nothing (section 4.5).
 */
export const routeIndexOf = (velocityX: number, velocityY: number): number => {
  const speed = Math.hypot(velocityX, velocityY);
  if (speed < EPS) {
    return -1;
  }

  let bestIndex = 0;
  let bestDot = -1;
  for (let index = 0; index < DIRECTION_STEPS.length; index++) {
    const [stepX, stepY] = DIRECTION_STEPS[index];
    const candidate =
      (velocityX * stepX + velocityY * stepY) /
      Math.max(Math.hypot(stepX, stepY), EPS);
    if (candidate > bestDot) {
      bestDot = candidate;
      bestIndex = index;
    }
  }
  return bestIndex;
};

/** sediment-flow.frag capacityOf (A6). */
export const capacityOf = (
  speed: number,
  depth: number,
  params: SedimentParams,
): number => {
  const excess = Math.max(speed - params.criticalSpeed, 0.0);
  return Math.min(
    CAPACITY_CEILING,
    Math.pow(excess * depth * params.capacityExponent, params.capacityExponent),
  );
};

/** sediment-flow.frag erodibilityOf (A9) - applied to detachment only, never to capacity (A3). */
export const erodibilityOf = (materialId: number): number =>
  materialId < 0.5
    ? ERODIBILITY_BARE_DIRT
    : materialId < 1.5
      ? ERODIBILITY_GRASS
      : ERODIBILITY_ROCKS;

/** sediment-flow.frag depositionFactorOf (A9). */
export const depositionFactorOf = (materialId: number): number =>
  materialId < 0.5
    ? DEPOSITION_FACTOR_BARE_DIRT
    : materialId < 1.5
      ? DEPOSITION_FACTOR_GRASS
      : DEPOSITION_FACTOR_ROCKS;

/** GLSL smoothstep(0.0, edge, x), which the shader uses for its wet mask. */
const smoothStep = (edge: number, value: number): number => {
  const t = Math.min(1.0, Math.max(0.0, value / edge));
  return t * t * (3 - 2 * t);
};

/** Where a NEAREST fetch at `ownIndex + directionComponent` lands: floor(own + 0.5 + offset), clamped at the
 * grid edge exactly as a clamp-to-edge sampler does. */
const offsetTexel = (own: number, offset: number, size: number): number =>
  clampToInt(Math.floor(own + 0.5 + offset), 0, size - 1);

/** sediment-flow.frag bedShearAt (A5): u^2 * (1 + SLOPE_GAIN * descent along the flow direction). */
const bedShearAt = (
  grid: SedimentGrid,
  column: number,
  row: number,
  directionX: number,
  directionY: number,
  speed: number,
): number => {
  const ownBed = grid.bed[row * grid.size + column];
  const downColumn = offsetTexel(column, directionX, grid.size);
  const downRow = offsetTexel(row, directionY, grid.size);
  const downBed = grid.bed[downRow * grid.size + downColumn];

  const slopeDrop = Math.max(ownBed - downBed, 0.0);
  return speed * speed * (1.0 + SLOPE_GAIN * slopeDrop);
};

/** sediment-flow.frag availableSoilAt (A2). The pending delta is included: it is what terrain-height.frag is
 * about to write, so limiting against it makes the floor unreachable from above without a clamp. */
const availableSoilAt = (
  grid: SedimentGrid,
  column: number,
  row: number,
  params: SedimentParams,
): number => {
  const index = row * grid.size + column;
  const bedAfterScheduledDelta = grid.bed[index] + grid.pendingDelta[index];
  const bedrock = grid.baseHeight[index] - params.erodibleDepth;
  return Math.max(bedAfterScheduledDelta - bedrock, 0.0);
};

/** sediment-flow.frag talusDropFor: repose line for one edge, scaled by that edge's horizontal span. */
const talusDropFor = (index: number, params: SedimentParams): number => {
  const [stepX, stepY] = DIRECTION_STEPS[index];
  return params.reposeTangent * params.texelSpan * Math.hypot(stepX, stepY);
};

/**
 * sediment-flow.frag talusExcessAt: how far the bed at (column,row) stands above the repose line toward
 * `direction`. Zero for an edge that is merely steep-but-standing, which is what makes this a spike detector
 * rather than a smoother. Off-grid targets export nothing (border retention), matching insideGrid's uv test.
 */
const talusExcessAt = (
  grid: SedimentGrid,
  column: number,
  row: number,
  direction: number,
  params: SedimentParams,
): number => {
  const [stepX, stepY] = DIRECTION_STEPS[direction];
  const targetColumn = column + stepX;
  const targetRow = row + stepY;
  if (
    targetColumn < 0 ||
    targetColumn >= grid.size ||
    targetRow < 0 ||
    targetRow >= grid.size
  ) {
    return 0.0;
  }

  const ownBed = grid.bed[row * grid.size + column];
  const downBed = grid.bed[targetRow * grid.size + targetColumn];
  return Math.max(ownBed - downBed - talusDropFor(direction, params), 0.0);
};

/**
 * sediment-flow.frag granularOutfluxAt: granular material the bed at (column,row) relocates across its edge
 * toward `direction`. Reads no depth, velocity or load - debris is terrain moving on its own, water-free.
 *
 * Pure function of the exporter's cell, exactly like outfluxAt, so an importer that re-evaluates it gets identical
 * bits and the grid sum of (influx - loss) telescopes to zero: M* stays conserved with this term folded in.
 */
const granularOutfluxAt = (
  grid: SedimentGrid,
  column: number,
  row: number,
  direction: number,
  params: SedimentParams,
): number => {
  const excess = talusExcessAt(grid, column, row, direction, params);
  if (excess <= 0.0) {
    return 0.0;
  }

  const coefficient = Math.min(
    RELAX_COEFFICIENT_CEILING,
    params.relaxRate * params.dtScale,
  );

  let rawTotal = 0.0;
  let shallowestExcess = excess; // known live, which is what makes the divide below safe
  for (let candidate = 0; candidate < DIRECTION_STEPS.length; candidate++) {
    const edgeExcess = talusExcessAt(grid, column, row, candidate, params);
    if (edgeExcess <= 0.0) {
      continue;
    }

    rawTotal += coefficient * edgeExcess;
    shallowestExcess = Math.min(shallowestExcess, edgeExcess);
  }

  const capTotal = Math.min(
    TALUS_MOVE_CEILING * shallowestExcess,
    availableSoilAt(grid, column, row, params),
  );
  return (
    coefficient * excess * Math.min(1.0, capTotal / Math.max(rawTotal, EPS))
  );
};

/**
 * sediment-flow.frag outfluxAt (A4): how much of the load at `index` leaves this step, and where to. Export
 * and import both call THIS function on the same texel read, so what one cell loses is arithmetically identical
 * to what its downstream neighbour collects - conservation comes from symmetry, not from two formulas agreeing.
 * Zero when the route target is off-grid: border retention (section 4.2 step 6).
 */
const outfluxAt = (
  grid: SedimentGrid,
  column: number,
  row: number,
  params: SedimentParams,
): { flux: number; route: number } => {
  const velocityX = grid.velocityX[row * grid.size + column];
  const velocityY = grid.velocityY[row * grid.size + column];
  const speed = Math.hypot(velocityX, velocityY);

  const route = routeIndexOf(velocityX, velocityY);
  if (route < 0) {
    return { flux: 0.0, route: -1 };
  }

  const [stepX, stepY] = DIRECTION_STEPS[route];
  const targetColumn = column + stepX;
  const targetRow = row + stepY;
  if (
    targetColumn < 0 ||
    targetColumn >= grid.size ||
    targetRow < 0 ||
    targetRow >= grid.size
  ) {
    return { flux: 0.0, route: -1 }; // keeps the load in place, so no neighbour imports from off-grid either
  }

  // The shader's expression, operator for operator: clamp(min(cap, ratio) * dtScale, 0.0, cap). The two bounds
  // work as a pair: min() saturates the transport fraction before dtScale scales it, and the outer clamp is what
  // actually pins phi <= transferCap <= 1 when dtScale sits at its S6 ceiling of 2 - so no cell can ever ship more
  // than it holds (section 4.4's CFL analogue). tests/unit asserts that per pass instead of trusting the reading.
  const phi = Math.min(
    params.transferCap,
    Math.max(
      0.0,
      Math.min(params.transferCap, speed / (speed + ADVECT_HALF_SPEED)) *
        params.dtScale,
    ),
  );

  return { flux: grid.load[row * grid.size + column] * phi, route };
};

// --- One pass --------------------------------------------------------------------------------------------

/**
 * Advance the grid by exactly one compute() of sediment-flow.frag followed by terrain-height.frag.
 *
 * Like GPUComputationRenderer, both variables read the state as it was when the pass began: sediment sees the
 * bed before this pass' exchange and the delta from the previous one, while the bed commits that previously
 * pending delta (A13's one-step lag - which is why M* = sum(load + bed + pendingDelta) is the exactly conserved
 * quantity, not sum(load + bed)). Immutability does the same job here: nothing mutates a field in place, so no
 * texel can observe a neighbour's half-updated value.
 */
export const advanceSedimentStep = (
  grid: SedimentGrid,
  params: SedimentParams = DEFAULT_SEDIMENT_PARAMS,
): { grid: SedimentGrid; terms: SedimentPassTerms } => {
  const { size } = grid;
  const cellCount = size * size;

  const nextLoad = new Float32Array(cellCount);
  const nextBed = new Float32Array(cellCount);
  const nextPendingDelta = new Float32Array(cellCount);

  const terms: SedimentPassTerms = {
    capacity: new Float32Array(cellCount),
    outflux: new Float32Array(cellCount),
    influx: new Float32Array(cellCount),
    erosion: new Float32Array(cellCount),
    deposition: new Float32Array(cellCount),
    bedDelta: new Float32Array(cellCount),
    route: new Int32Array(cellCount).fill(-1),
    granularLoss: new Float32Array(cellCount),
    granularInflux: new Float32Array(cellCount),
  };

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const index = row * size + column;

      // Step 1: inputs. Raw reads only - a clamp here would hide leaks instead of reporting them.
      const previousLoad = grid.load[index];
      const velocityX = grid.velocityX[index];
      const velocityY = grid.velocityY[index];
      const speed = Math.hypot(velocityX, velocityY);

      // Step 6: own export. Only material that was already suspended can leave this step; what gets eroded
      // becomes transportable on the next one (A3), which is what keeps load >= 0 structural.
      const ownOutflux = outfluxAt(grid, column, row, params);
      terms.outflux[index] = ownOutflux.flux;
      terms.route[index] = ownOutflux.route;
      const remaining = previousLoad - ownOutflux.flux; // >= 0 because phi <= transferCap <= 1

      // Step 7: conservative gather. A neighbour contributes exactly when it routes back here.
      let influx = 0.0;
      for (let direction = 0; direction < DIRECTION_STEPS.length; direction++) {
        const [stepX, stepY] = DIRECTION_STEPS[direction];
        const neighborColumn = column + stepX;
        const neighborRow = row + stepY;
        if (
          neighborColumn < 0 ||
          neighborColumn >= size ||
          neighborRow < 0 ||
          neighborRow >= size
        ) {
          continue;
        }

        const neighborOutflux = outfluxAt(
          grid,
          neighborColumn,
          neighborRow,
          params,
        );
        if (
          neighborOutflux.route === oppositeIndex(direction) &&
          neighborOutflux.flux > 0.0
        ) {
          influx += neighborOutflux.flux;
        }
      }
      terms.influx[index] = influx;

      // Dry relaxation across over-steepened edges, ahead of the bed exchange exactly as in the shader: erosion
      // then draws on whatever soil is left, so avalanche and hydraulic cut cannot each remove the same gram.
      let granularLoss = 0.0;
      for (let direction = 0; direction < DIRECTION_STEPS.length; direction++) {
        granularLoss += granularOutfluxAt(grid, column, row, direction, params);
      }
      terms.granularLoss[index] = granularLoss;

      let granularInflux = 0.0;
      for (let direction = 0; direction < DIRECTION_STEPS.length; direction++) {
        const neighborColumn = column + DIRECTION_STEPS[direction][0];
        const neighborRow = row + DIRECTION_STEPS[direction][1];
        if (
          neighborColumn < 0 ||
          neighborColumn >= size ||
          neighborRow < 0 ||
          neighborRow >= size
        ) {
          continue;
        }

        granularInflux += granularOutfluxAt(
          grid,
          neighborColumn,
          neighborRow,
          oppositeIndex(direction),
          params,
        );
      }
      terms.granularInflux[index] = granularInflux;

      // Material for this cell: both exchange tables key off one id (A9). No material map means all-dirt, and
      // dirt is the identity pair 1.0 / 1.0 - so a missing map behaves exactly like bare dirt everywhere (A8).
      const materialId = grid.material[index];

      // Step 8: exchange at the bed, deliberately AFTER transport (A3), bounded by availability (A2) so the cut
      // cannot cross the immovable floor even when a neighbour scheduled part of that same cell away this step.
      const depth = Math.max(grid.depth[index], 0.0);
      const capacity = capacityOf(speed, depth, params);
      terms.capacity[index] = capacity;

      const directionX = speed > EPS ? velocityX / Math.max(speed, EPS) : 0.0;
      const directionY = speed > EPS ? velocityY / Math.max(speed, EPS) : 0.0;
      const bedShear = bedShearAt(
        grid,
        column,
        row,
        directionX,
        directionY,
        speed,
      );
      const criticalShear = params.criticalSpeed * params.criticalSpeed;

      const detachLimit =
        params.erosionCoefficient *
        erodibilityOf(materialId) *
        params.detachRate *
        Math.max(bedShear - criticalShear, 0.0);
      const carryLimit = Math.max(capacity - remaining, 0.0); // how much more this cell's flow can hold (A6)
      // What the avalanche left of the soil budget, so the floor stays unreachable with both terms live.
      const availableSoil = Math.max(
        availableSoilAt(grid, column, row, params) - granularLoss,
        0.0,
      );

      // Erosion is bounded by the capacity gap, so carried <= capacity: material eroded in this pass can never
      // settle in the same pass, because settling only draws down load above local capacity.
      const erosion = Math.min(
        availableSoil,
        params.dtScale * Math.min(detachLimit, carryLimit),
      );
      terms.erosion[index] = erosion;
      const carried = remaining + erosion;

      // Step 9: settling. Quiescent water drops its load faster (A7); a rate multiplier, so it changes how fast
      // material settles, never how much exists.
      const wet = smoothStep(WET_THRESHOLD, depth);
      const stillWaterBoost =
        STILL_WATER_BOOST + (1.0 - STILL_WATER_BOOST) * wet;

      const settleLimit =
        params.dtScale *
        params.settleRate *
        depositionFactorOf(materialId) *
        Math.max(carried - capacity, 0.0) *
        stillWaterBoost;

      // The min() with carried is the mass-returning half of this pairing: it bounds settling by inventory
      // instead of minting height (section 4.5).
      const deposition = Math.min(carried, settleLimit);
      terms.deposition[index] = deposition;

      // No trailing max() on the load: deposition <= carried makes carried - deposition >= 0 structurally, so a
      // negative value could only come from a broken clamp upstream.
      nextLoad[index] = carried - deposition + influx;

      // The granular pair nets to zero across the grid, so this is still a pure bookkeeping sum.
      const bedDelta = deposition - erosion + granularInflux - granularLoss; // signed: terrain-height.frag applies it one pass later (A1)
      terms.bedDelta[index] = bedDelta;
      nextPendingDelta[index] = bedDelta;

      // terrain-height.frag, transcribed: bed + the delta that was pending when this pass began. Exact sum - no
      // rescale, no smoothing, no clamp (S4/A10).
      nextBed[index] = grid.bed[index] + grid.pendingDelta[index];
    }
  }

  return {
    grid: {
      size,
      baseHeight: grid.baseHeight, // static inputs are shared, never written
      depth: grid.depth,
      velocityX: grid.velocityX,
      velocityY: grid.velocityY,
      material: grid.material,
      bed: nextBed,
      load: nextLoad,
      pendingDelta: nextPendingDelta,
    },
    terms,
  };
};

/** Advance the same grid `passCount` times (>= 1) and hand back the final state with its last pass' terms. */
export const runSedimentSteps = (
  grid: SedimentGrid,
  passCount: number,
  params: SedimentParams = DEFAULT_SEDIMENT_PARAMS,
): { grid: SedimentGrid; terms: SedimentPassTerms } => {
  if (passCount < 1) {
    throw new Error(
      `runSedimentSteps needs at least one pass, got ${String(passCount)}`,
    );
  }

  let current = cloneSedimentGrid(grid);
  let result = advanceSedimentStep(current, params);
  for (let pass = 1; pass < passCount; pass++) {
    result = advanceSedimentStep(result.grid, params);
  }
  return { grid: result.grid, terms: result.terms };
};

// --- Metrics ---------------------------------------------------------------------------------------------

/**
 * Kahan-compensated sum over a field (plan S8): the model's individual operations are doubles already, but a
 * naive sum of 256-odd values that mostly cancel still loses digits, and a checker with fewer digits than the
 * invariant it is asserting has no business reporting a leak.
 */
export const kahanSum = (values: Float32Array): number => {
  let sum = 0.0;
  let compensation = 0.0;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    const adjusted = value - compensation;
    const total = sum + adjusted;
    compensation = total - sum - adjusted; // the bit that round-off swallowed
    sum = total;
  }
  return sum;
};

/**
 * M* = sum(load + bed + pendingDelta): conserved exactly per A13, because transport telescopes to zero with
 * border retention and every gram of exchange moves between these three buckets. This is the number every
 * invariant in this file is written against.
 */
export const materialTotal = (grid: SedimentGrid): number =>
  kahanSum(grid.load) + kahanSum(grid.bed) + kahanSum(grid.pendingDelta);

/** Bedrock elevation per A2 - constant across frames, which is what makes it immovable. */
export const bedrockElevation = (
  baseHeight: number,
  erodibleDepth: number,
): number => baseHeight - erodibleDepth;
