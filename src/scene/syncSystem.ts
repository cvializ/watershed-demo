import { query } from "bitecs";
import * as THREE from "three";

import type { SceneSystem } from "@/scene/types";

import { MaterialRef, MeshRef, Transform } from "@/components/components";
import { getMaterial } from "@/scene/resources/material";

const motionSyncSystem: SceneSystem = (world, scene, _dt) => {
  const meshEntities = query(world, [Transform, MeshRef]);
  for (const eid of meshEntities) {
    const meshId = MeshRef.ref[eid];
    if (!meshId) {
      console.warn(`entity ${eid} MeshRef not found in world`);
      continue;
    }
    const mesh = scene.getObjectById(meshId);
    if (!mesh) {
      console.warn(`mesh with id ${meshId} not found in scene`);
      continue;
    }

    mesh.position.set(Transform.x[eid], Transform.y[eid], Transform.z[eid]);

    // Apply rotation — convert Euler angles (stored in radians) to quaternion
    const euler = new THREE.Euler(Transform.rx[eid], Transform.ry[eid], Transform.rz[eid], "XYZ");
    mesh.quaternion.setFromEuler(euler);
  }
};

const materialSyncSystem: SceneSystem = (world, scene, _dt) => {
  const materialMeshEntities = query(world, [MeshRef, MaterialRef]);
  for (const eid of materialMeshEntities) {
    const meshId = MeshRef.ref[eid];
    if (!meshId) {
      console.warn(`entity ${eid} MeshRef not found in world`);
      continue;
    }
    const mesh = scene.getObjectById(meshId);
    if (!mesh) {
      console.warn(`mesh with id ${meshId} not found in scene`);
      continue;
    }

    const materialId = MaterialRef.ref[eid];
    mesh.material = getMaterial(materialId);
  }
};

export const sceneSyncSystem: SceneSystem = (world, scene, _dt): void => {
  motionSyncSystem(world, scene, _dt);
  materialSyncSystem(world, scene, _dt);

  // HERE???
};
