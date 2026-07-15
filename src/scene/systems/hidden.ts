import { observe, onAdd, onRemove } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import { Hidden, MeshRef } from "@/components/components";

export const hiddenInitSystem: SceneInitSystem = (world, scene) => {
  observe(world, onAdd(Hidden, MeshRef), (entity$) => {
    // Get all material meshes
    console.log("hidden");
    const meshId = MeshRef.ref[entity$];
    if (!meshId) {
      console.warn(`entity ${entity$} MeshRef not found in world`);
      return;
    }
    const mesh = scene.getObjectById(meshId) as THREE.Mesh;
    if (!mesh) {
      console.warn(`mesh with id ${meshId} not found in scene`);
      return;
    }
    mesh.visible = false;
  });

  observe(world, onRemove(Hidden, MeshRef), (entity$) => {
    // Get all material meshes

    const meshId = MeshRef.ref[entity$];
    if (!meshId) {
      console.warn(`entity ${entity$} MeshRef not found in world`);
      return;
    }
    const mesh = scene.getObjectById(meshId) as THREE.Mesh;
    if (!mesh) {
      console.warn(`mesh with id ${meshId} not found in scene`);
      return;
    }
    mesh.visible = true;
  });
};
