import { observe, onAdd, query } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import {
  MeshRef,
  ObjectRef,
  Renderable,
  Terrain,
} from "@/components/components";
import { GeneralObjectEnum } from "@/scene/resources/generalObject";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { getObject } from "@/scene/resources/objectCache";
import { logger } from "@/utils/logger";

export const cameraLookInitSystem: SceneInitSystem = (world, _scene) => {
  observe(world, onAdd(ObjectRef, Renderable), (entity$) => {
    const objectRef = ObjectRef.ref[entity$];
    if (!objectRef) {
      throw new Error(`Entity ${entity$} ObjectRef not found`);
    }
    const camera = getObject(objectRef as GeneralObjectEnum) as THREE.Camera;

    const [terrainEntity$] = query(world, [Terrain, MeshRef]);
    if (!terrainEntity$) {
      logger.error("no terrain found for camera lookAt");
      return;
    }
    const terrain = getMesh(MeshRef.ref[terrainEntity$] as MeshEnum);

    camera.lookAt(terrain.position);

    logger.info("[camera:look-at] success");
  });
};
