import { observe, onAdd, onRemove } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import { Hidden, MeshRef } from "@/components/components";

const hideSystem: SceneInitSystem = (world, scene) => {
  observe(world, onAdd(Hidden, MeshRef), (entity$) => {
    // Get all material meshes
    console.log("hidden");
    const meshId = MeshRef.ref[entity$] as string;
    if (!meshId) {
      console.error(`entity ${entity$} MeshRef not found in world`);
      return;
    }
    const mesh = scene.getObjectByName(meshId) as THREE.Mesh;
    if (!mesh) {
      console.error(`mesh with name ${meshId} not found in scene`);
      return;
    }
    mesh.visible = false;
  });
};

const showSystem: SceneInitSystem = (world, scene) => {
  observe(world, onRemove(Hidden, MeshRef), (entity$) => {
    // Get all material meshes

    const meshId = MeshRef.ref[entity$] as string;
    if (!meshId) {
      console.error(`entity ${entity$} MeshRef not found in world`);
      return;
    }
    const mesh = scene.getObjectByName(meshId) as THREE.Mesh;
    if (!mesh) {
      console.error(`mesh with name ${meshId} not found in scene`);
      return;
    }
    mesh.visible = true;
  });
};

export const hiddenInitSystem: SceneInitSystem = (world, scene) => {
  hideSystem(world, scene);
  showSystem(world, scene);
};
