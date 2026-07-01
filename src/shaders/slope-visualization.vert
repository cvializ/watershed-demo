varying vec2 vUv;
varying vec3 vNormal;

// Simple pseudo-random noise function (matches main.ts)
float hash(vec2 p) {
    return fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
           (c - a)* u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
}

float getRiverDepth(vec2 p) {
    vec2 riverCenter = vec2(sin(p.y * 0.3) * 4.0 + p.x * 0.5, 0.0);
    float distanceFromRiver = abs(p.x - riverCenter.x);

    if (distanceFromRiver >= 2.5) return 0.0;

    float depth = (2.5 - distanceFromRiver) / 2.5;
    return pow(depth, 1.5);
}

// Calculate height at a position using the same noise function as main.ts
float calculateHeight(vec2 pos) {
    float h = 0.0;
    h += noise(vec2(pos.x, -pos.y) * 0.5) * 1.2;
    h += noise(vec2(pos.x, -pos.y) * 1.0) * 0.6;
    h += noise(vec2(pos.x, -pos.y) * 2.0) * 0.3;

    float riverDepth = getRiverDepth(vec2(pos.x, -pos.y));
    if (riverDepth > 0.1) {
        h -= riverDepth * 1.5;
    }

    return h;
}

void main() {
    vUv = uv;

    // Calculate position in world space (matches main.ts terrain generation)
    vec2 pos = vUv * 12.0 - 6.0;

    // Calculate height at current vertex
    float h = calculateHeight(pos);

    // Calculate slope using finite differences for normal calculation
    float epsilon = 0.15;

    // Compute height at neighboring points
    float hRight = calculateHeight(vec2(pos.x + epsilon, pos.y));
    float hLeft = calculateHeight(vec2(pos.x - epsilon, pos.y));
    float hUp = calculateHeight(vec2(pos.x, pos.y + epsilon));
    float hDown = calculateHeight(vec2(pos.x, pos.y - epsilon));

    // Calculate partial derivatives
    float dx = (hRight - hLeft) / (2.0 * epsilon);
    float dy = (hUp - hDown) / (2.0 * epsilon);

    // Calculate normal from height gradients
    // The normal is perpendicular to the surface
    vec3 tangentX = vec3(1.0, 0.0, dx);
    vec3 tangentY = vec3(0.0, 1.0, dy);
    vec3 normal = normalize(cross(tangentX, tangentY));

    // Flip normal if pointing downward (for terrain that should face up)
    if (normal.z < 0.0) {
        normal = -normal;
    }

    vNormal = normal;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}