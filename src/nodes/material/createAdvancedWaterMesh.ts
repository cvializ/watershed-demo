import * as THREE from 'three';
import { GPUWaterSimulation } from '../simulation/GPUWaterSimulation.js';

/**
 * Create an advanced water mesh with GPU-based physics simulation
 * 
 * @param geometry - Terrain geometry to base the water on
 * @param heightMapTexture - Texture containing terrain elevation data
 * @param gpuSimulation - GPUWaterSimulation instance for physics calculations
 * @returns Water mesh with advanced visualization
 */
export function createAdvancedWaterMesh(
    geometry: THREE.BufferGeometry,
    heightMapTexture: THREE.DataTexture,
    gpuSimulation?: GPUWaterSimulation
): {
    mesh: THREE.Mesh;
    waterHeightTexture: THREE.DataTexture | null;
    velocityTexture: THREE.DataTexture | null;
} {
    // Create water geometry (same as terrain but slightly elevated)
    const waterGeometry = new THREE.PlaneGeometry(10, 10, 256, 256);
    waterGeometry.rotateX(-Math.PI / 2);
    
    // Create uniforms for the material
    const waterHeightTexture = gpuSimulation ? gpuSimulation.getWaterHeightTexture() : null;
    const velocityTexture = gpuSimulation ? gpuSimulation.getVelocityTexture() : null;
    
    // Import shader code
    const vertexShader = `
        uniform sampler2D uDisplacementMap;
        uniform float uTime;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        varying float vWaterHeight;
        
        void main() {
            vUv = uv;
            
            // Get terrain height at this position
            float terrainHeight = texture2D(uDisplacementMap, uv).r;
            
            // Get water height from simulation
            float waterHeight = texture2D(uWaterMap, uv).r;
            vWaterHeight = waterHeight;
            
            // Calculate water surface position
            vec3 pos = position;
            pos.z = terrainHeight + waterHeight * 0.5; // Scale water height for visibility
            
            vPosition = pos;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `;
    
    const fragmentShader = `
        precision highp float;
        
        uniform sampler2D uWaterHeightMap;
        uniform sampler2D uVelocityMap;
        uniform sampler2D uDisplacementMap;
        uniform float uTime;
        uniform vec2 uResolution;
        
        varying vec2 vUv;
        varying float vWaterHeight;
        
        const vec3 DEEP_WATER_COLOR = vec3(0.0, 0.2, 0.5);
        const vec3 SHALLOW_WATER_COLOR = vec3(0.1, 0.6, 1.0);
        
        void main() {
            float eps = 1.0 / max(uResolution.x, uResolution.y);
            
            // Read water height
            float waterHeight = texture2D(uWaterHeightMap, vUv).r;
            
            // Read velocity for flow visualization
            vec2 velocity = texture2D(uVelocityMap, vUv).rg;
            
            // Read terrain height
            float terrainHeight = texture2D(uDisplacementMap, vUv).r;
            
            // Calculate surface normal from height gradient
            float hLeft = texture2D(uWaterHeightMap, vUv - vec2(eps, 0.0)).r;
            float hRight = texture2D(uWaterHeightMap, vUv + vec2(eps, 0.0)).r;
            float hDown = texture2D(uWaterHeightMap, vUv - vec2(0.0, eps)).r;
            float hUp = texture2D(uWaterHeightMap, vUv + vec2(0.0, eps)).r;
            
            // Surface normal
            vec3 normal = normalize(vec3(hLeft - hRight, hDown - hUp, 2.0 * eps));
            
            // Simple lighting
            vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
            vec3 viewDir = normalize(vec3(vUv.x - 0.5, vUv.y - 0.5, 1.0));
            
            float diffuse = max(dot(normal, lightDir), 0.0);
            
            // Specular
            vec3 reflectDir = reflect(-lightDir, normal);
            float spec = pow(max(dot(reflectDir, viewDir), 0.0), 32.0);
            
            // Fresnel
            float fresnel = pow(1.0 - dot(viewDir, normal), 5.0);
            
            // Color based on water height
            vec3 waterColor;
            if (waterHeight < 0.2) {
                waterColor = mix(vec3(0.2, 0.7, 1.0), SHALLOW_WATER_COLOR, waterHeight * 5.0);
            } else if (waterHeight < 0.8) {
                waterColor = mix(SHALLOW_WATER_COLOR, DEEP_WATER_COLOR, (waterHeight - 0.2) / 0.6);
            } else {
                waterColor = DEEP_WATER_COLOR;
            }
            
            // Combine lighting
            vec3 finalColor = waterColor * (0.3 + 0.7 * diffuse);
            finalColor += vec3(1.0) * spec * 0.3;
            
            // Sky reflection
            vec3 skyColor = vec3(0.1, 0.2, 0.4);
            finalColor = mix(finalColor, skyColor, fresnel * 0.3);
            
            // Opacity
            float opacity = clamp(waterHeight * 0.8 + 0.2, 0.1, 0.9);
            if (waterHeight < 0.05) {
                opacity *= waterHeight * 20.0;
            }
            
            gl_FragColor = vec4(finalColor, opacity);
        }
    `;
    
    // Create material
    const waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uDisplacementMap: { value: heightMapTexture },
            uWaterHeightMap: { value: waterHeightTexture },
            uVelocityMap: { value: velocityTexture },
            uTime: { value: 0.0 },
            uResolution: { value: new THREE.Vector2(512, 512) }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });
    
    // Create mesh
    const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    
    return {
        mesh: waterMesh,
        waterHeightTexture: waterHeightTexture,
        velocityTexture: velocityTexture
    };
}

