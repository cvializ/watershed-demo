uniform sampler2D uTestingTexture;

// Scales the signed bed delta into screen space (plan S9): this replaces the hard-coded * 5.0 so the
// debug view can be re-scaled without touching the shader. createTestingVisualizationMaterialResource
// supplies the value, defaulting to 5.0 to keep the on-screen magnitude it replaced.
uniform float uDeltaScale;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
    // Texel layout of the sediment flow texture (plan A1, written by src/shaders/compute/sediment-flow.frag):
    // R,G = unit transport direction (zero where the cell is dry or still)
    // B   = suspended load, in bed-equivalent height units
    // A   = signed bed delta scheduled for the next committed bed step: deposition - erosion
    vec4 sedimentData = texture2D(uTestingTexture, vUv);

    vec2 direction = sedimentData.rg;
    float suspendedLoad = sedimentData.b;
    float bedDelta = sedimentData.a;

    // Visualize sediment flow:
    // - Base color from suspended load (warm tones: brown to orange)
    // - Direction encoded as a subtle tint
    // - Deposition shown in blue, erosion in red

    // Suspended load visualization: dark brown -> bright orange
    vec3 sedimentColor = mix(
        vec3(0.1, 0.05, 0.0),   // Dark brown (no sediment)
        vec3(1.0, 0.6, 0.2),    // Bright orange (high sediment)
        clamp(suspendedLoad, 0.0, 1.0)
    );

    // Bed-change overlay. Alpha is a delta of the bed rather than a rate, so the sign that means
    // "the bed goes up" is positive: deposition is blue and erosion is red (plan S9 flips these from
    // the pre-conservation texture, where alpha held an erosion-positive rate).
    float bedDeltaStrength = clamp(abs(bedDelta) * uDeltaScale, 0.0, 1.0);
    vec3 bedChangeOverlay;
    if (bedDelta < 0.0) {
        // Erosion: red tint, this cell is scheduled to hand height to the flow
        bedChangeOverlay = mix(vec3(0.0), vec3(1.0, 0.2, 0.0), bedDeltaStrength);
    } else {
        // Deposition: blue tint, this cell is scheduled to receive height from the flow
        bedChangeOverlay = mix(vec3(0.0), vec3(0.0, 0.2, 1.0), bedDeltaStrength);
    }

    // Direction indicator: subtle brightness based on flow direction angle
    float directionAngle = atan(direction.y, direction.x);
    float directionBrightness = 0.5 + 0.1 * sin(directionAngle * 2.0);

    // Combine all components
    vec3 finalColor = sedimentColor * directionBrightness + bedChangeOverlay;

    // Ensure cells with nothing to report stay dark. The gate used to be length(direction), which no
    // longer separates anything: R,G is a unit vector wherever water moves, so it stayed ~1 over cells
    // carrying no load at all while dimming a fast cell that is being cut. Suspended load and a
    // scheduled bed change are the two things this texture reports about a cell.
    float activity = max(clamp(suspendedLoad, 0.0, 1.0), bedDeltaStrength);
    finalColor *= max(activity, 0.1);

    gl_FragColor = vec4(finalColor, 1.0);
}
