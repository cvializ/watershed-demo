import './style.css';
import * as THREE from 'three';

// Import terrain compute helper for height-based visualization
import { createHeightVisualizationMaterial } from './terrainCompute.js';

// Setup scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const aspect = window.innerWidth / window.innerHeight;
const frustumSize = 20;
const camera = new THREE.OrthographicCamera(
  (frustumSize * aspect) / -2,
  (frustumSize * aspect) / 2,
  frustumSize / 2,
  frustumSize / -2,
  0.1,
  1000
);
camera.position.set(15, 12, 15);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Camera controls
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = false;

// Simple pseudo-random noise function
function hash(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

// Improved noise with more octaves for detailed terrain
function noise(x: number, z: number): number {
  // Simple value noise with interpolation
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;

  const h1 = hash(x0, z0);
  const h2 = hash(x0 + 1, z0);
  const h3 = hash(x0, z0 + 1);
  const h4 = hash(x0 + 1, z0 + 1);

  // Smoothstep interpolation
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);

  const h12 = h1 * (1 - sx) + h2 * sx;
  const h34 = h3 * (1 - sx) + h4 * sx;

  return h12 * (1 - sz) + h34 * sz;
}

// Generate a procedural river path using noise
function getRiverDepth(x: number, z: number): number {
  // River follows a winding path through the terrain
  
  // Create a curved river channel
  const riverCenterX = Math.sin(z * 0.3) * 4 + x * 0.5;
  const distanceFromRiver = Math.abs(x - riverCenterX);
  
  // River valley depth based on proximity to center (wider at some points)
  let riverDepth = 0;
  if (distanceFromRiver < 2.5) {
    riverDepth = (2.5 - distanceFromRiver) / 2.5;
    riverDepth = Math.pow(riverDepth, 1.5); // More natural curve
  }
  
  return riverDepth;
}

// Hydraulic erosion simulation
function applyErosion(positions: THREE.BufferAttribute, iterations: number = 5000): void {
  const count = positions.count;
  const heightMap: number[] = [];
  
  // Extract current heights
  for (let i = 0; i < count; i++) {
    heightMap.push(positions.getZ(i));
  }
  
  // Simulate water droplets eroding the terrain
  const gridWidth = segments + 1;
  const cellSize = terrainSize / segments;
  
  for (let iter = 0; iter < iterations; iter++) {
    // Start position - higher elevation areas
    let px = Math.random() * terrainSize - terrainSize/2;
    let py = -(Math.random() * terrainSize - terrainSize/2);
    
    // Map to grid coordinates
    let gx = Math.floor((px + terrainSize/2) / cellSize);
    let gy = Math.floor((py + terrainSize/2) / cellSize);
    
    // Water properties
    let waterAmount = 1.0;
    let sedimentLoad = 0;
    
    // Track river path for visualization
    if (iter < iterations * 0.3) {
      // Early iterations carve main river channel
      const idx = gy * gridWidth + gx;
      if (idx >= 0 && idx < count && waterAmount > 0.3) {
        const depth = getRiverDepth(px, py);
        if (depth > 0.2) {
          heightMap[idx] -= 0.03 * depth; // Erode along river path
          sedimentLoad += 0.02;
        }
      }
    }
  }
  
  // Apply modified heights back
  for (let i = 0; i < count; i++) {
    positions.setZ(i, heightMap[i]);
  }
}

// Create triangular terrain mesh
const terrainSize = 12;
const segments = 80;
const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);

// Convert plane to height-based terrain and compute vertex colors based on elevation
const positions = geometry.attributes.position;
const colors: number[] = [];

// Calculate river depth for each vertex first
const riverDepths: number[] = [];
for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i);
  const y = positions.getY(i);
  riverDepths.push(getRiverDepth(x, -y));
}

// Apply hydraulic erosion to carve the terrain
applyErosion(positions as THREE.BufferAttribute, 8000);

for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i);
  const y = positions.getY(i);

  // Calculate height using lower frequency noise for rolling hills
  let height = 0;
  height += noise(x * 0.5, -y * 0.5) * 1.2;      // Large gentle waves
  height += noise(x * 1.0, -y * 1.0) * 0.6;      // Medium undulations
  height += noise(x * 2.0, -y * 2.0) * 0.3;      // Small variations

  // Carve river valley into terrain
  const riverDepth = getRiverDepth(x, -y);
  if (riverDepth > 0.1) {
    height -= riverDepth * 1.5;
  }

  positions.setZ(i, height);

  // Color based on height and river proximity
  const normalizedHeight = Math.max(0, Math.min(1, (height + 0.8) / 2));

  if (riverDepth > 0.3) {
    colors.push(0.15, 0.45, 0.7); // Deep river blue
  } else if (normalizedHeight < 0.2) {
    colors.push(0.2, 0.4, 0.6); // Water blue / shallow river
  } else if (riverDepth > 0.15 && normalizedHeight < 0.3) {
    colors.push(0.35, 0.48, 0.38); // River bank/muddy
  } else if (normalizedHeight < 0.35) {
    colors.push(0.3, 0.5, 0.3); // Grass green
  } else if (normalizedHeight < 0.65) {
    colors.push(0.4, 0.55, 0.25); // Forest green
  } else if (normalizedHeight < 0.85) {
    colors.push(0.65, 0.6, 0.55); // Sandy/rock tan
  } else {
    colors.push(1.0, 1.0, 1.0); // Snow white
  }
}

