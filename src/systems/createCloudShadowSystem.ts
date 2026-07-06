import * as THREE from 'three';
import type { GPUComputationRenderer } from 'three/examples/jsm/Addons.js';

/**
 * Configuration for cloud shadow system
 */
export type CloudShadowConfig = {
    /**
     * Number of active clouds in the simulation
     */
    cloudCount: number;
    
    /**
     * Speed multiplier for cloud movement (higher = faster)
     */
    speed: number;
    
    /**
     * Maximum cloud size in world units
     */
    maxCloudSize: number;
    
    /**
     * How much water clouds deposit when shadow falls on terrain
     */
    depositionRate: number;
};

/**
 * Individual cloud entity in the system
 */
type Cloud = {
    /**
     * Cloud center position (x, y) in world coordinates
     */
    position: THREE.Vector2;
    
    /**
     * Cloud size (radius)
     */
    size: number;
    
    /**
     * Current shadow intensity (0-1)
     */
    intensity: number;
    
    /**
     * Velocity vector for movement
     */
    velocity: THREE.Vector2;
};

/**
 * Cloud shadow system that generates moving clouds which deposit water on terrain
 */
export type CloudShadowSystem = {
    /**
     * Update cloud positions and return uniform values for shaders
     */
    update: (deltaTime: number) => {
        cloudUniforms: THREE.Vector4[];
        time: number;
    };
};


/**
 * Creates an initial cloud shadow texture with no clouds (all zeros).
 */
