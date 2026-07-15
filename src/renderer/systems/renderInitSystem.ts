import { observe, onAdd, query } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import {
  WaterSimulation,
  Default,
  HeightMap,
  TextureRef,
  WaterHeightmapOf,
  CloudShadowMapOf,
  VelocityMapOf,
  Terrain,
  MeshRef,
} from "@/components/components";
import {
  createGpuWaterFlowSimulation,
  type WaterFlowVisualization,
} from "@/gpu/createGpuWaterFlowSimulation";
import { getTexture, registerTextureResource } from "@/scene/resources/texture";
import { getCamera, getMesh } from "@/scene/sceneUtils";
import { createTexture } from "@/world/factories/texture";

const SIM_SIZE = 512;
const terrainSize = 12;

export let waterSimulation: WaterFlowVisualization | null = null;

const initSimulation: RendererInitSystem = (world, _scene, renderer) => {
  observe(world, onAdd(WaterSimulation), (entity$) => {
    const [heightMapEntity$] = query(world, [Default, HeightMap, TextureRef]);
    const textureId = TextureRef.ref[heightMapEntity$];
    const texture = getTexture(textureId) as THREE.DataTexture;

    waterSimulation = createGpuWaterFlowSimulation(SIM_SIZE, terrainSize, renderer, texture);

    const cloudShadowTexture = waterSimulation.getCloudShadowTexture();
    const cloudShadowTextureId = cloudShadowTexture.id;
    registerTextureResource(cloudShadowTextureId, cloudShadowTexture);
    createTexture(world, cloudShadowTextureId, CloudShadowMapOf(entity$));

    const velocityTexture = waterSimulation.getVelocityTexture();
    const velocityTextureId = velocityTexture.id;
    registerTextureResource(velocityTextureId, velocityTexture);
    createTexture(world, velocityTextureId, VelocityMapOf(entity$));

    const simulationTexture = waterSimulation.getSimulationTexture();
    const simulationTextureId = simulationTexture.id;
    registerTextureResource(simulationTextureId, simulationTexture);
    createTexture(world, simulationTextureId, WaterHeightmapOf(entity$));
  });
};

const initAddWater: RendererInitSystem = (world, scene, renderer) => {
  const canvas: HTMLElement = renderer.domElement;

  canvas.addEventListener("click", (event) => {
    if (!waterSimulation) {
      return;
    }

    // Calculate mouse position in normalized device coordinates
    const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;

    const camera = getCamera(scene);
    const [terrainEid] = query(world, [Terrain, MeshRef]);
    const terrainMesh = getMesh(scene, MeshRef.ref[terrainEid]);

    if (!camera || !terrainMesh) {
      return;
    }

    // Create raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

    // Intersect with terrain (account for rotation)
    const terrainIntersects = raycaster.intersectObject(terrainMesh);

    if (terrainIntersects.length === 0) {
      return;
    }

    const intersect = terrainIntersects[0];
    const point = intersect.point;

    // Debug: log world coordinates
    console.log("World point:", { x: point.x, y: point.y, z: point.z });

    // Convert world coordinates to terrain-local coordinates for water simulation
    // Terrain is rotated -π/2 around X-axis:
    // - World X corresponds to terrain's width direction (original plane X)
    // - World Z corresponds to terrain's height direction (original plane Y, inverted)
    // The displacement texture maps: column→X (-6 to +6), row→Z (-6 to +6)

    // Map world coordinates to [0, terrainSize] for the water simulation
    const x = point.x + terrainSize / 2;
    const y = point.z + terrainSize / 2; // Removed the negative sign

    // Debug: log converted coordinates
    console.log("Converted terrain coords:", { x, y });

    // Debug: log texture texel coordinates
    const uvX = x / terrainSize;
    const uvY = y / terrainSize;
    const width = SIM_SIZE; // simulation grid size
    const texelX = Math.floor(uvX * width);
    const centerY = Math.floor((1.0 - uvY) * width); // Y is flipped for texture coordinates
    console.log("Texture texel coords:", { uvX, uvY, texelX, centerY });

    waterSimulation.addWater(x, y, 0.1, 3);
  });
};

export const initResize: RendererInitSystem = (_world, scene, renderer) => {
  // Handle window resize
  window.addEventListener("resize", () => {
    const camera = getCamera(scene) as THREE.OrthographicCamera;
    if (!camera) {
      return;
    }

    const frustumSize = 20;
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = (frustumSize * aspect) / -2;
    camera.right = (frustumSize * aspect) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
};

export const rendererInitSystem: RendererInitSystem = (world, scene, renderer) => {
  initSimulation(world, scene, renderer);
  initAddWater(world, scene, renderer);
  initResize(world, scene, renderer);
};
