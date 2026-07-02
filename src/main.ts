import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Import terrain compute helper for height-based, slope-based visualization, and downslope arrows
import { createDownslopeArrowGeometry } from './nodes/geometry/createDownslopeArrowGeometry.js';
import { createSlopeVisualizationMaterial } from './nodes/material/createSlopeVisualizationMaterial.js';
import { createDownslopeArrowMaterial } from './nodes/material/createDownslopeArrowMaterial.js';
import { createHeightVisualizationMaterial } from './nodes/material/createHeightVisualizationMaterial.js';
import { createWaterFlowMaterial } from './nodes/material/createWaterFlowMaterial.js';
import { createDisplacementTexture } from './nodes/texture/createDisplacementTexture.js';
import { createTerrainGeometry } from './nodes/geometry/createTerrainGeometry.js';

// Import DOM manipulation utilities
import { createTabBar, updateTabActiveState } from './dom/ui/createTabBar.js';
import {
  createHeightControls,
  createSlopeControls,
} from './dom/ui/createControls.js';
import { createUIContainer, updateVisibility } from './dom/ui/createUIContainer.js';
import {
  createVisualizationLegend,
  createSlopeLegend,
  showLegend,
  hideLegend,
} from './dom/legend/createLegend.js';
import { createOverlay } from './dom/createOverlay.js';
import { GPUWaterSimulation } from './simulation/GPUWaterSimulation.js';
import { exampleDebugMaterials, renderToConsole } from './utils/debugUtils.js';
import { createDebugWaterHeightMaterial } from './nodes/material/createDebugWaterHeightMaterial.js';

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

// Create height map for GPU-based height visualization and water simulation
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

// Create animated water flow material
// We use a simple approach: create the water layer once and let the shader compute
// water distribution based on terrain height, with time-based accumulation in basins
const waterResult = createWaterFlowMaterial(heightMapTexture, undefined, 0.5);
const waterLayer = new THREE.Mesh(geometry, waterResult.material);
waterLayer.rotation.x = -Math.PI / 2;
scene.add(waterLayer);

// Advanced GPU water simulation with realistic physics
const gpuWaterSimulation = new GPUWaterSimulation(512, 512);
gpuWaterSimulation.setupTerrain(heightMapTexture);

// Initialize water simulation with some initial water
gpuWaterSimulation.reset();

// Add a continuous water source in the center to make water visible
const waterSourcePos = new THREE.Vector2(0, 0); // Center of terrain
gpuWaterSimulation.addWaterSource(waterSourcePos, 0.1);

const terrain = new THREE.Mesh(geometry, computeMaterial);
terrain.rotation.x = -Math.PI / 2;
scene.add(terrain);

