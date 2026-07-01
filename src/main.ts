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

// Import DOM manipulation utilities
import { createTabBar, updateTabActiveState } from './dom/ui/createTabBar.js';
import {
  createHeightControls,
  createSlopeControls,
  createDisplacementControls,
} from './dom/ui/createControls.js';
import { createUIContainer, updateVisibility } from './dom/ui/createUIContainer.js';
import {
  createVisualizationLegend,
  createSlopeLegend,
  showLegend,
  hideLegend,
} from './dom/legend/createLegend.js';
import { createOverlay } from './dom/createOverlay.js';

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

// Visualization mode state
let visualizationMode = 0;

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

const displacementControls = createDisplacementControls((minDisp, maxDisp) => {
  updateShaderDisplacementRange(minDisp, maxDisp);
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
  minDisplacementLabel: displacementControls.minLabel,
  minDisplacementInput: displacementControls.minInput,
  maxDisplacementLabel: displacementControls.maxLabel,
  maxDisplacementInput: displacementControls.maxInput,
});
document.body.appendChild(uiContainer);

// Shader uniform update functions
function updateShaderHeightRange(minHeight: number, maxHeight: number) {
  if (visualizationMode === 1 && terrain.material) {
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
  if (visualizationMode === 2 && terrain.material) {
    const shaderMat = terrain.material as any;
    if (shaderMat.uniforms?.uMinSlope) {
      shaderMat.uniforms.uMinSlope.value = minSlope;
    }
    if (shaderMat.uniforms?.uMaxSlope) {
      shaderMat.uniforms.uMaxSlope.value = maxSlope;
    }
  }
}

function updateShaderDisplacementRange(minDisp: number, maxDisp: number) {
  if (visualizationMode === 0 && terrain.material) {
    const shaderMat = terrain.material as any;
    if (shaderMat.uniforms?.uDisplacementBias) {
      shaderMat.uniforms.uDisplacementBias.value = minDisp;
    }
    if (shaderMat.uniforms?.uDisplacementScale) {
      shaderMat.uniforms.uDisplacementScale.value = maxDisp;
    }
  }
}

function setVisualizationMode(mode: number) {
  visualizationMode = mode;
  updateTabActiveState(activeTabButtons, visualizationMode);

  if (visualizationMode === 0) {
    // Displacement map material for actual 3D terrain geometry
    terrain.material = originalMaterial as any;
    showLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = false;
  } else if (visualizationMode === 1) {
    // Height-based visualization
    terrain.material = computeMaterial as any;
    showLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = false;
  } else if (visualizationMode === 2) {
    // Slope-based visualization (normal map)
    terrain.material = slopeMaterial as any;
    hideLegend(legend);
    showLegend(slopeLegend);
    arrows.visible = false;
  } else if (visualizationMode === 3) {
    // Normal material for verification
    terrain.material = normalMaterial as any;
    hideLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = false;
  } else {
    // Downslope arrows visualization
    terrain.material = originalMaterial as any;
    hideLegend(legend);
    hideLegend(slopeLegend);
    arrows.visible = true;
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
    minDisplacementLabel: displacementControls.minLabel,
    minDisplacementInput: displacementControls.minInput,
    maxDisplacementLabel: displacementControls.maxLabel,
    maxDisplacementInput: displacementControls.maxInput,
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
  minDisplacementLabel: displacementControls.minLabel,
  minDisplacementInput: displacementControls.minInput,
  maxDisplacementLabel: displacementControls.maxLabel,
  maxDisplacementInput: displacementControls.maxInput,
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