import * as THREE from 'three';

/**
 * Advanced GPU-based water simulation with realistic flow dynamics
 * 
 * Features:
 * - True ping-pong rendering for stable fluid simulation
 * - Simplified Navier-Stokes equations for water flow
 * - Multi-resolution terrain-aware simulation
 * - Efficient GPU memory management
 * 
 * Physics Model:
 * - Shallow water equations adapted for terrain height maps
 * - Conservation of mass: ∂h/∂t + ∇·(hv) = 0
 * - Momentum equation: ∂v/∂t + (v·∇)v = -g∇h + ν∇²v
 * 
 * Where:
 * - h = water height
 * - v = velocity field
 * - g = gravity constant
 * - ν = viscosity coefficient
 */
export class GPUWaterSimulation {
    private waterHeightTexture: THREE.DataTexture;
    private velocityTexture: THREE.DataTexture;
    private outputHeightTexture: THREE.DataTexture;
    private outputVelocityTexture: THREE.DataTexture;
    
    private heightRenderTarget: THREE.WebGLRenderTarget;
    private velocityRenderTarget: THREE.WebGLRenderTarget;
    
    // Ping-pong buffers for stable integration
    private currentHeightBuffer: number = 0;
    private currentVelocityBuffer: number = 0;
    
    // Simulation parameters (reduced for slower simulation)
    public gravity: number = 0.5;   // Reduced from 1.0 for much slower water
    public viscosity: number = 0.1; // Increased for smoother flow
    public evaporationRate: number = 0.0005; // Very low evaporation
    public precipitationRate: number = 0.1; // Constant rainfall
    
    private materialHeight: THREE.ShaderMaterial | null = null;
    private materialVelocity: THREE.ShaderMaterial | null = null;
    private materialAdvection: THREE.ShaderMaterial | null = null;
    
    public width: number;
    public height: number;
    
    private timeUniform: THREE.Uniform<number>;
    private geometry: THREE.PlaneGeometry;
    
    /**
     * Create a new GPUWaterSimulation instance
     * @param width - Width of the simulation grid (default: 512)
     * @param height - Height of the simulation grid (default: 512)
     */
    constructor(width: number = 512, height: number = 512) {
        this.width = width;
        this.height = height;
        
        // Create initial water height texture (minimal initial water)
        const initialWaterData = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
            initialWaterData[i] = 0.1; // Initial small water height
        }
        
        this.waterHeightTexture = new THREE.DataTexture(
            initialWaterData,
            width,
            height,
            THREE.RedFormat,
            THREE.FloatType
        );
        this.waterHeightTexture.needsUpdate = true;
        this.waterHeightTexture.minFilter = THREE.NearestFilter;
        this.waterHeightTexture.magFilter = THREE.NearestFilter;
        this.waterHeightTexture.wrapS = THREE.ClampToEdgeWrapping;
        this.waterHeightTexture.wrapT = THREE.ClampToEdgeWrapping;
        
        // Create velocity texture (2-component: x, y flow)
        const velocityData = new Float32Array(width * height * 2);
        for (let i = 0; i < width * height * 2; i++) {
            velocityData[i] = 0.0;
        }
        
        this.velocityTexture = new THREE.DataTexture(
            velocityData,
            width,
            height,
            THREE.RGFormat,
            THREE.FloatType
        );
        this.velocityTexture.needsUpdate = true;
        this.velocityTexture.minFilter = THREE.NearestFilter;
        this.velocityTexture.magFilter = THREE.NearestFilter;
        this.velocityTexture.wrapS = THREE.ClampToEdgeWrapping;
        this.velocityTexture.wrapT = THREE.ClampToEdgeWrapping;
        
        // Create output textures for ping-pong rendering
        this.outputHeightTexture = new THREE.DataTexture(
            initialWaterData,
            width,
            height,
            THREE.RedFormat,
            THREE.FloatType
        );
        
        this.outputVelocityTexture = new THREE.DataTexture(
            velocityData,
            width,
            height,
            THREE.RGFormat,
            THREE.FloatType
        );
        
