import { observe, onAdd, onRemove } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import { MeshRef, ObjectRef, Renderable } from "@/components/components";
import { GeneralObjectEnum } from "@/scene/resources/generalObject";
import { getMesh, initMeshes, MeshEnum } from "@/scene/resources/mesh";
import { getObject, initObjects } from "@/scene/resources/objectCache";
import { initTextures } from "@/scene/resources/texture";
import { cameraLookInitSystem } from "@/scene/systems/init/cameraLook";
import { hiddenInitSystem } from "@/scene/systems/init/hidden";
import { initMaterials } from "@/scene/systems/init/material";
import { logger } from "@/utils/logger";

export const sceneInitSystem: SceneInitSystem = (world, scene): void => {
  logger.info("[scene:init]");

  // Handle MeshRef + Renderable entities
  observe(world, onAdd(MeshRef, Renderable), (entity$) => {
    logger.debug("RENDERABLE ADDED");
    scene.add(getMesh(MeshRef.ref[entity$] as MeshEnum));
  });

  observe(world, onRemove(MeshRef, Renderable), (eid$) => {
    logger.debug("RENDERABLE REMOVED");
    logger.debug(`Remove mesh ${MeshRef.ref[eid$]}`);
    scene.remove(getMesh(MeshRef.ref[eid$] as MeshEnum));
  });

  // Handle ObjectRef + Renderable entities
  observe(world, onAdd(ObjectRef, Renderable), (entity$) => {
    logger.debug("OBJECTREF RENDERABLE ADDED");
    const objectRef = ObjectRef.ref[entity$];
    if (objectRef) {
      scene.add(getObject(objectRef as GeneralObjectEnum) as THREE.Object3D);
    }
  });

  observe(world, onRemove(ObjectRef, Renderable), (eid$) => {
    logger.debug("OBJECTREF RENDERABLE REMOVED");
    const objectRef = ObjectRef.ref[eid$];
    if (objectRef) {
      logger.debug(`Remove object ${objectRef}`);
      scene.remove(getObject(objectRef as GeneralObjectEnum));
    }
  });

  initTextures();
  initMaterials();
  initMeshes(world, scene);
  initObjects();

  hiddenInitSystem(world, scene);

  cameraLookInitSystem(world, scene);
};
