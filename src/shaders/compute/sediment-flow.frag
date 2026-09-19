#include <common>

// Dependency samplers waterVelocity / waterHeight / heightMap / sedimentFlow are injected by
// GPUComputationRenderer from this variable's declared dependencies, so re-declaring them here
// would be a compile error. Only custom textures are declared below (plan section 2).

uniform sampler2D uBaseHeightMap; // Static base displacement -> immovable bedrock proxy (A2)
uniform sampler2D surfaceMaterialMap; // Surface material id per cell (A9)

// Parameters (S6/A8) and the A5-A7 constants below. Exchange at the bed is added after transport in
// the same pass, and both clamps are mass-returning, so nothing here needs a re-normalisation.
uniform float erosionCoefficient; // driven by world.erosionRate
uniform float capacityExponent;
uniform float criticalSpeed;
uniform float detachRate;
uniform float settleRate;
uniform float transferCap; // <= 1: advective CFL analogue + mass safety knob
uniform float erodibleDepth; // bedrock = uBaseHeightMap.r - erodibleDepth (A2)
uniform float dtScale;

// Granular relaxation (dry talus avalanche). Debris moves because a slope cannot stand, not because water
// arrives: the terms below read no velocity, no depth and no suspended load, so a dry mountain settles its own
// spikes. They are separate knobs from erosion for the same reason A9 keeps erodibility off capacity - resting
// angle is a property of the material's geometry, not of the flow over it.
uniform float reposeTangent; // tan(angle of repose): the drop across one edge at which this material comes to rest
uniform float relaxRate; // fraction of an over-steepened drop relocated per pass, dtScale-scaled (S6)
uniform float texelSpan; // world units per texel: makes reposeTangent a geometric slope, not a resolution constant

// Same table water-velocity.frag emits from, so snapping a velocity back to a neighbour index is
// exact rather than an approximation through atan2 (plan A4). Diagonals stay unnormalised because
// they are used as texel steps.
const vec2 DIRECTION_STEPS[8] = vec2[](
    vec2(0.0, 1.0),   // North
    vec2(1.0, 1.0),   // Northeast
    vec2(1.0, 0.0),   // East
    vec2(1.0, -1.0),  // Southeast
    vec2(0.0, -1.0),  // South
    vec2(-1.0, -1.0), // Southwest
    vec2(-1.0, 0.0),  // West
    vec2(-1.0, 1.0)   // Northwest
);

// Constants from plan A5-A7. Every divide is guarded: NaN in one texel would poison the bed forever.
const float EPS = 1e-7;
const float ADVECT_HALF_SPEED = 0.1; // phi reaches half its cap at this speed
const float SLOPE_GAIN = 20.0; // how strongly a downhill drop amplifies bed shear (A5)
const float WET_THRESHOLD = 0.01; // depth below which settling stops being boosted

// Surface material factors (A9), keyed off surfaceMaterialMap.r with the same < 0.5 / < 1.5 thresholds
// water-velocity.frag uses, so one painted map drives friction, infiltration and erodibility coherently.
// The two tables stay separate multipliers rather than one: only erosion carries erodibility (A3), which
// is what lets a lake bed resist being cut while remaining a good place to drop sediment.
const float ERODIBILITY_BARE_DIRT = 1.0; // baseline: nothing is holding this soil together
const float ERODIBILITY_GRASS = 0.3; // roots bind soil, so vegetated banks survive (A9)
const float ERODIBILITY_ROCKS = 0.1; // rock resists being cut almost entirely

const float DEPOSITION_FACTOR_BARE_DIRT = 1.0; // baseline settling
const float DEPOSITION_FACTOR_GRASS = 1.5; // stems trap sediment (A9)
const float DEPOSITION_FACTOR_ROCKS = 0.8; // smooth rock lets it keep moving

