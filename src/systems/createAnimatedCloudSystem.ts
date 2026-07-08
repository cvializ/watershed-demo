import * as THREE from 'three';
import type { GPUComputationRenderer, Variable } from 'three/examples/jsm/Addons.js';
import animatedCloudFragmentShader from '../shaders/compute/animated-cloud.frag?raw';

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
        animatedCloudFragmentShader,
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