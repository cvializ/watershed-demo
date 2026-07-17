import { observe, onAdd, query } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem, RendererSystem } from "@/renderer/types";

import {
  WaterSimulation,
  Default,
  HeightMap,
  TextureRef,
  WaterHeightmapOf,
  CloudShadowMapOf,
  VelocityMapOf,
} from "@/components/components";
import {
  createGpuWaterFlowSimulation,
  type WaterFlowVisualization,
} from "@/gpu/createGpuWaterFlowSimulation";
import { getTexture, registerTextureResource } from "@/scene/resources/texture";
import { createTexture } from "@/world/factories/texture";

const SIM_SIZE = 512;
const terrainSize = 12;

export let waterSimulation: WaterFlowVisualization | null = null;

export const initSimulation: RendererInitSystem = (world, _scene, renderer) => {
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

import type { ShaderMaterial } from "three";
import { MaterialRef, WaterSimulation as WaterSimulationComponent } from "@/components/components";
import { getMaterial } from "@/scene/resources/material";

export const simulationSystem: RendererSystem = (world, scene, _renderer, dt) => {
  if (!waterSimulation) {
    return;
  }

  const { showVelocity } = world;
  const [entity$] = query(world, [WaterSimulationComponent, MaterialRef]);
  const material = getMaterial(MaterialRef.ref[entity$]) as ShaderMaterial;
  material.uniforms.uShowVelocity.value = showVelocity;

  // Update sun light position uniform for shadow calculation
  const sunLight = scene.getObjectByName("sun-light") as THREE.DirectionalLight;
  if (sunLight) {
    material.uniforms.uLightPosition.value.copy(sunLight.position);
  }

  waterSimulation.compute(dt);
};