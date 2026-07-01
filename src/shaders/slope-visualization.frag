precision highp float;

varying vec3 vNormal;

void main() {
    // Convert normal from [-1, 1] range to [0, 1] for display
    // Normal map convention: X=Red, Y=Green, Z=Blue
    vec3 normalColor = vNormal * 0.5 + 0.5;
    
    gl_FragColor = vec4(normalColor, 1.0);
}