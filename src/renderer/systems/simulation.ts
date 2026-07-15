import type { ShaderMaterial } from "three";

import { query } from "bitecs";

import type { RendererSystem } from "@/renderer/types";

import { MaterialRef, WaterSimulation } from "@/components/components";
import { waterSimulation } from "@/renderer/systems/renderInitSystem";
import { getMaterial } from "@/scene/resources/material";

export const simulationSystem: RendererSystem = (world, _scene, _renderer, dt) => {
  if (!waterSimulation) {
    return;
  }

  const { showVelocity, erosionRate, depositionRate, sedimentCapacity } = world;
  const [entity$] = query(world, [WaterSimulation, MaterialRef]);
  const material = getMaterial(MaterialRef.ref[entity$]) as ShaderMaterial;
  material.uniforms.uShowVelocity.value = showVelocity;

  // Update erosion parameters if they've changed
  waterSimulation.setErosionParameters(
    erosionRate ?? 0.1,
    depositionRate ?? 0.05,
    sedimentCapacity ?? 0.5,
  );

  waterSimulation.compute(dt);
};
