uniform sampler2D uTestingTexture;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
    // Sample the testing texture
    vec4 testingColor = texture2D(uTestingTexture, vUv);
    
    // Use the testing color as the final fragment color
    gl_FragColor = testingColor;
}