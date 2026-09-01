// Bed integration: the exact accumulation of what sediment scheduled for it (plan S4/A10).
//
// Injected samplers from declared dependencies (do not re-declare):
// - heightMap:     this variable itself, i.e. last committed bed elevation in .r
// - sedimentFlow:  R,G = transport direction | B = suspended load | A = signed bed delta D - E
//
// The exchange is already balanced where it was computed: erosion subtracted from the suspended
// load's cell of origin reappears here as a negative alpha, deposition as a positive one. So this
// pass is a plain sum - no rescaling, no Laplacian smoothing, no clamp. Each of those used to mint
// or destroy mass (the removed version wrote -rate * 0.02 and then blended 30% toward the neighbour
// average), and the immovable floor does not belong here either: it is enforced upstream by limiting
// erosion against available soil, which makes clamping unnecessary (plan A2).

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    float bed = texture2D(heightMap, uv).r;
    float scheduledBedDelta = texture2D(sedimentFlow, uv).a;

    gl_FragColor = vec4(bed + scheduledBedDelta, 0.0, 0.0, 1.0);
}
