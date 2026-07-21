import { observe, onAdd, onRemove, entityExists } from "bitecs";

import type { SceneInitSystem } from "@/scene/types";

import { MeshRef, Renderable } from "@/components/components";
import { initSceneMaterialResources } from "@/scene/resources/material";
import { getMesh, initMeshes, MeshEnum } from "@/scene/resources/mesh";
import { initTextures } from "@/scene/resources/texture";
import { cameraInitSystem } from "@/scene/systems/init/camera";
import { hiddenInitSystem } from "@/scene/systems/init/hidden";
import { waterSimulationInitSystem } from "@/scene/systems/init/waterSimulation";

export const sceneInitSystem: SceneInitSystem = (world, scene): void => {
  console.log("INIT!");


  observe(world, onAdd(MeshRef, Renderable), (entity$) => {
    console.log("RENDERABLE ADDED");
    world.pendingInit.push(entity$);
  });

  observe(world, onRemove(MeshRef, Renderable), (eid$) => {
    console.log("RENDERABLE REMOVED");
    console.log(`Remove mesh ${MeshRef.ref[eid$]}`);
    scene.remove(getMesh(MeshRef.ref[eid$] as MeshEnum));
  });


  
  initTextures();
  initSceneMaterialResources();
  initMeshes(world, scene);

  hiddenInitSystem(world, scene);

  waterSimulationInitSystem(world, scene);

  cameraInitSystem(world, scene);
};
