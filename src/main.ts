import './style.css';
import * as THREE from 'three';

// Setup scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Camera controls
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Cube
const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshNormalMaterial();
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

camera.position.z = 2;

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
  
  overlay.textContent = `FPS: ${fps} | Objects: ${scene.children.length} | Render calls: ${renderer.info.render.calls}`;
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  updateOverlay();
  renderer.render(scene, camera);
}
animate();