uniform sampler2D uPulsingTexture;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
    // Sample the pulsing texture
    vec4 pulsingColor = texture2D(uPulsingTexture, vUv);
    
    // Use the pulsing color as the final fragment color
    gl_FragColor = pulsingColor;
}