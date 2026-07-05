import * as THREE from 'three';

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
    
    /**
     * Get the configuration used by this system
     */
    getConfig: () => CloudShadowConfig;
};

/**
 * Creates a cloud shadow system for depositing water on terrain
 * 
 * Clouds move across the landscape and slowly add small amounts of water
 * where their shadows fall, simulating condensation from cooling air under clouds.
 */
export const createCloudShadowSystem = (
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
        
        getConfig: () => settings,
    };
};