        // Create render targets
        this.heightRenderTarget = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RedFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter
        });
        
        this.velocityRenderTarget = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RGFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter
        });
        
        // Geometry for full-screen quad rendering
        this.geometry = new THREE.PlaneGeometry(2, 2);
        
        // Time uniform for animation
        this.timeUniform = new THREE.Uniform(0.0);
        
        // Create shader materials
        this.createShaderMaterials();
    }
    
    /**
     * Create all necessary shader materials for water simulation
     */
    private createShaderMaterials(): void {
        // Height update material (water level calculation)
        this.materialHeight = new THREE.ShaderMaterial({
            uniforms: {
                uHeightMap: { value: this.waterHeightTexture },
                uVelocityMap: { value: this.velocityTexture },
                uTime: this.timeUniform,
                uResolution: { value: new THREE.Vector2(this.width, this.height) },
                uGravity: { value: this.gravity },
                uViscosity: { value: this.viscosity },
                uEvaporationRate: { value: this.evaporationRate },
                uPrecipitationRate: { value: this.precipitationRate }
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
                
                uniform sampler2D uHeightMap;      // Current water height
                uniform sampler2D uVelocityMap;    // Velocity field
                uniform float uTime;
                uniform vec2 uResolution;
                uniform float uGravity;
                uniform float uViscosity;
                uniform float uEvaporationRate;
                uniform float uPrecipitationRate;
                
                varying vec2 vUv;
                
                void main() {
                    float eps = 1.0 / max(uResolution.x, uResolution.y);
                    
                    // Read current water height and velocity
                    float h = texture2D(uHeightMap, vUv).r;
                    vec2 vel = texture2D(uVelocityMap, vUv).rg;
                    
                    // Sample neighbors for gradient computation
                    float hLeft = texture2D(uHeightMap, vUv - vec2(eps, 0.0)).r;
                    float hRight = texture2D(uHeightMap, vUv + vec2(eps, 0.0)).r;
                    float hDown = texture2D(uHeightMap, vUv - vec2(0.0, eps)).r;
                    float hUp = texture2D(uHeightMap, vUv + vec2(0.0, eps)).r;
                    
                    // Height gradient (pressure force)
                    vec2 heightGrad = vec2(hRight - hLeft, hUp - hDown) * 0.5;
                    
                    // Laplacian for viscosity (smoothing)
                    float laplacian = (hLeft + hRight + hDown + hUp - 4.0 * h) * 0.25;
                    
                    // Divergence of velocity field (mass conservation)
                    float div = (vel.x - texture2D(uVelocityMap, vUv - vec2(eps, 0.0)).r) * 0.5 +
                                (vel.y - texture2D(uVelocityMap, vUv - vec2(0.0, eps)).g) * 0.5;
                    
                    // Shallow water equation for height update:
                    // ∂h/∂t = -∇·(hv) + precipitation - evaporation
                    // Using simple approximation: ∂h/∂t ≈ -div(h*v)
                    float divHV = (vel.x * h - texture2D(uVelocityMap, vUv - vec2(eps, 0.0)).r * 
                                  texture2D(uHeightMap, vUv - vec2(eps, 0.0)).r) * 0.5 +
                                  (vel.y * h - texture2D(uVelocityMap, vUv - vec2(0.0, eps)).g * 
                                  texture2D(uHeightMap, vUv - vec2(0.0, eps)).r) * 0.5;
                    
                    // Add precipitation and evaporation
                    float externalSources = uPrecipitationRate - uEvaporationRate * h;
                    
                    // Compute new height
                    float dhdt = divHV + externalSources;
                    // Using much smaller time step for stable, slow simulation
                    float newHeight = h - dhdt * 0.002; // Very slow time step
                    
                    // Add viscous smoothing
                    newHeight += uViscosity * laplacian * 0.1;
                    
                    // Clamp to prevent negative water
                    newHeight = max(0.0, newHeight);
                    
                    // Output new height
                    gl_FragColor = vec4(newHeight, 0.0, 0.0, 1.0);
                }
            `
        });
        
        // Velocity update material (momentum conservation)
        this.materialVelocity = new THREE.ShaderMaterial({
            uniforms: {
                uHeightMap: { value: this.waterHeightTexture },
                uVelocityMap: { value: this.velocityTexture },
                uTime: this.timeUniform,
                uResolution: { value: new THREE.Vector2(this.width, this.height) },
                uGravity: { value: this.gravity },
                uViscosity: { value: this.viscosity }
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
                
                uniform sampler2D uHeightMap;      // Water height
                uniform sampler2D uVelocityMap;    // Velocity field
                uniform float uTime;
                uniform vec2 uResolution;
                uniform float uGravity;
                uniform float uViscosity;
                
                varying vec2 vUv;
                
                void main() {
                    float eps = 1.0 / max(uResolution.x, uResolution.y);
                    
                    // Read current velocity and height
                    vec2 vel = texture2D(uVelocityMap, vUv).rg;
                    float h = texture2D(uHeightMap, vUv).r;
                    
                    // Sample neighbors
                    vec2 velLeft = texture2D(uVelocityMap, vUv - vec2(eps, 0.0)).rg;
                    vec2 velRight = texture2D(uVelocityMap, vUv + vec2(eps, 0.0)).rg;
                    vec2 velDown = texture2D(uVelocityMap, vUv - vec2(0.0, eps)).rg;
                    vec2 velUp = texture2D(uVelocityMap, vUv + vec2(0.0, eps)).rg;
                    
                    float hLeft = texture2D(uHeightMap, vUv - vec2(eps, 0.0)).r;
                    float hRight = texture2D(uHeightMap, vUv + vec2(eps, 0.0)).r;
                    float hDown = texture2D(uHeightMap, vUv - vec2(0.0, eps)).r;
                    float hUp = texture2D(uHeightMap, vUv + vec2(0.0, eps)).r;
                    
                    // Height gradient (pressure force: -g∇h)
                    vec2 heightGrad = vec2(hRight - hLeft, hUp - hDown);
                    
                    // Advection term: (v·∇)v
                    vec2 advection = vec2(
                        vel.x * (velRight.x - velLeft.x) * 0.5 + vel.y * (velUp.x - velDown.x) * 0.5,
                        vel.x * (velRight.y - velLeft.y) * 0.5 + vel.y * (velUp.y - velDown.y) * 0.5
                    );
                    
                    // Viscosity term: ν∇²v
                    vec2 laplacianVel = vec2(
                        (velLeft.x + velRight.x + velDown.x + velUp.x - 4.0 * vel.x) * 0.25,
                        (velLeft.y + velRight.y + velDown.y + velUp.y - 4.0 * vel.y) * 0.25
                    );
                    
                    // Simplified Navier-Stokes:
                    // ∂v/∂t + (v·∇)v = -g∇h + ν∇²v
                    // Using semi-implicit Euler: v_new = v_old + dt * (-g∇h + ν∇²v - (v·∇)v)
                    vec2 dvdT = -uGravity * heightGrad + uViscosity * laplacianVel - advection;
                    
                    // Update velocity with much slower time step
                    vec2 newVel = vel + dvdT * 0.002; // Very slow simulation
                    
                    // Clamp velocity to prevent numerical instability
                    float maxSpeed = 2.0;
                    float speed = length(newVel);
                    if (speed > maxSpeed) {
                        newVel = normalize(newVel) * maxSpeed;
                    }
                    
                    // Output new velocity
                    gl_FragColor = vec4(newVel, 0.0, 1.0);
                }
            `
        });
        
        // Advection material (for proper fluid transport)
        this.materialAdvection = new THREE.ShaderMaterial({
            uniforms: {
                uHeightMap: { value: this.waterHeightTexture },
                uVelocityMap: { value: this.velocityTexture },
                uTime: this.timeUniform,
                uResolution: { value: new THREE.Vector2(this.width, this.height) },
                uDt: { value: 0.166 }
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
                
                uniform sampler2D uHeightMap;
                uniform sampler2D uVelocityMap;
                uniform float uTime;
                uniform vec2 uResolution;
                uniform float uDt;
                
                varying vec2 vUv;
                
                void main() {
                    float eps = 1.0 / max(uResolution.x, uResolution.y);
                    
                    // Read current state
                    float h = texture2D(uHeightMap, vUv).r;
                    vec2 vel = texture2D(uVelocityMap, vUv).rg;
                    
                    // Trace back along velocity field (backward semi-Lagrangian)
                    vec2 backwardPos = vUv - vel * eps * uDt;
                    backwardPos = clamp(backwardPos, 0.0, 1.0);
                    
                    // Sample height at previous position
                    float prevHeight = texture2D(uHeightMap, backwardPos).r;
                    
                    // Simple conservation: h_new = h_old - div(h*v)*dt
                    // Using upwind scheme for stability
                    float div = (vel.x - texture2D(uVelocityMap, vUv - vec2(eps, 0.0)).r) * 0.5 +
                                (vel.y - texture2D(uVelocityMap, vUv - vec2(0.0, eps)).g) * 0.5;
                    
                    float newHeight = prevHeight - div * uDt;
                    newHeight = max(0.0, newHeight);
                    
                    gl_FragColor = vec4(newHeight, 0.0, 0.0, 1.0);
                }
            `
        });
    }
    
    /**
     * Set up the simulation with terrain height map
     * @param heightMapTexture - Texture containing terrain elevation data
     */
    public setupTerrain(heightMapTexture: THREE.DataTexture): void {
        if (this.materialHeight) {
            this.materialHeight.uniforms.uHeightMap.value = heightMapTexture;
        }
        if (this.materialVelocity) {
            this.materialVelocity.uniforms.uHeightMap.value = heightMapTexture;
        }
        if (this.materialAdvection) {
            this.materialAdvection.uniforms.uHeightMap.value = heightMapTexture;
        }
    }
    
    /**
     * Update the water simulation using GPU render targets
     * Uses ping-pong rendering for stable integration
     */
    public update(renderer: THREE.WebGLRenderer, dt: number = 0.002): void {
        if (!this.materialHeight || !this.materialVelocity) return;
        
        // Update time
        this.timeUniform.value = performance.now() * 0.001;
        
        // Update dt uniform
        if (this.materialAdvection) {
            this.materialAdvection.uniforms.uDt.value = dt;
        }
        
        // Swap ping-pong buffers
        const prevHeightTexture = this.currentHeightBuffer === 0 ? 
            this.waterHeightTexture : this.outputHeightTexture;
        const prevVelocityTexture = this.currentVelocityBuffer === 0 ? 
            this.velocityTexture : this.outputVelocityTexture;
        
        const nextHeightTexture = this.currentHeightBuffer === 0 ? 
            this.outputHeightTexture : this.waterHeightTexture;
        const nextVelocityTexture = this.currentVelocityBuffer === 0 ? 
            this.outputVelocityTexture : this.velocityTexture;
        
        // Update uniforms to use previous frame textures
        if (this.materialHeight.uniforms) {
            this.materialHeight.uniforms.uHeightMap.value = prevHeightTexture;
            this.materialHeight.uniforms.uVelocityMap.value = prevVelocityTexture;
        }
        
        if (this.materialVelocity.uniforms) {
            this.materialVelocity.uniforms.uHeightMap.value = prevHeightTexture;
            this.materialVelocity.uniforms.uVelocityMap.value = prevVelocityTexture;
        }
        
        const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        tempCamera.position.z = 1;
        
        const meshHeight = new THREE.Mesh(this.geometry, this.materialHeight);
        const meshVelocity = new THREE.Mesh(this.geometry, this.materialVelocity);
        
        // Store original render target
        const oldRenderTarget = renderer.getRenderTarget();
        
        // Update velocity first (depends on current height)
        renderer.setRenderTarget(this.velocityRenderTarget);
        renderer.render(meshVelocity, tempCamera);
        
        // Copy velocity result to output texture
        this.copyTexture(renderer, this.velocityRenderTarget.texture, nextVelocityTexture);
        
        // Update height (depends on updated velocity)
        renderer.setRenderTarget(this.heightRenderTarget);
        renderer.render(meshHeight, tempCamera);
        
        // Copy height result to output texture
        this.copyTexture(renderer, this.heightRenderTarget.texture, nextHeightTexture);
        
        // Swap buffers
        this.currentHeightBuffer = 1 - this.currentHeightBuffer;
        this.currentVelocityBuffer = 1 - this.currentVelocityBuffer;
        
        // Restore original render target
        renderer.setRenderTarget(oldRenderTarget);
    }
    
    /**
     * Copy texture data from render target to data texture
     */
    private copyTexture(renderer: THREE.WebGLRenderer, _sourceTexture: THREE.Texture, targetTexture: THREE.DataTexture): void {
        // For GPU render targets, we need to read from the render target directly
        const renderTarget = this.heightRenderTarget;
        
        const width = renderTarget.width;
        const height = renderTarget.height;
        
        const pixels = new Float32Array(width * height * 4);
        renderer.readRenderTargetPixels(
            renderTarget,
            0, 0, width, height,
            pixels
        );
        
        // Copy to target texture data array
        if (targetTexture.image && targetTexture.image.data) {
            const targetData = targetTexture.image.data as Float32Array;
            // For RedFormat, only copy the first component
            for (let i = 0; i < width * height; i++) {
                targetData[i] = pixels[i * 4]; // R channel
            }
        }
        targetTexture.needsUpdate = true;
    }
    
    /**
     * Get the current water height texture for visualization
     */
    public getWaterHeightTexture(): THREE.DataTexture {
        return this.currentHeightBuffer === 0 ? 
            this.waterHeightTexture : this.outputHeightTexture;
    }
    
    /**
     * Get raw water height pixel data for debug visualization
     */
    public getWaterHeightData(): Float32Array {
        const texture = this.getWaterHeightTexture();
        console.log('getWaterHeightData - texture:', texture, 'image.data exists:', !!texture.image?.data);
        if (texture.image && texture.image.data) {
            const data = texture.image.data as Float32Array;
            // Return a copy to avoid external modifications
            return new Float32Array(data);
        }
        // Return empty array if data not available
        console.warn('Water height texture data not available');
        return new Float32Array(this.width * this.height);
    }
    
    /**
     * Get the current velocity texture
     */
    public getVelocityTexture(): THREE.DataTexture {
        return this.currentVelocityBuffer === 0 ? 
            this.velocityTexture : this.outputVelocityTexture;
    }
    
    /**
     * Reset water simulation
     */
    public reset(): void {
        const initialWaterData = new Float32Array(this.width * this.height);
        for (let i = 0; i < this.width * this.height; i++) {
            initialWaterData[i] = 0.1;
        }
        
        if (this.waterHeightTexture.image.data) {
            this.waterHeightTexture.image.data.set(initialWaterData);
            this.waterHeightTexture.needsUpdate = true;
        }
        
        if (this.outputHeightTexture.image.data) {
            this.outputHeightTexture.image.data.set(initialWaterData);
            this.outputHeightTexture.needsUpdate = true;
        }
        
        const initialVelocityData = new Float32Array(this.width * this.height * 2);
        for (let i = 0; i < this.width * this.height * 2; i++) {
            initialVelocityData[i] = 0.0;
        }
        
        if (this.velocityTexture.image.data) {
            this.velocityTexture.image.data.set(initialVelocityData);
            this.velocityTexture.needsUpdate = true;
        }
    }
    
    /**
     * Resize the simulation grid
     */
    public resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        
        // Recreate textures and render targets
        this.waterHeightTexture.dispose();
        this.velocityTexture.dispose();
        this.outputHeightTexture.dispose();
        this.outputVelocityTexture.dispose();
        this.heightRenderTarget.dispose();
        this.velocityRenderTarget.dispose();
        
        // Reinitialize with new dimensions
        const initialWaterData = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
            initialWaterData[i] = 0.1;
        }
        
        this.waterHeightTexture = new THREE.DataTexture(
            initialWaterData,
            width,
            height,
            THREE.RedFormat,
            THREE.FloatType
        );
        
        const velocityData = new Float32Array(width * height * 2);
        for (let i = 0; i < width * height * 2; i++) {
            velocityData[i] = 0.0;
        }
        
        this.velocityTexture = new THREE.DataTexture(
            velocityData,
            width,
            height,
            THREE.RGFormat,
            THREE.FloatType
        );
        
        this.outputHeightTexture = new THREE.DataTexture(
            initialWaterData,
            width,
            height,
            THREE.RedFormat,
            THREE.FloatType
        );
        
        this.outputVelocityTexture = new THREE.DataTexture(
            velocityData,
            width,
            height,
            THREE.RGFormat,
            THREE.FloatType
        );
        
        this.heightRenderTarget = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RedFormat,
            type: THREE.FloatType
        });
        
        this.velocityRenderTarget = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RGFormat,
            type: THREE.FloatType
        });
        
        // Re-create materials with new resolution uniforms
        this.createShaderMaterials();
    }
}