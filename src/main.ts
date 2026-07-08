import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Import terrain compute helper for height-based, slope-based visualization, and downslope arrows
import { createDownslopeArrowGeometry } from '@/nodes/geometry/createDownslopeArrowGeometry';
import { createSlopeVisualizationMaterial } from '@/nodes/material/createSlopeVisualizationMaterial';
import { createDownslopeArrowMaterial } from '@/nodes/material/createDownslopeArrowMaterial';
import { createHeightVisualizationMaterial } from '@/nodes/material/createHeightVisualizationMaterial';
import { createDisplacementTexture } from '@/nodes/texture/createDisplacementTexture';
import { createTerrainGeometry } from '@/nodes/geometry/createTerrainGeometry';
import { createWaterVisualizationMaterial } from '@/nodes/material/createWaterVisualizationMaterial';

// Import DOM manipulation utilities
import { createTabBar, updateTabActiveState } from '@/dom/ui/createTabBar';
import { createUIContainer } from '@/dom/ui/createUIContainer';
import {
  createVisualizationLegend,
  createSlopeLegend,
  showLegend,
  hideLegend,
} from '@/dom/legend/createLegend.js';
import { createOverlay } from '@/dom/createOverlay';
import { createD8WaterFlowSimulation } from '@/systems/createD8Simulation';

const SIM_SIZE = 512;

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
camera.zoom = 2.5;
camera.updateProjectionMatrix();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Camera controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = false;

// Terrain size (must be defined before creating terrain)
const terrainSize = 12;

// Create triangular terrain mesh
const geometry = createTerrainGeometry();

// Create height map for GPU-based height visualization and water simulation
const heightMapTexture = createDisplacementTexture(512, terrainSize);
const heightVisualizationMaterial = createHeightVisualizationMaterial(-1.5, 2.0, heightMapTexture);

// Create water flow simulation
const waterSimulation = createD8WaterFlowSimulation(SIM_SIZE, terrainSize, renderer, heightMapTexture);

// Create water visualization material (pass heightMapTexture for terrain reference)
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
  opacity: 0.1,
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

// UI Container
const uiContainer = createUIContainer({
  tabContainer: tabContainer.container,
});
document.body.appendChild(uiContainer);

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
}

// Set initial visualization mode material
setVisualizationMode(visualizationMode);

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

  // Run water simulation in Water Flow mode
  if (visualizationMode === 4) {
    // Run the GPU computation - single pass calculates both outflow and inflow
    const texture = waterSimulation.compute(1/60.0); 
    waterVisualizationMaterial.uniforms.uWaterHeightmap.value = texture;
    
    // Update cloud shadow texture on water material
    if (waterVisualizationMaterial.uniforms.uCloudShadowMap) {
      waterVisualizationMaterial.uniforms.uCloudShadowMap.value = waterSimulation.getCloudShadowTexture();
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

// Handle click to add water
window.addEventListener('click', (event) => {
  // Only handle clicks when in Water Flow mode
  if (visualizationMode !== 4) {
    return;
  }

  // Calculate mouse position in normalized device coordinates
  const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;

  // Create raycaster
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

  // Intersect with terrain (account for rotation)
  const terrainIntersects = raycaster.intersectObject(terrain);

  if (terrainIntersects.length > 0) {
    const intersect = terrainIntersects[0];
    const point = intersect.point;

    // Debug: log world coordinates
    console.log('World point:', { x: point.x, y: point.y, z: point.z });

    // Convert world coordinates to terrain-local coordinates for water simulation
    // Terrain is rotated -π/2 around X-axis:
    // - World X corresponds to terrain's width direction (original plane X)
    // - World Z corresponds to terrain's height direction (original plane Y, inverted)
    // The displacement texture maps: column→X (-6 to +6), row→Z (-6 to +6)
    
    // Map world coordinates to [0, terrainSize] for the water simulation
    const x = point.x + terrainSize / 2;
    const y = point.z + terrainSize / 2;  // Removed the negative sign

    // Debug: log converted coordinates
    console.log('Converted terrain coords:', { x, y });
    
    // Debug: log texture texel coordinates
    const uvX = x / terrainSize;
    const uvY = y / terrainSize;
    const width = SIM_SIZE; // simulation grid size
    const texelX = Math.floor(uvX * width);
    const centerY = Math.floor((1.0 - uvY) * width);  // Y is flipped for texture coordinates
    console.log('Texture texel coords:', { uvX, uvY, texelX, centerY });

    waterSimulation.addWater(x, y, 2.0, 3);
    console.log('Water added at world coords:', { x, y });
  }
});

// waterSimulation.addWater(0, 0, 10, 100);