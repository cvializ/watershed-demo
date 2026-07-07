// import { expect } from 'chai';
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

await test('addWater succeeds rendering at 0, 0', () => {
    addWater(0, 0, 1, 1);
});

await test('clearWater succeeds', () => {
    clearWater();
});