// Store original material for toggling
const originalMaterial = computeMaterial;
const normalMaterial = new THREE.MeshStandardMaterial({
  color: 0xaaaaaa,
  roughness: 0.5,
  metalness: 0.1
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

// Visualization mode state
let visualizationMode = 4; // Start on Water Flow tab (mode 0=Height, 1=Slope, 2=Verify, 3=Downslope Arrows, 4=Water Flow)

// Create legends
const legend = createVisualizationLegend();
const slopeLegend = createSlopeLegend();

// Create tab bar
let activeTabButtons: HTMLButtonElement[] = [];
const tabContainer = createTabBar((mode: number) => {
  setVisualizationMode(mode);
  // Visibility updated after mode change in setVisualizationMode
});
activeTabButtons = tabContainer.buttons;
updateTabActiveState(activeTabButtons, visualizationMode);

// Create controls
const heightControls = createHeightControls((minHeight, maxHeight) => {
  updateShaderHeightRange(minHeight, maxHeight);
});

const slopeControls = createSlopeControls((minSlope, maxSlope) => {
  updateShaderSlopeRange(minSlope, maxSlope);
});

// Button to trigger water height console render
function createConsoleRenderButton() {
  const button = document.createElement('button');
  button.textContent = 'Render Water Height to Console';
  button.type = 'button';
  button.style.cssText = 
    'padding: 8px 12px; background-color: #4CAF50; color: white; ' +
    'border: none; border-radius: 4px; cursor: pointer; font-size: 12px; ' +
    'transition: background-color 0.2s; margin-top: 8px;';
  button.onmouseover = () => { button.style.backgroundColor = '#45a049'; };
  button.onmouseout = () => { button.style.backgroundColor = '#4CAF50'; };
  
  return button;
}

// Create console render button (done once)
const consoleRenderButton = createConsoleRenderButton();

// UI Container
const uiContainer = createUIContainer({
  tabContainer: tabContainer.container,
  minHeightLabel: heightControls.minLabel,
  minHeightInput: heightControls.minInput,
  maxHeightLabel: heightControls.maxLabel,
  maxHeightInput: heightControls.maxInput,
  minSlopeLabel: slopeControls.minLabel,
  minSlopeInput: slopeControls.minInput,
  maxSlopeLabel: slopeControls.maxLabel,
  maxSlopeInput: slopeControls.maxInput,
});
document.body.appendChild(uiContainer);

// Add console render button to UI
uiContainer.appendChild(document.createElement('br'));
uiContainer.appendChild(consoleRenderButton);

// Console render button handler
consoleRenderButton.addEventListener('click', async () => {
  console.log('%c--- Water Height Debug ---', 'color: #00ff88; font-weight: bold; font-size: 14px;');

  // Render to console
  await renderToConsole(waterResult.material, {
    width: 256,
    height: 256,
    showSize: true
  });
});

// Shader uniform update functions
function updateShaderHeightRange(minHeight: number, maxHeight: number) {
  if (visualizationMode === 0 && terrain.material) {
    const shaderMat = terrain.material as any;
    if (shaderMat.uniforms?.uMinHeight) {
      shaderMat.uniforms.uMinHeight.value = minHeight;
    }
    if (shaderMat.uniforms?.uMaxHeight) {
      shaderMat.uniforms.uMaxHeight.value = maxHeight;
    }
  }
}

function updateShaderSlopeRange(minSlope: number, maxSlope: number) {
  if (visualizationMode === 1 && terrain.material) {
    const shaderMat = terrain.material as any;
    if (shaderMat.uniforms?.uMinSlope) {
      shaderMat.uniforms.uMinSlope.value = minSlope;
    }
    if (shaderMat.uniforms?.uMaxSlope) {
      shaderMat.uniforms.uMaxSlope.value = maxSlope;
    }
  }
}

function setVisualizationMode(mode: number) {
  visualizationMode = mode;
  updateTabActiveState(activeTabButtons, visualizationMode);

  if (visualizationMode === 0) {
    // Height-based visualization
    terrain.material = computeMaterial as any;
    showLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = false;
    waterLayer.visible = false;
  } else if (visualizationMode === 1) {
    // Slope-based visualization (normal map)
    terrain.material = slopeMaterial as any;
    hideLegend(legend);
    showLegend(slopeLegend);
    arrows.visible = false;
    waterLayer.visible = false;
  } else if (visualizationMode === 2) {
    // Normal material for verification
    terrain.material = normalMaterial as any;
    hideLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = false;
    waterLayer.visible = false;
  } else if (visualizationMode === 3) {
    // Downslope arrows visualization
    terrain.material = originalMaterial as any;
    hideLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = true;
    waterLayer.visible = false;
  } else {
    // Water flow visualization (mode 4)
    terrain.material = originalMaterial as any;
    hideLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = false;
    waterLayer.visible = true;
  }

  // Update visibility based on current mode
  updateVisibility(visualizationMode, {
    tabContainer: tabContainer.container,
    minHeightLabel: heightControls.minLabel,
    minHeightInput: heightControls.minInput,
    maxHeightLabel: heightControls.maxLabel,
    maxHeightInput: heightControls.maxInput,
    minSlopeLabel: slopeControls.minLabel,
    minSlopeInput: slopeControls.minInput,
    maxSlopeLabel: slopeControls.maxLabel,
    maxSlopeInput: slopeControls.maxInput,
  });
}

// Initial visibility update
updateVisibility(visualizationMode, {
  tabContainer: tabContainer.container,
  minHeightLabel: heightControls.minLabel,
  minHeightInput: heightControls.minInput,
  maxHeightLabel: heightControls.maxLabel,
  maxHeightInput: heightControls.maxInput,
  minSlopeLabel: slopeControls.minLabel,
  minSlopeInput: slopeControls.minInput,
  maxSlopeLabel: slopeControls.maxLabel,
  maxSlopeInput: slopeControls.maxInput,
});

// Add lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);



// Diagnostic overlay
const overlay = createOverlay();

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

  overlay.update(fps, scene.children.length);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  
  // Update water animation time
  const currentTime = performance.now() * 0.001;
  if (waterResult.material && waterResult.material.uniforms?.uTime) {
    waterResult.material.uniforms.uTime.value = currentTime;
  }
  
  // Update advanced GPU water simulation (realistic physics)
  if (gpuWaterSimulation) {
    gpuWaterSimulation.update(renderer);
    
    // Update the water flow material's uniform with simulation output
    if (waterResult.material) {
      const simWaterHeight = gpuWaterSimulation.getWaterHeightTexture();
      if (waterResult.material.uniforms?.uWaterMap) {
        waterResult.material.uniforms.uWaterMap.value = simWaterHeight;
      }
    }
  }
  
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

exampleDebugMaterials();