const float CAPACITY_CEILING = 0.25; // depth * speed is unbounded: capacity has to saturate (A6)
const float STILL_WATER_BOOST = 8.0; // settling multiplier in still water (A7, section 4.5)

// Granular relaxation ceilings. TALUS_MOVE_CEILING bounds a cell's TOTAL outflow against its shallowest
// over-steepened edge: the cell loses height against every neighbour at once, so keeping that total under half
// the shallowest excess leaves every one of its edges above the repose line instead of flipping an edge into the
// opposite over-steepness - which is what would make a spike ring at texel scale rather than subside.
const float TALUS_MOVE_CEILING = 0.5;
const float RELAX_COEFFICIENT_CEILING = 1.0; // relaxRate * dtScale saturates against the excess itself, never unbounded

/**
 * How readily the bed at `materialId` gives up grains to flowing water (A9). Applied to the detachment
 * term only, never to capacity: A3 evaluates it there, and multiplying resistance into both the amount
 * the flow may carry and the amount it may take would count the same material property twice - which
 * would make grassy cells erode less AND deposit sooner for one factor.
 */
float erodibilityOf(float materialId) {
    if (materialId < 0.5) {
        return ERODIBILITY_BARE_DIRT;
    } else if (materialId < 1.5) {
        return ERODIBILITY_GRASS;
    } else {
        return ERODIBILITY_ROCKS;
    }
}

/**
 * How readily quiescent water gives up its load onto `materialId` (A9). Vegetation traps sediment, so the
 * factor > 1 for grass speeds up settling where the flow is already dropping its bed load.
 */
float depositionFactorOf(float materialId) {
    if (materialId < 0.5) {
        return DEPOSITION_FACTOR_BARE_DIRT;
    } else if (materialId < 1.5) {
        return DEPOSITION_FACTOR_GRASS;
    } else {
        return DEPOSITION_FACTOR_ROCKS;
    }
}

int OPPOSITE_INDEX(int index) {
    return index < 4 ? index + 4 : index - 4; // N<->S, NE<->SW, E<->W, SE<->NW
}

bool insideGrid(vec2 uv) {
    return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
}

/**
 * Transport capacity of the flow at `p` (A6). The raw product excess * depth * capacityExponent is
 * unbounded in steep terrain, and an unbounded capacity pins erosion at the availability limit every
 * step - which cuts a channel straight down to bedrock within a few frames. min() with the ceiling
 * saturates without destroying mass: capacity only ever limits how much may move.
 */
float capacityOf(float speed, float depth) {
    float excess = max(speed - criticalSpeed, 0.0);
    return min(
        CAPACITY_CEILING,
        pow(excess * depth * capacityExponent, capacityExponent)
    );
}

/**
 * Bed shear proxy (A5): u^2 * (1 + SLOPE_GAIN * slopeDrop), with slopeDrop the descent along the flow
 * direction over one texel. A cell that is only getting deeper keeps eroding: nothing here references a
 * previous frame, so there is no positive feedback through a stored gradient (section 4.5).
 */
float bedShearAt(
    vec2 p,
    vec2 flowDirection,
    float speed,
    vec2 cellSize
) {
    // heightMap.r is the bed; terrain-height.frag owns it and this variable only reads it (section 2).
    float ownBed = texture2D(heightMap, p).r;
    float downBed = texture2D(
        heightMap,
        clamp(p + flowDirection * cellSize, vec2(0.0), vec2(1.0))
    ).r;

    float slopeDrop = max(ownBed - downBed, 0.0);
    return speed * speed * (1.0 + SLOPE_GAIN * slopeDrop);
}

/**
 * How much of the bed in texel `p` may be cut without crossing the immovable floor (A2). The
 * pending bed delta is included: this pass' neighbours may already have scheduled material out of that
 * cell, and ignoring it would let two cells each cut the same gram in one step. The max() makes a base
 * map that dips below its own erodibleDepth harmless rather than NaN-producing.
 */
