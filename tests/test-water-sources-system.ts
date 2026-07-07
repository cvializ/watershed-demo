import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import './test-global-types.d.ts';

import { createWaterSourcesSystem } from '../src/systems/createWaterSourcesSystem';
import { test } from './testUtils.ts';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const width = 256;

const gpuCompute = new GPUComputationRenderer(width, width, renderer);

const heightMapTexture = gpuCompute.createTexture(); // TODO: create actual blank heightmap texture
const terrainSize = 512;

const { waterSourcesVariable, addWater, clearWater } = createWaterSourcesSystem(gpuCompute, width, heightMapTexture, terrainSize);

// Initialize the GPU computation renderer (creates render targets)
const error = gpuCompute.init();
if (error !== null) {
    console.error('GPU computation initialization error:', error);
}

gpuCompute.compute();

const resultTexture = gpuCompute.getCurrentRenderTarget(waterSourcesVariable).texture

const scene = new THREE.Scene();
const geometry = new THREE.PlaneGeometry(1, 1);
const material = new THREE.MeshPhongMaterial({
    map: resultTexture,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const camera = new THREE.OrthographicCamera();
renderer.render(scene, camera);

await test('clearWater succeeds', () => {
    clearWater();
    gpuCompute.compute();
});

await test('addWater succeeds rendering at 0, 0', () => {
    addWater(0, 0, 1, 1);
    gpuCompute.compute();
    clearWater();
});

await test('addWater succeeds at center of terrain', () => {
    addWater(terrainSize / 2, terrainSize / 2, 1, 1);
    gpuCompute.compute();
    clearWater();
});

await test('addWater succeeds at far corner of terrain', () => {
    addWater(terrainSize - 1, terrainSize - 1, 1, 1);
    gpuCompute.compute();
    clearWater();
});

await test('addWater with larger radius', () => {
    addWater(terrainSize / 2, terrainSize / 2, 10, 50);
    gpuCompute.compute();
    clearWater();
});

await test('addWater with small amount', () => {
    addWater(terrainSize / 2, terrainSize / 2, 0.1, 1);
    gpuCompute.compute();
    clearWater();
});

await test('addWater with large amount', () => {
    addWater(terrainSize / 2, terrainSize / 2, 100, 1);
    gpuCompute.compute();
    clearWater();
});

await test('multiple addWater calls add up', () => {
    // Add multiple water sources
    addWater(10, 10, 1, 5);
    addWater(20, 20, 1, 5);
    addWater(30, 30, 1, 5);
    gpuCompute.compute();
    clearWater();
});

await test('clearWater followed by addWater works', () => {
    clearWater();
    addWater(100, 100, 1, 1);
    gpuCompute.compute();
    clearWater();
});

await test('addWater at boundary coordinates', () => {
    // Test exact boundaries
    addWater(0, terrainSize / 2, 1, 1);
    addWater(terrainSize - 1, terrainSize / 2, 1, 1);
    addWater(terrainSize / 2, 0, 1, 1);
    addWater(terrainSize / 2, terrainSize - 1, 1, 1);

    gpuCompute.compute();
    clearWater();
});

await test('addWater 16x (but not 17x)', () => {
    addWater(0, terrainSize / 2, 1, 1);
    addWater(terrainSize - 1, terrainSize / 2, 1, 1);
    addWater(terrainSize / 2, 0, 1, 1);
    addWater(terrainSize / 2, terrainSize - 1, 1, 1);

    addWater(0, terrainSize / 2, 1, 1);
    addWater(terrainSize - 1, terrainSize / 2, 1, 1);
    addWater(terrainSize / 2, 0, 1, 1);
    addWater(terrainSize / 2, terrainSize - 1, 1, 1);

    addWater(0, terrainSize / 2, 1, 1);
    addWater(terrainSize - 1, terrainSize / 2, 1, 1);
    addWater(terrainSize / 2, 0, 1, 1);
    addWater(terrainSize / 2, terrainSize - 1, 1, 1);

    addWater(0, terrainSize / 2, 1, 1);
    addWater(terrainSize - 1, terrainSize / 2, 1, 1);
    addWater(terrainSize / 2, 0, 1, 1);
    addWater(terrainSize / 2, terrainSize - 1, 1, 1);

    gpuCompute.compute();
    clearWater();
});


await test('addWater with different radius sizes', () => {
    addWater(50, 50, 1, 1);
    addWater(50, 60, 1, 10);
    addWater(50, 70, 1, 50);
    gpuCompute.compute();
    clearWater();
});

await test('consecutive addWater calls without clear', () => {
    // First batch
    addWater(10, 10, 1, 5);
    // Second batch (should accumulate)
    addWater(20, 20, 1, 5);
    gpuCompute.compute();
    clearWater();
});

await test('addWater with non-integer coordinates', () => {
    addWater(12.34, 56.78, 1, 5);
    gpuCompute.compute();
    clearWater();
});

await test('addWater with negative coordinates (edge case)', () => {
    // This tests how the shader handles out-of-bounds coordinates
    addWater(-10, -10, 1, 5);
    gpuCompute.compute();
    clearWater();
});

await test('addWater beyond terrain boundary', () => {
    renderer.dispose();
    // Test coordinates slightly beyond terrain
    addWater(terrainSize + 10, terrainSize + 10, 1, 5);
    gpuCompute.compute();
    clearWater();
});

await test('multiple clearWater calls', () => {
    clearWater();
    clearWater();
    clearWater();
    gpuCompute.compute();
    clearWater();
});

await test('addWater then clear, then add again', () => {
    addWater(100, 100, 1, 1);
    clearWater();
    addWater(200, 200, 1, 1);
    gpuCompute.compute();
    clearWater();
});