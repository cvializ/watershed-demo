import './style.css';
import * as THREE from 'three';

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
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// Simple pseudo-random noise function
function hash(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

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

// Create triangular terrain mesh
const terrainSize = 12;
const segments = 80;
const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);

// Convert plane to height-based terrain and compute vertex colors based on elevation
const positions = geometry.attributes.position;
const colors: number[] = [];

for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i);
  const y = positions.getY(i);

  // Calculate height using lower frequency noise for rolling hills
  let height = 0;
  height += noise(x * 0.5, -y * 0.5) * 1.2;      // Large gentle waves
  height += noise(x * 1.0, -y * 1.0) * 0.6;      // Medium undulations
  height += noise(x * 2.0, -y * 2.0) * 0.3;      // Small variations

  positions.setZ(i, height);

  // Color based on height (low = valleys, mid = rolling hills, high = gentle peaks)
  const normalizedHeight = Math.max(0, Math.min(1, (height + 0.5) / 2));

  if (normalizedHeight < 0.2) {
    colors.push(0.2, 0.4, 0.6); // Water blue
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
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
geometry.computeVertexNormals();

// Create material with vertex colors and double-sided rendering for triangles
const material = new THREE.MeshLambertMaterial({
  vertexColors: true,
  side: THREE.DoubleSide,
});

const terrain = new THREE.Mesh(geometry, material);
terrain.rotation.x = -Math.PI / 2;
scene.add(terrain);

// Add wireframe overlay to emphasize triangular mesh structure
const wireframeGeometry = new THREE.WireframeGeometry(geometry);
const wireframeMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff,
  opacity: 0.03,
  transparent: true,
});
const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
scene.add(wireframe);

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