varying vec3 vNormal;
uniform float uMinSlope;
uniform float uMaxSlope;

void main() {
    // Calculate slope angle from normal (Z component)
    // For a heightfield, the normal's Z component relates to the slope angle
    // When surface is flat (perpendicular to Z-axis), normal = (0, 0, 1)
    // When surface is steep, normal tilts and Z component decreases
    float slopeAngle = acos(clamp(vNormal.z, -1.0, 1.0));
    
    // Map slope angle to color
    float slopeRange = uMaxSlope - uMinSlope;
    float t = clamp((slopeAngle - uMinSlope) / slopeRange, 0.0, 1.0);
    
    // Color gradient: Blue (flat/0°) -> Purple (medium slope) -> Red (steep/90°)
    vec3 colorFlat = vec3(0.0, 0.0, 1.0);    // Blue
    vec3 colorMedium = vec3(0.5, 0.0, 0.5); // Purple
    vec3 colorSteep = vec3(1.0, 0.0, 0.0);   // Red
    
    vec3 color;
    if (t < 0.5) {
        // Blue to Purple
        color = mix(colorFlat, colorMedium, t * 2.0);
    } else {
        // Purple to Red
        color = mix(colorMedium, colorSteep, (t - 0.5) * 2.0);
    }
    
    gl_FragColor = vec4(color, 1.0);
}