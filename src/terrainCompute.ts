import * as THREE from 'three';

/**
 * Functional compute shader terrain height visualization
 * This module provides a WebGL-based approach to visualize terrain heights using fragment shaders
 * (since WebGL doesn't support compute shaders natively)
 */

/**
 * Generate terrain height data as a texture that can be used by the material
 */
export function generateHeightTexture(
    width: number, 
    height: number, 
    terrainSize: number
): THREE.DataTexture {
    const data = new Float32Array(width * height);
    
    // Simple noise function (matches the one in main.ts)
    function hash(x: number, z: number): number {
        const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
        return n - Math.floor(n);
    }

    function noise(x: number, z: number): number {
        const x0 = Math.floor(x);
        const z0 = Math.floor(z);
        const fx = x - x0;
        const fz = z - z0;

        const h1 = hash(x0, z0);
        const h2 = hash(x0 + 1, z0);
        const h3 = hash(x0, z0 + 1);
        const h4 = hash(x0 + 1, z0 + 1);

        const sx = fx * fx * (3 - 2 * fx);
        const sz = fz * fz * (3 - 2 * fz);

        const h12 = h1 * (1 - sx) + h2 * sx;
        const h34 = h3 * (1 - sx) + h4 * sx;

        return h12 * (1 - sz) + h34 * sz;
    }

    function getRiverDepth(x: number, z: number): number {
        const riverCenterX = Math.sin(z * 0.3) * 4 + x * 0.5;
        const distanceFromRiver = Math.abs(x - riverCenterX);
        
        let riverDepth = 0;
        if (distanceFromRiver < 2.5) {
            riverDepth = (2.5 - distanceFromRiver) / 2.5;
            riverDepth = Math.pow(riverDepth, 1.5);
        }
        
        return riverDepth;
    }
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Map texture coordinates to world space
            const worldX = (x / width) * terrainSize - terrainSize / 2;
            const worldZ = -(y / height) * terrainSize + terrainSize / 2;

            // Calculate height
            let heightVal = 0;
            heightVal += noise(worldX * 0.5, worldZ * 0.5) * 1.2;
            heightVal += noise(worldX * 1.0, worldZ * 1.0) * 0.6;
            heightVal += noise(worldX * 2.0, worldZ * 2.0) * 0.3;

            // Add river carving
            const riverDepth = getRiverDepth(worldX, worldZ);
            if (riverDepth > 0.1) {
                heightVal -= riverDepth * 1.5;
            }

            data[y * width + x] = heightVal;
        }
    }

    return new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.FloatType);
}

/**
 * Create a shader material that visualizes terrain height using a color palette
 * This replaces vertex colors with GPU-based height-to-color mapping
 */
export function createHeightVisualizationMaterial(
    minHeight: number = -1.5,
    maxHeight: number = 2.0
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uMinHeight: { value: minHeight },
            uMaxHeight: { value: maxHeight }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uMinHeight;
            uniform float uMaxHeight;
            
            varying vec2 vUv;
            
            // Height is sampled from a noise function (same as terrain generation)
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
            
            vec3 getColorPalette(float normalizedHeight) {
                float h = clamp(normalizedHeight, 0.0, 1.0);
                
                float lowEnd = 0.3;
                vec3 colorLow = mix(vec3(0.0, 0.5, 1.0), vec3(0.2, 0.8, 0.3), h / lowEnd);
                
                float highStart = 0.7;
                vec3 colorHigh = mix(vec3(0.2, 0.8, 0.3), vec3(1.0), (h - highStart) / (1.0 - highStart));
                
                vec3 color = mix(colorLow, colorHigh, smoothstep(lowEnd, highStart, h));
                
                // Add subtle terrain detail
                float detail = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
                color += (detail - 0.5) * 0.1;
                
                return clamp(color, 0.0, 1.0);
            }
            
            void main() {
                // Sample position from uv (terrain space)
                vec2 pos = vUv * 12.0 - 6.0;
                
                // Calculate height using same noise function
                float h = 0.0;
                h += noise(pos * 0.5) * 1.2;
                h += noise(pos * 1.0) * 0.6;
                h += noise(pos * 2.0) * 0.3;
                
                // Carve river
                float riverDepth = getRiverDepth(pos);
                if (riverDepth > 0.1) {
                    h -= riverDepth * 1.5;
                }
                
                // Normalize height
                float normalizedHeight = (h - uMinHeight) / (uMaxHeight - uMinHeight);
                
                // Get color from palette
                vec3 color = getColorPalette(normalizedHeight);
                
                gl_FragColor = vec4(color, 1.0);
            }
        `,
        side: THREE.DoubleSide
    });
}

/**
 * Create a compute shader material for height-to-color conversion
 * Uses an external height map texture as input
 */
export function createHeightToColorMaterial(
    heightTexture: THREE.DataTexture,
    minHeight: number = -1.5,
    maxHeight: number = 2.0
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uHeightMap: { value: heightTexture },
            uMinHeight: { value: minHeight },
            uMaxHeight: { value: maxHeight }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uHeightMap;
            uniform float uMinHeight;
            uniform float uMaxHeight;
            
            varying vec2 vUv;
            
            vec3 getColorPalette(float normalizedHeight) {
                float h = clamp(normalizedHeight, 0.0, 1.0);
                
                float lowEnd = 0.3;
                vec3 colorLow = mix(vec3(0.0, 0.5, 1.0), vec3(0.2, 0.8, 0.3), h / lowEnd);
                
                float highStart = 0.7;
                vec3 colorHigh = mix(vec3(0.2, 0.8, 0.3), vec3(1.0), (h - highStart) / (1.0 - highStart));
                
                vec3 color = mix(colorLow, colorHigh, smoothstep(lowEnd, highStart, h));
                
                float detail = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
                color += (detail - 0.5) * 0.1;
                
                return clamp(color, 0.0, 1.0);
            }
            
            void main() {
                // Read height from texture
                float height = texture2D(uHeightMap, vUv).r;
                
                // Normalize height
                float normalizedHeight = (height - uMinHeight) / (uMaxHeight - uMinHeight);
                
                // Get color from palette
                vec3 color = getColorPalette(normalizedHeight);
                
                gl_FragColor = vec4(color, 1.0);
            }
        `,
        side: THREE.DoubleSide
    });
}