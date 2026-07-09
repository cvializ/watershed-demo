#include <common>

uniform sampler2D uHeightMap;
uniform sampler2D uWaterHeightmap;
uniform vec2 uTexelSize;

void main() {
    // Get texture coordinates from GPU computation renderer
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // Get water height at this cell
    float h = texture2D(uWaterHeightmap, uv).r;
    
    // If no water, velocity is zero
    if (h < 0.01) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Compute height gradient using finite differences
    float hX = texture2D(uHeightMap, uv + vec2(uTexelSize.x, 0.0)).r -
               texture2D(uHeightMap, uv - vec2(uTexelSize.x, 0.0)).r;
    float hY = texture2D(uHeightMap, uv + vec2(0.0, uTexelSize.y)).r -
               texture2D(uHeightMap, uv - vec2(0.0, uTexelSize.y)).r;

    // Gradient points uphill, so negative gradient is downslope
    vec2 gradient = normalize(vec2(-hX, -hY));

    // Velocity is proportional to water height (simplified shallow water approximation)
    // and directed downslope
    float speed = h * 5.0; // Scale factor for visibility
    vec2 velocity = gradient * speed;

    // Store velocity in RGB (R=velocityX, G=velocityY, B=magnitude)
    float magnitude = length(velocity);
    gl_FragColor = vec4(velocity.x, velocity.y, magnitude * 0.5, 1.0);
}