import * as THREE from "three";

import { entityExists, hasComponent } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { MeshRef, ObjectRef, Renderable } from "@/components/components";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { getObject } from "@/scene/resources/objectCache";
import { GeneralObjectEnum } from "@/scene/resources/generalObject";
import { materialSystem } from "@/scene/systems/material";
import { positionSystem } from "@/scene/systems/position";
import { sunBackgroundSystem } from "@/scene/systems/sunBackground";
import { visualizationSystem } from "@/scene/systems/visualization";

const initFlushSystem: SceneSystem = (world, scene) => {
  for (const eid of world.pendingInit) {
    if (!entityExists(world, eid)) continue; // guard: removed before flush
    
    // Check if it's a MeshRef + Renderable entity
    if (hasComponent(world, eid, MeshRef) && hasComponent(world, eid, Renderable)) {
      scene.add(getMesh(MeshRef.ref[eid] as MeshEnum));
    }
    
    // Check if it's an ObjectRef + Renderable entity
    if (hasComponent(world, eid, ObjectRef) && hasComponent(world, eid, Renderable)) {
      const objectRef = ObjectRef.ref[eid];
      if (objectRef) {
        scene.add(getObject(objectRef as GeneralObjectEnum) as THREE.Object3D);
      }
    }
  }
  world.pendingInit.length = 0;
};

export const sceneSyncSystem: SceneSystem = (world, scene, dt): void => {
  initFlushSystem(world, scene, dt);
  positionSystem(world, scene, dt);
  materialSystem(world, scene, dt);
  sunBackgroundSystem(world, scene, dt);
  visualizationSystem(world, scene, dt);
};
