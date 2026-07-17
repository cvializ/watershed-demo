import type { ShaderMaterial } from "three";

import { query } from "bitecs";
import * as THREE from "three";

import type { RendererSystem } from "@/renderer/types";

import { MaterialRef, WaterSimulation as WaterSimulationComponent } from "@/components/components";
import { waterSimulation } from "@/renderer/systems/init/simulation";
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