/**
 * Create a simplified water visualization using existing material structure
 * 
 * @param geometry - Terrain geometry
 * @param heightMapTexture - Terrain height map texture
 * @returns Water mesh configuration
 */
export function createWaterMesh(
    geometry: THREE.BufferGeometry,
    heightMapTexture: THREE.DataTexture
): {
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
} {
    // Create water geometry
    const waterGeometry = new THREE.PlaneGeometry(10, 10, 256, 256);
    waterGeometry.rotateX(-Math.PI / 2);
    
    // Create vertex shader for displacement
    const vertexShader = `
        uniform sampler2D uHeightMap;
        varying vec2 vUv;
        
        void main() {
            vUv = uv;
            float waterHeight = texture2D(uHeightMap, uv).r;
            
            vec3 pos = position;
            pos.z += waterHeight * 0.5; // Scale for visibility
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `;
    
    // Create fragment shader for water color
    const fragmentShader = `
        precision highp float;
        
        uniform sampler2D uHeightMap;
        uniform float uTime;
        varying vec2 vUv;
        
        void main() {
            // Read water height
            float waterHeight = texture2D(uHeightMap, vUv).r;
            
            // Water color based on height
            vec3 deepColor = vec3(0.0, 0.25, 0.6);
            vec3 shallowColor = vec3(0.0, 0.5, 1.0);
            vec3 waterColor = mix(deepColor, shallowColor, clamp(waterHeight * 0.5, 0.0, 1.0));
            
            // Simple shimmer effect
            float shimmer = sin(vUv.x * 20.0 + uTime * 5.0) * 
                           cos(vUv.y * 20.0 + uTime * 3.0) * 0.1;
            waterColor += shimmer;
            
            // Opacity based on depth
            float opacity = clamp(waterHeight * 0.8 + 0.2, 0.1, 0.9);
            if (waterHeight < 0.05) {
                opacity *= waterHeight * 20.0;
            }
            
            gl_FragColor = vec4(waterColor, opacity);
        }
    `;
    
    // Create material
    const waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uHeightMap: { value: heightMapTexture },
            uTime: { value: 0.0 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });
    
    // Create mesh
    const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    
    return {
        mesh: waterMesh,
        material: waterMaterial
    };
}