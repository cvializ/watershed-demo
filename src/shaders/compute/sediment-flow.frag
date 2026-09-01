#include <common>

// Dependency samplers waterVelocity / waterHeight / heightMap / sedimentFlow are injected by
// GPUComputationRenderer from this variable's declared dependencies, so re-declaring them here
// would be a compile error. Only custom textures are declared below (plan section 2).

uniform sampler2D uBaseHeightMap; // Static base displacement -> immovable bedrock proxy (A2)
uniform sampler2D surfaceMaterialMap; // Surface material id per cell (A9)

// Parameters (S6/A8). Erosion/deposition exchange is wired in the next step of the delivery order
// (A17); transport is already live, which is why these are declared and bound now.
uniform float erosionCoefficient; // driven by world.erosionRate
uniform float capacityExponent;
uniform float criticalSpeed;
uniform float detachRate;
uniform float settleRate;
uniform float transferCap; // <= 1: advective CFL analogue + mass safety knob
uniform float erodibleDepth; // bedrock = uBaseHeightMap.r - erodibleDepth (A2)
uniform float dtScale;

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

int OPPOSITE_INDEX(int index) {
    return index < 4 ? index + 4 : index - 4; // N<->S, NE<->SW, E<->W, SE<->NW
}

bool insideGrid(vec2 uv) {
    return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
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

    // Exchange at the bed is added in the next step (E = D = 0 here), so no bed delta is scheduled:
    // terrain-height.frag keeps the bed exactly where it is while load advects.
    float erosion = 0.0;
    float deposition = 0.0;
    float suspendedLoad = remaining + influx + erosion - deposition;
    float bedDelta = deposition - erosion;

    gl_FragColor = vec4(
        transportDirection.x,
        transportDirection.y,
        max(suspendedLoad, 0.0), // structural already; guards only against float noise
        bedDelta
    );
}
