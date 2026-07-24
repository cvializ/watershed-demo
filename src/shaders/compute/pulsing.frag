#include <common>

uniform float uTime;

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // Calculate a pulse value that goes from 0 to 1 and back
    // Using sine wave with period based on uTime
    float pulse = 0.5 + 0.5 * sin(uTime * 2.0);

    // Pulse from white (1.0) to black (0.0)
    vec3 color = vec3(pulse);

    gl_FragColor = vec4(color, 1.0);
}