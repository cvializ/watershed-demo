import { observe, onAdd, onRemove } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import { Camera } from "@/components/components";
import {
  createCameraControlsResource,
  disposeCameraControls,
} from "@/renderer/resources/camera";
import { GeneralObjectEnum } from "@/scene/resources/generalObject";
import { getObject } from "@/scene/resources/objectCache";
import { logger } from "@/utils/logger";

export const cameraInitSystem: RendererInitSystem = (
  world,
  _scene,
  renderer,
) => {
  observe(world, onAdd(Camera), (_entity$) => {
    logger.info("[camera:add]");

    // Create OrbitControls when camera is added
    const domElement = renderer.domElement;
    createCameraControlsResource(
      getObject(GeneralObjectEnum.Camera) as THREE.Camera,
      domElement,
    );
  });

  observe(world, onRemove(Camera), (_entity$) => {
    logger.info("[camera:remove]");

    // Clean up controls
    disposeCameraControls();
  });
};
