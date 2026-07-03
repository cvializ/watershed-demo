import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Import terrain compute helper for height-based, slope-based visualization, and downslope arrows
import { createDownslopeArrowGeometry } from './nodes/geometry/createDownslopeArrowGeometry.js';
import { createSlopeVisualizationMaterial } from './nodes/material/createSlopeVisualizationMaterial.js';
import { createDownslopeArrowMaterial } from './nodes/material/createDownslopeArrowMaterial.js';
import { createHeightVisualizationMaterial } from './nodes/material/createHeightVisualizationMaterial.js';
import { createDisplacementTexture } from './nodes/texture/createDisplacementTexture.js';
import { createTerrainGeometry } from './nodes/geometry/createTerrainGeometry.js';
import { createWaterFlowSimulation } from './nodes/water/createWaterFlowSimulation.js';
import { createWaterVisualizationMaterial } from './nodes/material/createWaterVisualizationMaterial.js';

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
import { createSceneTreeGUI } from './dom/createSceneTreeGUI.js';

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
const heightVisualizationMaterial = createHeightVisualizationMaterial(-1.5, 2.0, heightMapTexture);

// Create water flow simulation
const waterSimulation = createWaterFlowSimulation(128, renderer);

// Create water visualization material
const waterVisualizationMaterial = createWaterVisualizationMaterial(-1.5, 2.0, heightMapTexture);

// Create shader material for slope visualization
const slopeMaterial = createSlopeVisualizationMaterial(0.0, 2.0);

// Create downslope arrow geometry and material
const arrowGeometry = createDownslopeArrowGeometry(geometry, 0.3);
const arrowMaterial = createDownslopeArrowMaterial();
const arrows = new THREE.LineSegments(arrowGeometry, arrowMaterial);
arrows.name = 'downslope-arrows';
arrows.rotation.x = -Math.PI / 2;
scene.add(arrows);

const terrain = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial() as THREE.Material);
terrain.name = 'terrain';
terrain.rotation.x = -Math.PI / 2;
scene.add(terrain);

// Store original material for toggling
const originalMaterial = terrain.material;
const normalMaterial = new THREE.MeshNormalMaterial({
});

// Add wireframe overlay to emphasize triangular mesh structure
const wireframeGeometry = new THREE.WireframeGeometry(geometry);
const wireframeMaterial = new THREE.LineBasicMaterial({
  color: 0xffaa00,
  opacity: 0.6,
  transparent: true,
});
const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
wireframe.name = 'terrain-wireframe';
wireframe.rotation.x = -Math.PI / 2;
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
    terrain.material = heightVisualizationMaterial;
    showLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = false;
  } else if (visualizationMode === 1) {
    // Slope-based visualization (normal map)
    terrain.material = slopeMaterial;
    hideLegend(legend);
    showLegend(slopeLegend);
    arrows.visible = false;
  } else if (visualizationMode === 2) {
    // Normal material for verification
    terrain.material = normalMaterial;
    hideLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = false;
  } else if (visualizationMode === 3) {
    // Downslope arrows visualization
    terrain.material = originalMaterial;
    hideLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = true;
  } else if (visualizationMode === 4) {
    // Water flow visualization
    terrain.material = waterVisualizationMaterial;
    hideLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = false;

    // Update terrain shader with water heightmap uniform if material supports it
    if (terrain.material) {
      const mat = terrain.material as any;
      if (!mat.uniforms?.uWaterHeightmap) {
        // Add the uniform for water heightmap if not already present
        mat.uniforms = mat.uniforms || {};
        mat.uniforms.uWaterHeightmap = { value: null };
      }
    }
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
ambientLight.name = 'ambient-light';
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.name = 'directional-light';
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);



// Diagnostic overlay
const overlay = createOverlay();

// Scene graph inspector GUI - created but hidden by default
const sceneTreeGUI = createSceneTreeGUI(scene);

let frameCount = 0;
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  
  // Calculate FPS
  frameCount++;
  const now = performance.now();
  
  // Update FPS display every second
  if (now - lastTime >= 1000) {
    const fps = frameCount;
    overlay.update(fps, scene.children.length);
    frameCount = 0;
    lastTime = now;
  } else {
    // Calculate FPS based on current measurement window
    const fps = Math.round(frameCount / ((now - lastTime) / 1000));
    overlay.update(fps, scene.children.length);
  }
  
  sceneTreeGUI.update();
  
  // Run water simulation in Water Flow mode
  if (visualizationMode === 4) {
    waterSimulation.gpuCompute.compute();
    
    // Update terrain shader with current water texture
    const waterTexture = waterSimulation.getWaterTexture();
    if (terrain.material) {
      const mat = terrain.material as any;
      if (mat.uniforms?.uWaterHeightmap) {
        mat.uniforms.uWaterHeightmap.value = waterTexture;
      }
    }
  }
  
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