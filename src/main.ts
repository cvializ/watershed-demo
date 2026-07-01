import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Import terrain compute helper for height-based, slope-based visualization, and downslope arrows
import { createDownslopeArrowGeometry } from './nodes/geometry/createDownslopeArrowGeometry.js';
import { createSlopeVisualizationMaterial } from './nodes/material/createSlopeVisualizationMaterial.js';
import { createDownslopeArrowMaterial } from './nodes/material/createDownslopeArrowMaterial.js';
import { createHeightVisualizationMaterial } from './nodes/material/createHeightVisualizationMaterial.js';
import { createDisplacementMaterial } from './nodes/material/createDisplacementMaterial.js';
import { createDisplacementTexture } from './nodes/texture/createDisplacementTexture.js';

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
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = false;

// Create triangular terrain mesh
const terrainSize = 12;
const geometry = createTerrainGeometry();

// Create displacement map texture (512x512 for good detail/performance)
const displacementTexture = createDisplacementTexture(512, terrainSize);

import { createTerrainGeometry } from './nodes/geometry/createTerrainGeometry.js';

// Create custom shader material with vertex displacement using the height texture
const displacementMaterial = createDisplacementMaterial(displacementTexture, 2.5, -1.5);

// Create height map for GPU-based height visualization
const heightMapTexture = createDisplacementTexture(512, terrainSize);
const computeMaterial = createHeightVisualizationMaterial(-1.5, 2.0, heightMapTexture);

// Create shader material for slope visualization
const slopeMaterial = createSlopeVisualizationMaterial(0.0, 2.0);

// Create downslope arrow geometry and material
const arrowGeometry = createDownslopeArrowGeometry(geometry, 0.3);
const arrowMaterial = createDownslopeArrowMaterial();
const arrows = new THREE.LineSegments(arrowGeometry, arrowMaterial);
arrows.rotation.x = -Math.PI / 2;
scene.add(arrows);

const terrain = new THREE.Mesh(geometry, displacementMaterial);
terrain.rotation.x = -Math.PI / 2;
scene.add(terrain);

// Store original material for toggling
const originalMaterial = displacementMaterial;

// Create a normal material for comparison verification
const normalMaterial = new THREE.MeshNormalMaterial({
  side: THREE.DoubleSide,
});

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

// Create tab bar for visualization modes
const uiContainer = document.createElement('div');
uiContainer.style.cssText =
  'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: #fff;' +
  'padding: 15px; font-family: monospace; border-radius: 4px; z-index: 1000;';

// Tab bar container
const tabContainer = document.createElement('div');
tabContainer.style.cssText =
  'display: flex; gap: 5px; margin-bottom: 10px; background: rgba(255,255,255,0.1); padding: 4px; border-radius: 6px;';

const modes = [
  { id: 0, name: '3D Displacement', hasLegend: true },
  { id: 1, name: 'Height', hasLegend: true },
  { id: 2, name: 'Slope', hasLegend: false },
  { id: 3, name: 'Verify (Normal)', hasLegend: false },
  { id: 4, name: 'Downslope Arrows', hasLegend: false },
];

let visualizationMode = 0;

// Create tab buttons
const tabButtons: HTMLButtonElement[] = [];
modes.forEach((mode) => {
  const tab = document.createElement('button');
  tab.textContent = mode.name;
  tab.style.cssText =
    'padding: 6px 12px; background: transparent; color: #aaa;' +
    'border: none; border-radius: 4px; cursor: pointer; font-size: 11px;' +
    'transition: all 0.2s; flex: 1;';
  tab.addEventListener('click', () => setVisualizationMode(mode.id));
  tabContainer.appendChild(tab);
  tabButtons.push(tab);
});

function updateTabActiveState() {
  tabButtons.forEach((tab, index) => {
    if (index === visualizationMode) {
      tab.style.background = '#4CAF50';
      tab.style.color = 'white';
    } else {
      tab.style.background = 'transparent';
      tab.style.color = '#aaa';
    }
  });
}

// Set initial active tab
updateTabActiveState();

