#include <common>

uniform sampler2D uVelocityMap;
uniform sampler2D uHeightMap;
uniform sampler2D surfaceMaterialMap; // Surface material texture
uniform float baseErosionRate;

// Uniform to indicate if surface material map is available (1.0 = yes, 0.0 = no)
uniform float uHasSurfaceMaterialMap;

void main() {
    // Store: R,G = flow direction, B = amount, A = erosion/deposition rate
    gl_FragColor = vec4(0, 0, 0, 0);
}