const createInitialCloudShadowTexture = (size: number): { texture: THREE.DataTexture; data: Float32Array } => {
    const data = new Float32Array(size * size * 4); // RGBA
    const initialCloudShadow = 0.0; // No clouds initially

    for (let i = 0; i < size * size; i++) {
        data[i * 4 + 0] = initialCloudShadow; // R: cloud shadow intensity
        data[i * 4 + 1] = 0.0;                // G: unused
        data[i * 4 + 2] = 0.0;                // B: unused
        data[i * 4 + 3] = 1.0;                // A: alpha
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    console.log('Initial cloud shadow texture created:', {
        size,
        firstValue: data[0],
        lastValue: data[data.length - 4]
    });
    return { texture, data };
};

/**
 * Creates the fragment shader for computing cloud shadow intensity.
 * 
 * This shader renders cloud shadows to a texture using the GPUComputationRenderer.
 * Each cloud is represented as a soft-edged circular shadow based on its position,
 * size, and intensity. The result is a texture where each pixel contains the total
 * cloud shadow intensity (0.0 to 1.0) at that world position.
 */
const getCloudShadowFragmentShader = (): string => {
    return /* glsl */`
        #include <common>

        uniform sampler2D terrainHeightmap;
        uniform vec4 uClouds[16]; // Array of cloud data: (x, y, size, intensity), max 16 clouds
        uniform int uCloudCount;  // Number of active clouds
        uniform float uTerrainSize;

        /**
         * Calculate cloud shadow intensity at a specific world position.
         */
        float calculateCloudShadow(vec2 point, vec4 cloud) {
            // Distance from point to cloud center
            float dx = point.x - cloud.x;
            float dy = point.y - cloud.y;
            float distSq = dx * dx + dy * dy;
            
            // Soft-edged circular cloud shadow
            float radiusSq = cloud.z * cloud.z;
            
            // Smooth falloff at edges using smoothstep
            if (distSq < radiusSq) {
                float t = 1.0 - distSq / radiusSq; // 1 at center, 0 at edge
                return cloud.w * t * t * (3.0 - 2.0 * t); // Smoothstep with intensity
            }
            
            return 0.0;
        }

        /**
         * Calculate total cloud shadow from all clouds at a position.
         */
        float getTotalCloudShadow(vec2 point) {
            float totalShadow = 0.0;
            
            for (int i = 0; i < 16; i++) {
                if (i >= uCloudCount) break;
                
                float shadow = calculateCloudShadow(point, uClouds[i]);
                totalShadow = max(totalShadow, shadow); // Use maximum (not additive)
            }
            
            return totalShadow;
        }

        void main() {
            vec2 cellSize = 1.0 / resolution.xy;
            vec2 uv = gl_FragCoord.xy * cellSize;

            // Convert UV to world coordinates
            float worldX = uv.x * uTerrainSize;
            float worldY = (1.0 - uv.y) * uTerrainSize; // Flip Y for terrain coords
            vec2 worldPos = vec2(worldX, worldY);
            
            // Calculate total cloud shadow intensity
            float cloudShadow = getTotalCloudShadow(worldPos);
            
            // Output: R=cloud shadow intensity, GBA unused
            gl_FragColor = vec4(cloudShadow, 0.0, 0.0, 1.0);
        }
    `;
};

export const createCloudShadowSystem = (
        gpuCompute: GPUComputationRenderer,
        width: number,
        terrainSize: number
) => {
    const { texture: cloudShadowTexture } = createInitialCloudShadowTexture(width);
    const cloudShadowVariable = gpuCompute.addVariable(
        'cloudShadow',
        getCloudShadowFragmentShader(),
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

    // Create cloud shadow system for water deposition
    const cloudShadowSystem = getUpdateFunction({
        cloudCount: 8,
        speed: 0.3,
        maxCloudSize: 3.0,
        depositionRate: 0.15,
    });

    return {
        cloudShadowVariable,
        updateClouds: (deltaTime: number) => {
            const { cloudUniforms } = cloudShadowSystem.update(deltaTime);

            // Update cloud uniforms for cloud shadow computation
            if (cloudUniforms !== undefined) {
                const cloudArray = cloudShadowVariable.material.uniforms.uClouds.value;
                for (let i = 0; i < Math.min(cloudUniforms.length, 16); i++) {
                    cloudArray[i].copy(cloudUniforms[i]);
                }
                cloudShadowVariable.material.uniforms.uCloudCount.value = cloudUniforms.length;
            }
        }
    };
}

/**
 * Creates a cloud shadow system for depositing water on terrain
 * 
 * Clouds move across the landscape and slowly add small amounts of water
 * where their shadows fall, simulating condensation from cooling air under clouds.
 */
const getUpdateFunction = (
    config: Partial<CloudShadowConfig> = {},
): CloudShadowSystem => {
    const defaultConfig: CloudShadowConfig = {
        cloudCount: 8,
        speed: 0.3,
        maxCloudSize: 3.0,
        depositionRate: 0.15,
    };
    
    const settings = { ...defaultConfig, ...config };
    
    let currentTime = 0;
    
    /**
     * Create a single cloud with random properties
     */
    const createCloud = (config: CloudShadowConfig): Cloud => {
        // Random starting position within terrain bounds (assuming 12x12 terrain)
        const x = Math.random() * 12;
        const y = Math.random() * 12;
        
        // Random size within bounds
        const size = 0.5 + Math.random() * config.maxCloudSize;
        
        // Random velocity (moving generally rightward with some variation)
        const speed = config.speed * (0.5 + Math.random() * 1.0);
        const angle = (Math.random() - 0.5) * Math.PI * 0.5; // Mostly horizontal
        const velocity = new THREE.Vector2(Math.cos(angle), Math.sin(angle)).multiplyScalar(speed);
        
        // Random initial intensity
        const intensity = 0.3 + Math.random() * 0.7;
        
        return {
            position: new THREE.Vector2(x, y),
            size,
            intensity,
            velocity,
        };
    };
    
    // Create cloud entities
    const clouds: Cloud[] = [];
    
    for (let i = 0; i < settings.cloudCount; i++) {
        clouds.push(createCloud(settings));
    }
    
    /**
     * Get cloud data formatted for shader uniforms
     * Returns array of vec4: (x, y, size, intensity) for each cloud
     */
    const getCloudUniforms = (): THREE.Vector4[] => {
        return clouds.map(cloud => 
            new THREE.Vector4(
                cloud.position.x,
                cloud.position.y,
                cloud.size,
                cloud.intensity
            )
        );
    };
    
    /**
     * Update cloud positions for next frame
     */
    const updateClouds = (deltaTime: number): void => {
        currentTime += deltaTime;
        
        for (const cloud of clouds) {
            // Update position
            cloud.position.add(cloud.velocity.clone().multiplyScalar(deltaTime));
            
            // Wrap around terrain edges
            if (cloud.position.x > 12 + cloud.size) {
                cloud.position.x = -cloud.size;
            } else if (cloud.position.x < -cloud.size) {
                cloud.position.x = 12 + cloud.size;
            }
            
            if (cloud.position.y > 12 + cloud.size) {
                cloud.position.y = -cloud.size;
            } else if (cloud.position.y < -cloud.size) {
                cloud.position.y = 12 + cloud.size;
            }
            
            // Slight intensity variation over time
            cloud.intensity = THREE.MathUtils.lerp(
                cloud.intensity,
                0.3 + Math.sin(currentTime * 0.5 + cloud.position.x) * 0.35,
                deltaTime * 0.5
            );
        }
    };
    
    return {
        update: (deltaTime: number) => {
            updateClouds(deltaTime);
            
            return {
                cloudUniforms: getCloudUniforms(),
                time: currentTime,
            };
        },
    };
};