geometry.attributes.position.needsUpdate = true;
geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
geometry.computeVertexNormals();

// Create material with vertex colors and double-sided rendering for triangles
const material = new THREE.MeshLambertMaterial({
  vertexColors: true,
  side: THREE.DoubleSide,
});

// Create compute shader material for height visualization (GPU-based)
const computeMaterial = createHeightVisualizationMaterial(-1.5, 2.0);

const terrain = new THREE.Mesh(geometry, material);
terrain.rotation.x = -Math.PI / 2;
scene.add(terrain);

// Store original material for toggling
const originalMaterial = material;

// Add wireframe overlay to emphasize triangular mesh structure
const wireframeGeometry = new THREE.WireframeGeometry(geometry);
const wireframeMaterial = new THREE.LineBasicMaterial({
  color: 0xffaa00,
  opacity: 0.6,
  transparent: true,
});
const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
wireframe.rotation.x = terrain.rotation.x;
scene.add(wireframe);

// Toggle UI for height visualization
const uiContainer = document.createElement('div');
uiContainer.style.cssText =
  'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: #fff;' +
  'padding: 15px; font-family: monospace; border-radius: 4px; z-index: 1000;';

const toggleButton = document.createElement('button');
toggleButton.textContent = 'Toggle Height Visualization';
toggleButton.style.cssText =
  'padding: 8px 16px; background: #4CAF50; color: white; border: none;' +
  'border-radius: 4px; cursor: pointer; font-size: 12px;';

let useComputeShader = false;
toggleButton.addEventListener('click', () => {
  useComputeShader = !useComputeShader;
  
  if (useComputeShader) {
    // Apply compute shader material for height visualization
    terrain.material = computeMaterial as any;
  } else {
    // Restore original vertex-colored material
    terrain.material = originalMaterial as any;
  }
});

const minHeightLabel = document.createElement('label');
minHeightLabel.textContent = 'Compute Shader Min Height:';
minHeightLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

const minHeightInput = document.createElement('input');
minHeightInput.type = 'number';
minHeightInput.value = '-1.5';
minHeightInput.placeholder = 'Min Height';
minHeightInput.title = 'Minimum height value for color mapping in compute shader';
minHeightInput.style.cssText = 'display: block; margin-bottom: 8px; padding: 4px; width: 100%;';

const maxHeightLabel = document.createElement('label');
maxHeightLabel.textContent = 'Compute Shader Max Height:';
maxHeightLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

const maxHeightInput = document.createElement('input');
maxHeightInput.type = 'number';
maxHeightInput.value = '2.0';
maxHeightInput.placeholder = 'Max Height';
maxHeightInput.title = 'Maximum height value for color mapping in compute shader';
maxHeightInput.style.cssText = 'display: block; margin-bottom: 4px; padding: 4px; width: 100%;';

// Update shader uniforms when height range changes
function updateHeightRange() {
  if (useComputeShader && terrain.material) {
    const shaderMat = terrain.material as any;
    if (shaderMat.uniforms?.uMinHeight) {
      shaderMat.uniforms.uMinHeight.value = parseFloat(minHeightInput.value);
    }
    if (shaderMat.uniforms?.uMaxHeight) {
      shaderMat.uniforms.uMaxHeight.value = parseFloat(maxHeightInput.value);
    }
  }
}

minHeightInput.addEventListener('change', updateHeightRange);
maxHeightInput.addEventListener('change', updateHeightRange);

uiContainer.appendChild(toggleButton);
uiContainer.appendChild(document.createElement('br'));
uiContainer.appendChild(minHeightLabel);
uiContainer.appendChild(minHeightInput);
uiContainer.appendChild(maxHeightLabel);
uiContainer.appendChild(maxHeightInput);
document.body.appendChild(uiContainer);

// Add color legend
const legend = document.createElement('div');
legend.style.cssText =
  'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);' +
  'width: 400px; height: 20px; background: linear-gradient(to right,' +
  'rgb(26,102,204) 0%,' +
  'rgb(153,153,153) 100%);' +
  'border-radius: 4px; border: 2px solid rgba(0,0,0,0.5); z-index: 1000;';

const legendText = document.createElement('div');
legendText.style.cssText =
  'position: absolute; bottom: -30px; width: 100%; text-align: center;' +
  'color: white; font-family: monospace; font-size: 12px; text-shadow: 1px 1px 2px black;';
legendText.innerHTML = 'Low <span>&larr;</span> Height <span>&rarr;</span> High';

legend.appendChild(legendText);
document.body.appendChild(legend);

// Add lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Diagnostic overlay
const overlay = document.createElement('div');
overlay.style.cssText =
  'position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #fff;' +
  'padding: 10px; font-family: monospace; font-size: 12px; border-radius: 4px; z-index: 1000;';
document.body.appendChild(overlay);

let frameCount = 0;
let lastTime = performance.now();
let fps = 0;

function updateOverlay() {
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastTime = now;
  }

  overlay.textContent = `FPS: ${fps} | Objects: ${scene.children.length} | Vertices: ${positions.count}`;
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateOverlay();
  renderer.render(scene, camera);
}
animate();

// Handle window resize
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (frustumSize * aspect) / -2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = frustumSize / -2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});