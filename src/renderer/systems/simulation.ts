import type { ShaderMaterial } from "three";

import { query } from "bitecs";
import * as THREE from "three";

import type { RendererSystem } from "@/renderer/types";

import { MaterialRef, WaterSimulation as WaterSimulationComponent } from "@/components/components";
import { cloudSphereSystem, waterSimulation } from "@/renderer/systems/init/simulation";
import { getMaterial } from "@/scene/resources/material";

export const simulationSystem: RendererSystem = (world, scene, renderer, dt) => {
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

  // Update cloud spheres if available
  if (cloudSphereSystem) {
    const camera = (renderer as any).getCurrentViewportCamera || 
      scene.children.find((c: THREE.Object3D) => (c as any).isCamera);
    if (camera) {
      cloudSphereSystem.update(camera, dt);

      // Add cloud sphere mesh to scene if not already added
      const cloudMesh = cloudSphereSystem.getMesh();
      
      // Check if mesh is already in scene
      const existingCloudMesh = scene.getObjectByName("volumetric-clouds");
      if (!existingCloudMesh && cloudMesh) {
        console.log("Adding volumetric clouds to scene");
        cloudMesh.name = "volumetric-clouds";
        scene.add(cloudMesh);
      }
    } else {
      console.log("Camera not found for clouds");
    }
  } else {
    console.log("Cloud sphere system not initialized");
  }
};