function setVisualizationMode(mode: number) {
  visualizationMode = mode;
  updateTabActiveState();
  
  if (visualizationMode === 0) {
    // Displacement map material for actual 3D terrain geometry
    terrain.material = originalMaterial as any;
    legend.style.display = 'block';
    slopeLegend.style.display = 'none';
    arrows.visible = false;
  } else if (visualizationMode === 1) {
    // Height-based visualization
    terrain.material = computeMaterial as any;
    legend.style.display = 'block';
    slopeLegend.style.display = 'none';
    arrows.visible = false;
  } else if (visualizationMode === 2) {
    // Slope-based visualization (normal map)
    terrain.material = slopeMaterial as any;
    legend.style.display = 'none';
    slopeLegend.style.display = 'block';
    arrows.visible = false;
  } else if (visualizationMode === 3) {
    // Normal material for verification
    terrain.material = normalMaterial as any;
    legend.style.display = 'none';
    slopeLegend.style.display = 'none';
    arrows.visible = false;
  } else {
    // Downslope arrows visualization
    terrain.material = originalMaterial as any;
    legend.style.display = 'none';
    slopeLegend.style.display = 'none';
    arrows.visible = true;
  }
  
  // Update visibility based on current mode
  updateVisibility();
}

uiContainer.appendChild(tabContainer);
uiContainer.appendChild(document.createElement('br'));

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
  if (visualizationMode === 1 && terrain.material) {
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

// Slope visualization controls
const minSlopeLabel = document.createElement('label');
minSlopeLabel.textContent = 'Min Slope:';
minSlopeLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

const minSlopeInput = document.createElement('input');
minSlopeInput.type = 'number';
minSlopeInput.value = '0.0';
minSlopeInput.placeholder = 'Min Slope';
minSlopeInput.title = 'Minimum slope value for color mapping in slope visualization';
minSlopeInput.style.cssText = 'display: block; margin-bottom: 8px; padding: 4px; width: 100%;';

const maxSlopeLabel = document.createElement('label');
maxSlopeLabel.textContent = 'Max Slope:';
maxSlopeLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

const maxSlopeInput = document.createElement('input');
maxSlopeInput.type = 'number';
maxSlopeInput.value = '2.0';
maxSlopeInput.placeholder = 'Max Slope';
maxSlopeInput.title = 'Maximum slope value for color mapping in slope visualization';
maxSlopeInput.style.cssText = 'display: block; margin-bottom: 4px; padding: 4px; width: 100%;';

// Update shader uniforms when slope range changes
function updateSlopeRange() {
  if (visualizationMode === 2 && terrain.material) {
    const shaderMat = terrain.material as any;
    if (shaderMat.uniforms?.uMinSlope) {
      shaderMat.uniforms.uMinSlope.value = parseFloat(minSlopeInput.value);
    }
    if (shaderMat.uniforms?.uMaxSlope) {
      shaderMat.uniforms.uMaxSlope.value = parseFloat(maxSlopeInput.value);
    }
  }
}

minSlopeInput.addEventListener('change', updateSlopeRange);
maxSlopeInput.addEventListener('change', updateSlopeRange);

// Displacement controls (only show in displacement mode)
const minDisplacementLabel = document.createElement('label');
minDisplacementLabel.textContent = 'Min Displacement:';
minDisplacementLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

const minDisplacementInput = document.createElement('input');
minDisplacementInput.type = 'number';
minDisplacementInput.value = '-1.5';
minDisplacementInput.title = 'Minimum displacement value (vertical offset)';
minDisplacementInput.style.cssText = 'display: block; margin-bottom: 8px; padding: 4px; width: 100%;';

const maxDisplacementLabel = document.createElement('label');
maxDisplacementLabel.textContent = 'Max Displacement:';
maxDisplacementLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

const maxDisplacementInput = document.createElement('input');
maxDisplacementInput.type = 'number';
maxDisplacementInput.value = '2.5';
maxDisplacementInput.title = 'Maximum displacement value (height scale)';
maxDisplacementInput.style.cssText = 'display: block; margin-bottom: 4px; padding: 4px; width: 100%;';

// Update displacement shader uniforms when values change
function updateDisplacementRange() {
  if (visualizationMode === 0 && terrain.material) {
    const shaderMat = terrain.material as any;
    if (shaderMat.uniforms?.uDisplacementBias) {
      shaderMat.uniforms.uDisplacementBias.value = parseFloat(minDisplacementInput.value);
    }
    if (shaderMat.uniforms?.uDisplacementScale) {
      shaderMat.uniforms.uDisplacementScale.value = parseFloat(maxDisplacementInput.value);
    }
  }
}

minDisplacementInput.addEventListener('change', updateDisplacementRange);
maxDisplacementInput.addEventListener('change', updateDisplacementRange);

// Only show slope controls when in slope mode
function updateVisibility() {
  const isSlopeMode = visualizationMode === 2;
  minSlopeLabel.style.display = isSlopeMode ? 'block' : 'none';
  minSlopeInput.style.display = isSlopeMode ? 'block' : 'none';
  maxSlopeLabel.style.display = isSlopeMode ? 'block' : 'none';
  maxSlopeInput.style.display = isSlopeMode ? 'block' : 'none';
  
  // Only show displacement controls in original/displacement mode
  const isDisplacementMode = visualizationMode === 0;
  minDisplacementLabel.style.display = isDisplacementMode ? 'block' : 'none';
  minDisplacementInput.style.display = isDisplacementMode ? 'block' : 'none';
  maxDisplacementLabel.style.display = isDisplacementMode ? 'block' : 'none';
  maxDisplacementInput.style.display = isDisplacementMode ? 'block' : 'none';
}

uiContainer.appendChild(minDisplacementLabel);
uiContainer.appendChild(minDisplacementInput);
uiContainer.appendChild(maxDisplacementLabel);
uiContainer.appendChild(maxDisplacementInput);

// Call updateVisibility initially to hide slope controls
updateVisibility();
document.body.appendChild(uiContainer);

// Add color legend
const legend = document.createElement('div');
legend.id = 'visualizationLegend';
legend.style.cssText =
  'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);' +
  'width: 400px; height: 20px; background: linear-gradient(to right,' +
  'rgb(26,102,204) 0%,' +
  'rgb(153,153,153) 100%);' +
  'border-radius: 4px; border: 2px solid rgba(0,0,0,0.5); z-index: 1000;';

const legendText = document.createElement('div');
legendText.id = 'legendText';
legendText.style.cssText =
  'position: absolute; bottom: -30px; width: 100%; text-align: center;' +
  'color: white; font-family: monospace; font-size: 12px; text-shadow: 1px 1px 2px black;';
legendText.innerHTML = 'Low <span>&larr;</span> Height <span>&rarr;</span> High';

legend.appendChild(legendText);
document.body.appendChild(legend);

// Slope color legend
const slopeLegend = document.createElement('div');
slopeLegend.id = 'slopeLegend';
slopeLegend.style.cssText =
  'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);' +
  'width: 400px; height: 20px; background: linear-gradient(to right,' +
  'rgb(0,0,255) 0%,' +      // Blue - flat (0° slope)
  'rgb(128,0,128) 50%,' +   // Purple - medium slope
  'rgb(255,0,0) 100%);' +   // Red - steep (90° slope)
  'border-radius: 4px; border: 2px solid rgba(0,0,0,0.5); z-index: 1000; display: none;';

const slopeLegendText = document.createElement('div');
slopeLegendText.style.cssText =
  'position: absolute; bottom: -30px; width: 100%; text-align: center;' +
  'color: white; font-family: monospace; font-size: 12px; text-shadow: 1px 1px 2px black;';
slopeLegendText.innerHTML = 'Flat (0°) <span>&larr;</span> Slope Angle <span>&rarr;</span> Steep (90°)';

slopeLegend.appendChild(slopeLegendText);
document.body.appendChild(slopeLegend);

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

  overlay.textContent = `FPS: ${fps} | Objects: ${scene.children.length}`;
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