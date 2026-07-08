import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import './test-global-types.d.ts';

import { createCloudShadowSystem } from '../src/systems/createCloudShadowSystem';
import { test } from './testUtils.ts';

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const width = 256;
const terrainSize = 12;

const gpuCompute = new GPUComputationRenderer(width, width, renderer);

// Create a simple heightmap texture for testing
const heightMapData = new Float32Array(width * width * 4);
for (let i = 0; i < heightMapData.length; i++) {
    heightMapData[i] = 0.5;
}
const heightMapTexture = new THREE.DataTexture(heightMapData, width, width, THREE.RGBAFormat, THREE.FloatType);
heightMapTexture.needsUpdate = true;

const { cloudShadowVariable, updateClouds } = createCloudShadowSystem(gpuCompute, width, terrainSize);

// Initialize the GPU computation renderer (creates render targets)
const error = gpuCompute.init();
if (error !== null) {
    console.error('GPU computation initialization error:', error);
}


const resultTexture = gpuCompute.getCurrentRenderTarget(cloudShadowVariable).texture

const scene = new THREE.Scene();
const geometry = new THREE.PlaneGeometry(1, 1);
const material = new THREE.MeshPhongMaterial({
    map: resultTexture,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const camera = new THREE.OrthographicCamera();
renderer.render(scene, camera);

// Initial compute with no clouds
gpuCompute.compute();

await test('initial cloud shadow render succeeds', () => {
    gpuCompute.compute();
});

await test('updateClouds with dt=0.1 runs without error', () => {
    updateClouds(0.1);
    gpuCompute.compute();
});

await test('updateClouds with dt=0.0167 (approx 60fps) runs without error', () => {
    updateClouds(0.0167);
    gpuCompute.compute();
});

await test('updateClouds with dt=1.0 (slow motion) runs without error', () => {
    updateClouds(1.0);
    gpuCompute.compute();
});

await test('multiple consecutive updateClouds calls work', () => {
    updateClouds(0.1);
    updateClouds(0.1);
    updateClouds(0.1);
    updateClouds(0.1);
    gpuCompute.compute();
});

await test('updateClouds with zero delta time', () => {
    updateClouds(0);
    gpuCompute.compute();
});

await test('updateClouds with negative delta time', () => {
    // This tests how the system handles edge cases
    updateClouds(-0.1);
    gpuCompute.compute();
});

await test('updateClouds with very large delta time', () => {
    updateClouds(10.0);
    gpuCompute.compute();
});
