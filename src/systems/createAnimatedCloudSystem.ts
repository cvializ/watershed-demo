import * as THREE from 'three';
import type { GPUComputationRenderer, Variable } from 'three/examples/jsm/Addons.js';

/**
 * Creates the fragment shader for animated cloud computation.
 * 
 * This shader renders animated procedural clouds to a texture using the GPUComputationRenderer.
 * The cloud animation is driven by time and generates moving cloud patterns that can be
 * used for various purposes such as:
 * - Cloud shadow calculation (already implemented in createCloudShadowSystem)
 * - Volumetric cloud effects
 * - Background sky elements
 * - Terrain occlusion
 */
const getAnimatedCloudFragmentShader = (): string => {
    return /* glsl */`
        #include <common>

        uniform float uTime;
        uniform float uSpeed;
        uniform float uScale;
        uniform float uDensity;

        // Simplex noise implementation
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
            const vec2  C = vec2(1.0/6.0, 1.0/3.0);
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);

            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);

            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;

            i = mod289(i);
            vec4 p = permute(permute(permute(
                     i.z + vec4(0.0, i1.z, i2.z, 1.0))
                   + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                   + i.x + vec4(0.0, i1.x, i2.x, 1.0));

            float n_ = 0.142857142857;
            vec3  ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);

            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);

            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

            vec3 p0 = vec3(a0.xy,h.x);
            vec3 p1 = vec3(a0.zw,h.y);
            vec3 p2 = vec3(a1.xy,h.z);
            vec3 p3 = vec3(a1.zw,h.w);

            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;

            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1),
                                        dot(p2,x2), dot(p3,x3)));
        }

        // FBM for more detailed clouds
        float fbm(vec3 p) {
            float value = 0.0;
            float amplitude = 0.5;
            
            for (int i = 0; i < 4; i++) {
                value += amplitude * snoise(p);
                p *= 2.0;
                amplitude *= 0.5;
            }
            
            return value;
        }

        void main() {
            vec2 cellSize = 1.0 / resolution.xy;
            vec2 uv = gl_FragCoord.xy * cellSize;

            // Create animated cloud pattern using FBM
            vec3 noiseInput = vec3(uv * uScale, uTime * uSpeed);
            float cloudNoise = fbm(noiseInput);
            
            // Normalize noise to [0, 1]
            float normalizedNoise = (cloudNoise + 1.0) / 2.0;
            
            // Create cloud shape with density control
            // Use smoothstep for soft cloud edges
            float cloudShape = smoothstep(uDensity - 0.1, uDensity, normalizedNoise);
            
            // Add some texture detail
            float detail = fbm(vec3(uv * uScale * 2.0, uTime * uSpeed * 1.5));
            float cloudDetail = smoothstep(0.2, 0.4, detail);
            
            // Combine cloud shape and detail
            float cloudValue = mix(cloudShape, cloudShape + cloudDetail * 0.3, uDensity);
            
            // Create soft edges using distance falloff
            float edgeSoftness = smoothstep(0.3, 0.9, cloudValue);
            
            // Calculate final alpha based on cloud density
            float alpha = edgeSoftness * cloudValue;
            
            // Output: R=cloud density, GBA unused (can be used for color in future)
            gl_FragColor = vec4(alpha, 0.0, 0.0, 1.0);
        }
    `;
};

/**
 * Creates an initial cloud texture with no clouds (all zeros).
 */
const createInitialCloudTexture = (size: number): { texture: THREE.DataTexture; data: Float32Array } => {
    const data = new Float32Array(size * size * 4); // RGBA
    
    for (let i = 0; i < data.length; i += 4) {
        data[i + 0] = 0.0; // R: cloud density (initially no clouds)
        data[i + 1] = 0.0; // G: unused
        data[i + 2] = 0.0; // B: unused
        data[i + 3] = 1.0; // A: alpha
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    
    return { texture, data };
};

export type AnimatedCloudSystem = {
    cloudVariable: Variable;
    updateClouds: (deltaTime: number) => void;
    
    /**
     * Get the cloud texture from GPU computation render target.
     * This texture can be used as a shadow map on terrain materials.
     */
    getCloudTexture: () => THREE.Texture;
};

/**
 * Creates a GPU-based animated cloud computation system.
 * 
 * This system renders procedural animated clouds to a texture using the GPUComputationRenderer.
 * The cloud patterns move over time and can be sampled by other systems for various effects.
 * 
 * Cloud configuration:
 * - Speed: How fast clouds move through the animation
 * - Scale: Size of cloud features
 * - Density: Controls cloud coverage and opacity
 * 
 * @param gpuCompute - The GPUComputationRenderer instance
 * @param width - Width of the computation texture (height will be same for square grid)
 * @returns Animated cloud system with variable and update function
 */
export const createAnimatedCloudSystem = (
    gpuCompute: GPUComputationRenderer,
    width: number
): AnimatedCloudSystem => {
    const { texture: cloudTexture } = createInitialCloudTexture(width);
    
    const cloudVariable = gpuCompute.addVariable(
        'cloudDensity',
        getAnimatedCloudFragmentShader(),
        cloudTexture
    );
    
    gpuCompute.setVariableDependencies(cloudVariable, [cloudVariable]);
    
    // Initialize uniforms (must be set before updateClouds is called)
    cloudVariable.material.uniforms = {
        uTime: { value: 0.0 },
        uSpeed: { value: 0.1 },
        uScale: { value: 1.5 },
        uDensity: { value: 0.6 },
    };
    
    // Cloud configuration
    const config = {
        speed: 0.1,
        scale: 1.5,
        density: 0.7,
    };

    let currentTime = 0;

    // Update clouds
    const updateClouds = (deltaTime: number): void => {
        currentTime += deltaTime;
        
        // Update uniforms for cloud animation
        cloudVariable.material.uniforms.uTime.value = currentTime;
        cloudVariable.material.uniforms.uSpeed.value = config.speed;
        cloudVariable.material.uniforms.uScale.value = config.scale;
        cloudVariable.material.uniforms.uDensity.value = config.density;
    };

    // Set initial uniforms
    updateClouds(0);

    // Get the cloud texture from GPU computation render target
    const getCloudTexture = (): THREE.Texture => {
        return gpuCompute.getCurrentRenderTarget(cloudVariable).texture;
    };

    return {
        cloudVariable,
        updateClouds: (deltaTime: number) => {
            updateClouds(deltaTime);
            
            // Trigger computation
            gpuCompute.compute();
        },
        getCloudTexture,
    };
};