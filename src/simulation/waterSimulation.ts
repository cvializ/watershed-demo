import * as THREE from 'three';

/**
 * Water simulation class using GPU render targets for calculations
 * 
 * This class creates a render target with a data texture to calculate new water levels
 * for each point in the height map. The water simulation runs on the GPU using a shader,
 * and results are stored in a texture for efficient access.
 */
export class WaterSimulation {
    private waterTexture: THREE.DataTexture;
    private outputTexture: THREE.DataTexture;
    private renderTarget: THREE.WebGLRenderTarget;
    private material: THREE.ShaderMaterial | null = null;
    
    public width: number;
    public height: number;
    private timeUniform: THREE.Uniform<number>;
    private geometry: THREE.PlaneGeometry;
    
    /**
     * Create a new WaterSimulation instance
     * @param width - Width of the water simulation texture (default: 512)
     * @param height - Height of the water simulation texture (default: 512)
     */
    constructor(width: number = 512, height: number = 512) {
        this.width = width;
        this.height = height;
        
        // Create initial uniform water texture (all ones = full water coverage)
        const waterData = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
            waterData[i] = 1.0;
        }
        
        this.waterTexture = new THREE.DataTexture(
            waterData,
            width,
            height,
            THREE.RedFormat,
            THREE.FloatType
        );
        this.waterTexture.needsUpdate = true;
        
        // Create output texture for render target results
        this.outputTexture = new THREE.DataTexture(
            waterData,
            width,
            height,
            THREE.RedFormat,
            THREE.FloatType
        );
        this.outputTexture.needsUpdate = true;
        