float availableSoilAt(vec2 p) {
    float scheduledBedDelta = texture2D(sedimentFlow, p).a;
    float bedAfterScheduledDelta = texture2D(heightMap, p).r + scheduledBedDelta;

    float baseHeight = texture2D(uBaseHeightMap, p).r;
    float bedrock = baseHeight - erodibleDepth;

    return max(bedAfterScheduledDelta - bedrock, 0.0);
}

/**
 * Drop across one edge at which this material comes to rest: tan(repose) times the edge's horizontal span.
 * DIRECTION_STEPS are texel steps, so a diagonal's length() is sqrt(2) and its repose line is correspondingly
 * looser - without that, diagonals would be held to a steeper angle than cardinals for pure geometric reasons.
 */
float talusDropFor(int index) {
    return reposeTangent * texelSpan * length(DIRECTION_STEPS[index]);
}

/**
 * How far the bed at `p` stands above the repose line toward canonical direction `index`: zero for an edge that
 * is simply steep-but-standing. This is the spike detector - a broad dome or a steady hillside has no excess at
 * all, while a texel-scale crest towers over every neighbour it touches.
 */
float talusExcessAt(vec2 p, vec2 cellSize, int index) {
    vec2 target = p + DIRECTION_STEPS[index] * cellSize;
    if (!insideGrid(target)) {
        return 0.0; // border retention: nothing is exported off-grid, so no neighbour imports from beyond either
    }

    float ownBed = texture2D(heightMap, p).r;
    float downBed = texture2D(heightMap, clamp(target, vec2(0.0), vec2(1.0))).r;
    return max(ownBed - downBed - talusDropFor(index), 0.0);
}

/**
 * Granular material the bed at `p` relocates across its edge toward canonical direction `index` this pass.
 *
 * Like outfluxAt, this is a pure function of the EXPORTER's texel: an importer re-evaluates it on the exporter's
 * reads rather than guessing at a matching formula. So what one cell subtracts is bit-for-bit what its neighbour
 * adds, and summing (influx - loss) over the grid telescopes to zero - which is why folding this into the signed
 * bed delta leaves M* = sum(load + bed + pendingDelta) exactly as conserved as it was.
 */
void granularOutfluxAt(vec2 p, vec2 cellSize, int index, out float flux) {
    float excess = talusExcessAt(p, cellSize, index);
    if (excess <= 0.0) {
        flux = 0.0; // the overwhelmingly common case: an edge at rest costs two taps and stops right here
        return;
    }

    float coefficient = min(RELAX_COEFFICIENT_CEILING, relaxRate * dtScale);

    // Both ceilings below are functions of this cell's own texel alone, so re-evaluating them from the importing
    // side produces identical bits. The live-edge guarantee comes from the early return above; only a switched-off
    // rate (relaxRate or dtScale at zero) can leave rawTotal at zero, which is what max(rawTotal, EPS) covers.
    float rawTotal = 0.0;
    float shallowestExcess = excess; // known live, which is what makes the divide below safe
    for (int i = 0; i < 8; i++) {
        float neighborEdge = talusExcessAt(p, cellSize, i);
        if (neighborEdge <= 0.0) {
            continue;
        }

        rawTotal += coefficient * neighborEdge;
        shallowestExcess = min(shallowestExcess, neighborEdge);
    }

    // A2 again from the other side: relaxation may not cut through the immovable floor either, and it draws on
    // the same soil budget hydraulic erosion will draw on below - so main() subtracts this cell's loss first.
    float capTotal = min(TALUS_MOVE_CEILING * shallowestExcess, availableSoilAt(p));
    flux = coefficient * excess * min(1.0, capTotal / max(rawTotal, EPS));
}

/**
 * Suspended load leaving the texel at `p` this step, plus the neighbour index it is routed to (-1
 * when nothing can leave). Both export and import call THIS function with the same `p`, so the value
 * subtracted from one cell is bit-for-bit the value added to its neighbour: mass conservation comes
 * from symmetry rather than from hoping two formulas agree (plan A4/section 4.3).
 */
