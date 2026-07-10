import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

import { createGpuClouds } from '@/gpu/createGpuClouds.ts';
import { test } from './testUtils.ts';

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const width = 256;

const gpuCompute = new GPUComputationRenderer(width, width, renderer);

const { cloudVariable, updateClouds } = createGpuClouds(gpuCompute, width);

// Initialize the GPU computation renderer (creates render targets)
const error = gpuCompute.init();
if (error !== null) {
    console.error('GPU computation initialization error:', error);
}

gpuCompute.compute();

const resultTexture = gpuCompute.getCurrentRenderTarget(cloudVariable).texture

const scene = new THREE.Scene();
const geometry = new THREE.PlaneGeometry(1, 1);
const material = new THREE.MeshPhongMaterial({
    map: resultTexture,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const camera = new THREE.OrthographicCamera();
renderer.render(scene, camera);

await test('initial cloud render succeeds', () => {
    gpuCompute.compute();
});

await test('updateClouds with dt=0.1 runs without error', () => {
    updateClouds(0.1);
});

await test('updateClouds with dt=0.0167 (approx 60fps) runs without error', () => {
    updateClouds(0.0167);
});

await test('updateClouds with dt=1.0 (slow motion) runs without error', () => {
    updateClouds(1.0);
});

await test('multiple consecutive updateClouds calls work', () => {
    updateClouds(0.1);
    updateClouds(0.1);
    updateClouds(0.1);
    updateClouds(0.1);
});

await test('updateClouds with zero delta time', () => {
    updateClouds(0);
});

await test('updateClouds with negative delta time', () => {
    // This tests how the system handles edge cases
    updateClouds(-0.1);
});

await test('updateClouds with very large delta time', () => {
    updateClouds(10.0);
});

await test('cloud texture is rendered to GPU', () => {
    updateClouds(0.1);
    gpuCompute.compute();
    const renderTarget = gpuCompute.getCurrentRenderTarget(cloudVariable);
    // Verify the render target exists and has texture
    if (!renderTarget || !renderTarget.texture) {
        throw new Error('Render target or texture is missing');
    }
});