        // Create render target for GPU-based water level calculation
        this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RedFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter
        });
        
        // Geometry for rendering to render target
        this.geometry = new THREE.PlaneGeometry(2, 2);
        
        // Time uniform for animation
        this.timeUniform = new THREE.Uniform(0.0);
    }
    
    /**
     * Set up the shader material for water level calculation
     * @param heightMapTexture - Texture containing terrain height data
     */
    public setupMaterial(heightMapTexture: THREE.DataTexture): void {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uHeightMap: { value: heightMapTexture },
                uWaterMap: { value: this.waterTexture },
                uTime: this.timeUniform,
                uResolution: { value: new THREE.Vector2(this.width, this.height) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                
                uniform sampler2D uHeightMap;     // Terrain height map
                uniform sampler2D uWaterMap;      // Previous water distribution
                uniform float uTime;
                uniform vec2 uResolution;
                
                varying vec2 vUv;
                
                void main() {
                    float eps = 1.0 / 512.0;
                    
                    // Read current water level and terrain height
                    float prevWaterLevel = texture2D(uWaterMap, vUv).r;
                    float terrainHeight = texture2D(uHeightMap, vUv).r;
                    
                    // Sample neighboring heights for gradient computation (larger radius)
                    float hLeft = texture2D(uHeightMap, vUv - vec2(eps, 0.0)).r;
                    float hRight = texture2D(uHeightMap, vUv + vec2(eps, 0.0)).r;
                    float hDown = texture2D(uHeightMap, vUv - vec2(0.0, eps)).r;
                    float hUp = texture2D(uHeightMap, vUv + vec2(0.0, eps)).r;
                    
                    // Sample larger neighborhood for plateau handling
                    float hLeft2 = texture2D(uHeightMap, vUv - vec2(eps * 2.0, 0.0)).r;
                    float hRight2 = texture2D(uHeightMap, vUv + vec2(eps * 2.0, 0.0)).r;
                    float hDown2 = texture2D(uHeightMap, vUv - vec2(0.0, eps * 2.0)).r;
                    float hUp2 = texture2D(uHeightMap, vUv + vec2(0.0, eps * 2.0)).r;
                    
                    // Sample diagonals
                    float hTopLeft = texture2D(uHeightMap, vUv + vec2(-eps, eps)).r;
                    float hTopRight = texture2D(uHeightMap, vUv + vec2(eps, eps)).r;
                    float hBotLeft = texture2D(uHeightMap, vUv + vec2(-eps, -eps)).r;
                    float hBotRight = texture2D(uHeightMap, vUv + vec2(eps, -eps)).r;
                    
                    // Read water from all neighbors
                    float waterLeft = texture2D(uWaterMap, vUv - vec2(eps, 0.0)).r;
                    float waterRight = texture2D(uWaterMap, vUv + vec2(eps, 0.0)).r;
                    float waterDown = texture2D(uWaterMap, vUv - vec2(0.0, eps)).r;
                    float waterUp = texture2D(uWaterMap, vUv + vec2(0.0, eps)).r;
                    
                    // Compute terrain gradient (downhill direction)
                    vec2 gradient = vec2(hRight - hLeft, hUp - hDown);
                    float gradientLen = length(gradient) + 0.001;
                    
                    // Smooth gradient from larger neighborhood
                    vec2 smoothGradient = vec2(
                        (hRight - hLeft) * 0.5 + (hRight2 - hLeft2) * 0.25,
                        (hUp - hDown) * 0.5 + (hUp2 - hDown2) * 0.25
                    );
                    float smoothLen = length(smoothGradient) + 0.001;
                    
                    // Downhill direction - use smooth gradient for consistency
                    vec2 downhillDir = normalize(-smoothGradient);
                    
                    // Find the lowest neighbor in the 8-directional neighborhood
                    float minNeighborHeight = hLeft;
                    if (hRight < minNeighborHeight) minNeighborHeight = hRight;
                    if (hDown < minNeighborHeight) minNeighborHeight = hDown;
                    if (hUp < minNeighborHeight) minNeighborHeight = hUp;
                    if (hTopLeft < minNeighborHeight) minNeighborHeight = hTopLeft;
                    if (hTopRight < minNeighborHeight) minNeighborHeight = hTopRight;
                    if (hBotLeft < minNeighborHeight) minNeighborHeight = hBotLeft;
                    if (hBotRight < minNeighborHeight) minNeighborHeight = hBotRight;
                    
                    float heightDiff = terrainHeight - minNeighborHeight;
                    
                    // Calculate flow weights for each direction
                    float totalWeight = 0.0;
                    vec4 flowWeights = vec4(0.0);
                    
                    // Left neighbor
                    if (hLeft <= terrainHeight) {
                        float diff = terrainHeight - hLeft;
                        flowWeights.r = diff + 0.05; // Minimum weight
                        totalWeight += flowWeights.r;
                    }
                    
                    // Right neighbor  
                    if (hRight <= terrainHeight) {
                        float diff = terrainHeight - hRight;
                        flowWeights.g = diff + 0.05;
                        totalWeight += flowWeights.g;
                    }
                    
                    // Down neighbor
                    if (hDown <= terrainHeight) {
                        float diff = terrainHeight - hDown;
                        flowWeights.b = diff + 0.05;
                        totalWeight += flowWeights.b;
                    }
                    
                    // Up neighbor
                    if (hUp <= terrainHeight) {
                        float diff = terrainHeight - hUp;
                        flowWeights.a = diff + 0.05;
                        totalWeight += flowWeights.a;
                    }
                    
                    // Normalize weights
                    if (totalWeight > 0.0) {
                        flowWeights /= totalWeight;
                    }
                    
                    // Calculate outgoing water - weighted accumulation from downhill neighbors
                    float outgoingWater = 0.0;
                    if (totalWeight > 0.0) {
                        // Weighted combination: own water + neighbors' water
                        outgoingWater = prevWaterLevel * 0.3;
                        if (hLeft <= terrainHeight) outgoingWater += waterLeft * flowWeights.r * 0.7;
                        if (hRight <= terrainHeight) outgoingWater += waterRight * flowWeights.g * 0.7;
                        if (hDown <= terrainHeight) outgoingWater += waterDown * flowWeights.b * 0.7;
                        if (hUp <= terrainHeight) outgoingWater += waterUp * flowWeights.a * 0.7;
                    } else {
                        // All neighbors are uphill - water stays or accumulates
                        outgoingWater = prevWaterLevel;
                    }
                    
                    // Accumulate water from uphill neighbors
                    float incomingWater = 0.0;
                    if (hLeft > terrainHeight) incomingWater += waterLeft * 0.25;
                    if (hRight > terrainHeight) incomingWater += waterRight * 0.25;
                    if (hDown > terrainHeight) incomingWater += waterDown * 0.25;
                    if (hUp > terrainHeight) incomingWater += waterUp * 0.25;
                    
                    // Calculate terrain properties
                    float avgSurrounding = (hLeft + hRight + hDown + hUp) * 0.25;
                    float isBasin = max(0.0, avgSurrounding - terrainHeight);
                    
                    // Slope-based drainage factor
                    float slope = length(vec2(hRight - hLeft, hUp - hDown));
                    float elevationFactor = smoothstep(-1.5, 1.0, terrainHeight);
                    
                    // Drain water from high slopes (water runs off)
                    float drain = 0.0;
                    if (heightDiff > 0.01 && terrainHeight > minNeighborHeight + 0.01) {
                        drain = outgoingWater * slope * 0.25;
                    }
                    
                    // Accumulate water in basins (low points)
                    float accumulation = 0.0;
                    if (isBasin > 0.01 && heightDiff <= 0.0) {
                        accumulation = incomingWater * 0.5;
                    }
                    
                    // Plateau drainage - flow in the direction of smoothed gradient
                    float plateauDrain = 0.0;
                    if (heightDiff <= 0.01 && gradientLen < 0.05) {
                        // On a true plateau with very flat terrain
                        // Use the smoothed downhill direction to guide flow
                        vec2 offsetUV = vUv + downhillDir * eps;
                        float plateauWater = texture2D(uWaterMap, clamp(offsetUV, 0.0, 1.0)).r;
                        float plateauHeight = texture2D(uHeightMap, clamp(offsetUV, 0.0, 1.0)).r;
                        
                        // Only flow if the smooth gradient direction leads downhill
                        if (plateauHeight <= terrainHeight + 0.01) {
                            plateauDrain = (prevWaterLevel * 0.1 + plateauWater * 0.2);
                        }
                    }
                    
                    // Conservation of water: new = old + incoming - outgoing
                    float newWater = prevWaterLevel + accumulation - drain - plateauDrain;
                    
                    // Clamp water level
                    newWater = clamp(newWater, 0.0, 2.0);
                    
                    // Output the new water level
                    gl_FragColor = vec4(newWater, 0.0, 0.0, 1.0);
                }
            `
        });
    }
    
    /**
     * Update water simulation using render target
     * This performs the GPU-based calculation of new water levels for each point
     * in the height map.
     * 
     * @param renderer - The WebGLRenderer to use for rendering
     */
    public update(renderer: THREE.WebGLRenderer): void {
        if (!this.material) return;
        
        // Update time uniform
        this.timeUniform.value = performance.now() * 0.001;
        
        // Set the current water texture as input for the next frame
        this.material.uniforms.uWaterMap.value = this.waterTexture;
        
        // Render to the render target using a quad
        const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        tempCamera.position.z = 1;
        
        const mesh = new THREE.Mesh(this.geometry, this.material);
        
        // Store original render target and set to ours
        const oldRenderTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(this.renderTarget);
        
        // Render the mesh to our render target
        renderer.render(mesh, tempCamera);
        
        // Restore original render target
        renderer.setRenderTarget(oldRenderTarget);
        
        // Read pixels from render target texture to CPU
        const pixels = new Float32Array(this.width * this.height);
        renderer.readRenderTargetPixels(
            this.renderTarget,
            0, 0, this.width, this.height,
            pixels
        );
        
        // Log some sample pixel values (first 10 and last 10)
        const totalFrames = Math.floor(this.timeUniform.value * 60);
        if (totalFrames < 60) {
            console.log('WaterSimulation - renderTarget pixels (frame', totalFrames, '):');
            console.log('  Min:', Math.min(...pixels).toFixed(4), ', Max:', Math.max(...pixels).toFixed(4));
            console.log('  First 10 values:', Array.from(pixels).slice(0, 10).map(v => v.toFixed(4)));
            console.log('  Last 10 values:', Array.from(pixels).slice(-10).map(v => v.toFixed(4)));
        }
        
        // Copy CPU data to output texture (already Float32Array)
        this.outputTexture.image.data.set(pixels);
        this.outputTexture.needsUpdate = true;
        
        // Also update the current water texture for immediate use
        this.waterTexture.image.data.set(pixels);
        this.waterTexture.needsUpdate = true;
    }
    
    /**
     * Get the current water texture for visualization
     */
    public getWaterTexture(): THREE.DataTexture {
        return this.waterTexture;
    }
    
    /**
     * Get the current render target
     */
    public getCurrentRenderTarget(): THREE.RenderTarget {
        return this.renderTarget;
    }
    
    /**
     * Get the render target's texture (useful for reading simulation results)
     */
    public getRenderTargetTexture(): THREE.Texture {
        return this.renderTarget.texture;
    }
}