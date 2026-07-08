import * as THREE from 'three';
import type { GPUComputationRenderer, Variable } from 'three/examples/jsm/Addons.js';
import cloudShadowFragmentShader from '@/shaders/compute/cloud-shadow.frag?raw';

const createInitialCloudShadowTexture = (size: number): { texture: THREE.DataTexture; data: Float32Array } => {
    const data = new Float32Array(size * size * 4);
    
    for (let i = 0; i < data.length; i += 4) {
        data[i + 0] = 0.0; // R: cloud shadow intensity
        data[i + 1] = 0.0; // G
        data[i + 2] = 0.0; // B
        data[i + 3] = 1.0; // A: alpha
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    
    return { texture, data };
};

export type CloudShadowSystem = {
    cloudShadowVariable: Variable;
    updateClouds: (deltaTime: number) => void;
};

export const createCloudShadowSystem = (
    gpuCompute: GPUComputationRenderer,
    width: number,
    terrainSize: number
): CloudShadowSystem => {
    const { texture: cloudShadowTexture } = createInitialCloudShadowTexture(width);
    
    const cloudShadowVariable = gpuCompute.addVariable(
        'cloudShadow',
        cloudShadowFragmentShader,
        cloudShadowTexture
    );
    
    gpuCompute.setVariableDependencies(cloudShadowVariable, [cloudShadowVariable]);
    cloudShadowVariable.material.uniforms.uTerrainSize = { value: terrainSize };
    
    const cloudUniforms: THREE.Vector4[] = [];
    for (let i = 0; i < 16; i++) {
        cloudUniforms.push(new THREE.Vector4(0.0, 0.0, 0.0, 0.0));
    }
    
    cloudShadowVariable.material.uniforms.uClouds = { value: cloudUniforms };
    cloudShadowVariable.material.uniforms.uCloudCount = { value: 0 };

    // Cloud configuration
    const config = {
        cloudCount: 8,
        speed: 0.3,
        maxCloudSize: 3.0,
        depositionRate: 0.15,
    };

    // Cloud entities
    const clouds = Array.from({ length: config.cloudCount }, () => {
        const x = Math.random() * 12;
        const y = Math.random() * 12;
        const size = 0.5 + Math.random() * config.maxCloudSize;
        const speed = config.speed * (0.5 + Math.random() * 1.0);
        const angle = (Math.random() - 0.5) * Math.PI * 0.5;
        const velocity = new THREE.Vector2(Math.cos(angle), Math.sin(angle)).multiplyScalar(speed);
        
        return {
            position: new THREE.Vector2(x, y),
            size,
            intensity: 0.3 + Math.random() * 0.7,
            velocity,
        };
    });

    let currentTime = 0;

    // Update clouds
    const updateClouds = (deltaTime: number): void => {
        currentTime += deltaTime;
        
        for (const cloud of clouds) {
            // Move cloud
            cloud.position.add(cloud.velocity.clone().multiplyScalar(deltaTime));
            
            // Wrap around edges
            if (cloud.position.x > 12 + cloud.size) cloud.position.x = -cloud.size;
            else if (cloud.position.x < -cloud.size) cloud.position.x = 12 + cloud.size;
            
            if (cloud.position.y > 12 + cloud.size) cloud.position.y = -cloud.size;
            else if (cloud.position.y < -cloud.size) cloud.position.y = 12 + cloud.size;
            
            // Slight intensity variation
            cloud.intensity = THREE.MathUtils.lerp(
                cloud.intensity,
                0.3 + Math.sin(currentTime * 0.5 + cloud.position.x) * 0.35,
                deltaTime * 0.5
            );
        }
    };

    // Get cloud data for shader uniforms
    const getCloudUniforms = (): THREE.Vector4[] => 
        clouds.map(cloud => 
            new THREE.Vector4(
                cloud.position.x,
                cloud.position.y,
                cloud.size,
                cloud.intensity
            )
        );

    return {
        cloudShadowVariable,
        updateClouds: (deltaTime: number) => {
            updateClouds(deltaTime);
            
            const uniforms = getCloudUniforms();
            const cloudArray = cloudShadowVariable.material.uniforms.uClouds.value;
            
            for (let i = 0; i < Math.min(uniforms.length, 16); i++) {
                cloudArray[i].copy(uniforms[i]);
            }
            
            cloudShadowVariable.material.uniforms.uCloudCount.value = uniforms.length;
        },
    };
};