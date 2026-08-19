import { observe, onAdd, onRemove } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import { MeshRef, ObjectRef, Renderable } from "@/components/components";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import {
  createMeshInstance,
  disposeMeshInstance,
  getMeshInstance,
  hasMeshInstanceFactory,
} from "@/scene/resources/meshInstances";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
import { logger } from "@/utils/logger";

export const initRenderables: SceneInitSystem = (world, scene): void => {
  logger.info("[renderable:init]");

  // Handle MeshRef + Renderable entities
  observe(world, onAdd(MeshRef, Renderable), (entity$) => {
    logger.debug("RENDERABLE ADDED");
    const meshId = MeshRef.ref[entity$] as MeshEnum;
    if (hasMeshInstanceFactory(meshId)) {
      // Mesh types that need one object per entity get a fresh instance
      scene.add(createMeshInstance(entity$, meshId));
      return;
    }
    scene.add(getMesh(meshId));
  });

  observe(world, onRemove(MeshRef, Renderable), (eid$) => {
    logger.debug("RENDERABLE REMOVED");
    logger.debug(`Remove mesh ${MeshRef.ref[eid$]}`);
    const meshId = MeshRef.ref[eid$] as MeshEnum;
    if (hasMeshInstanceFactory(meshId)) {
      const instance = getMeshInstance(eid$);
      if (instance) {
        scene.remove(instance);
        disposeMeshInstance(eid$);
      }
      return;
    }
    scene.remove(getMesh(meshId));
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
};