float outfluxAt(vec2 p, vec2 cellSize, out int route) {
    vec2 velocity = texture2D(waterVelocity, p).rg; // direction * speed
    float u = length(velocity);

    if (u < EPS) {
        route = -1; // dry or still water carries nothing (section 4.5)
        return 0.0;
    }

    // Snap to the canonical direction this velocity was actually emitted from.
    int bestIndex = 0;
    float bestDot = -1.0;
    for (int i = 0; i < 8; i++) {
        vec2 stepVector = DIRECTION_STEPS[i];
        float candidate = dot(velocity, stepVector / max(length(stepVector), EPS));
        if (candidate > bestDot) {
            bestDot = candidate;
            bestIndex = i;
        }
    }

    // Border retention: a cell that would export off-grid keeps its load, so no neighbour ever
    // imports from beyond the edge either (section 4.2 step 6). Silent leak is not acceptable.
    if (!insideGrid(p + DIRECTION_STEPS[bestIndex] * cellSize)) {
        route = -1;
        return 0.0;
    }

    float phi = clamp(
        min(transferCap, u / (u + ADVECT_HALF_SPEED)) * dtScale,
        0.0,
        transferCap
    );
    route = bestIndex;
    return texture2D(sedimentFlow, p).b * phi;
}

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // Step 1: inputs. Raw reads only - a clamp here would hide leaks instead of reporting them.
    float previousLoad = texture2D(sedimentFlow, uv).b;
    vec2 velocity = texture2D(waterVelocity, uv).rg;
    float speed = length(velocity);

    // Transport direction for the debug view: the unit vector velocity was built from (section 4.1).
    vec2 transportDirection = speed > EPS ? velocity / max(speed, EPS) : vec2(0.0);

    // Step 6: own export. Only material that was already suspended can leave this step; what gets
    // eroded becomes transportable on the next one (A3), which is what keeps sNew >= 0 structural.
    int ownRoute;
    float outflux = outfluxAt(uv, cellSize, ownRoute);
    float remaining = previousLoad - outflux; // >= 0 because phi <= transferCap <= 1

    // Step 7: conservative gather. A neighbour contributes exactly when it routes back here.
    float influx = 0.0;
    for (int i = 0; i < 8; i++) {
        vec2 neighborUV = uv + DIRECTION_STEPS[i] * cellSize;
        if (!insideGrid(neighborUV)) {
            continue;
        }

        int neighborRoute;
        float neighborOutflux = outfluxAt(neighborUV, cellSize, neighborRoute);
        if (neighborRoute == OPPOSITE_INDEX(i) && neighborOutflux > 0.0) {
            influx += neighborOutflux;
        }
    }

    // Dry relaxation across over-steepened edges, deliberately ahead of the bed exchange below: erosion then gets
    // whatever is left of this cell's soil budget, so avalanche and hydraulic cut can never each remove the same
    // gram in one step. No water term is read anywhere in these two loops - debris is terrain moving on its own.
    float granularLoss = 0.0;
    for (int i = 0; i < 8; i++) {
        float edgeFlux;
        granularOutfluxAt(uv, cellSize, i, edgeFlux);
        granularLoss += edgeFlux;
    }

    // A neighbour contributes across an edge exactly when it exports to here, re-evaluated on ITS texel read:
    // the grid sum of (granularInflux - granularLoss) is zero by construction.
    float granularInflux = 0.0;
    for (int i = 0; i < 8; i++) {
        vec2 neighborUV = uv + DIRECTION_STEPS[i] * cellSize;
        if (!insideGrid(neighborUV)) {
            continue;
        }

        float neighborEdgeFlux;
        granularOutfluxAt(neighborUV, cellSize, OPPOSITE_INDEX(i), neighborEdgeFlux);
        granularInflux += neighborEdgeFlux;
    }

    // Material for this cell: one tap serves both exchange terms. The sampler can never be null - with no
    // painted map, createGpuSedimentFlow binds a 1x1 all-dirt texture (A8), which is exactly the neutral
    // pair of factors below, so no presence flag is needed.
    float materialId = texture2D(surfaceMaterialMap, uv).r;

    // Step 8: exchange at the bed, deliberately AFTER transport (A3). Erosion is bounded by availability
    // (A2), so the cut cannot cross the immovable floor even when a neighbour scheduled part of that same
    // cell away in this very step, and it is limited by what the material will give up (A9).
    float depth = max(texture2D(waterHeight, uv).r, 0.0);
    float capacity = capacityOf(speed, depth);

    // A5: shear scales with u^2 and is amplified by the descent along the flow direction; material that
    // can be detached this step is additionally rate-limited (S6 dtScale), never made unbounded.
    float bedShear = bedShearAt(uv, transportDirection, speed, cellSize);
    float criticalShear = criticalSpeed * criticalSpeed; // shear is in units of speed^2

    // A9 puts erodibility on the detach term (not on capacity): material resistance and transport
    // capacity are different physical things, sourced from different tables. Grass at 0.3 is what keeps a
    // vegetated bank standing while the same flow guts bare soil next to it.
    // detachRate is the plan's rate limit - 1 means no limit, smaller values only slow the detachment
    // down, so it cannot change where mass ends up, just how quickly it gets there.
    float detachLimit = erosionCoefficient *
        erodibilityOf(materialId) *
        detachRate *
        max(bedShear - criticalShear, 0.0);
    float carryLimit = max(capacity - remaining, 0.0); // how much more this cell's flow can hold (A6)
    float availableSoil = max(availableSoilAt(uv) - granularLoss, 0.0);

    // Erosion is bounded by the capacity gap, so carried <= capacity. That is what stops this pairing
    // from short-circuiting: material eroded in this pass can never settle in the same pass, because
    // settling only draws down load above local capacity - i.e. material that arrived from somewhere
    // else, or moved into slower water. Step 5 retunes rates; it must not remove this property.
    float erosion = min(availableSoil, dtScale * min(detachLimit, carryLimit));
    float carried = remaining + erosion;

    // Step 9: settling. A7: quiescent water drops its load faster; the boost is applied as a rate
    // multiplier, so it changes how fast material settles, never how much exists.
    float wet = smoothstep(0.0, WET_THRESHOLD, depth);
    float stillWaterBoost = mix(STILL_WATER_BOOST, 1.0, wet);

    // A9's deposition factor is a rate multiplier too: grass at 1.5 drops load faster where water is
    // already slack enough to be dropping any - it cannot deposit material the cell is not holding.
    float settleLimit = dtScale *
        settleRate *
        depositionFactorOf(materialId) *
        max(carried - capacity, 0.0) *
        stillWaterBoost;

    // The min() with carried is the mass-returning half of this pairing: it bounds settling by inventory
    // instead of minting height (section 4.5).
    float deposition = min(carried, settleLimit);

    float suspendedLoad = carried - deposition + influx;
    // The granular pair nets to zero across the grid, so this stays a pure bookkeeping sum: no term here mints or
    // destroys material, it only decides how much of it sits where.
    float bedDelta =
        deposition - erosion + granularInflux - granularLoss; // signed: terrain-height.frag applies it next pass (A1)

    // No trailing max() on the load: deposition <= carried makes carried - deposition >= 0 structurally,
    // so a negative value could only come from a broken clamp - and a clamp here would hide that leak
    // instead of reporting it (the test suite asserts load >= 0 per texel for exactly this reason).
    gl_FragColor = vec4(
        transportDirection.x,
        transportDirection.y,
        suspendedLoad,
        bedDelta
    );
}
