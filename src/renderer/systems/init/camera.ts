import { observe, onAdd, onRemove } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import { Camera } from "@/components/components";
import {
  createCameraControlsResource,
  disposeCameraControls,
} from "@/renderer/resources/camera";
import {
  createKeyboardCameraResource,
  disposeKeyboardCamera,
} from "@/renderer/resources/keyboardCamera";
import { GeneralObjectEnum } from "@/scene/resources/object";
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
    const camera = getObject(GeneralObjectEnum.Camera) as THREE.Camera;
    const controls = createCameraControlsResource(camera, domElement);

    // Keyboard flight: WASD pan, Z/X orbit, Q/E tilt about the pivot, R/F zoom.
    // The scene camera is an OrthographicCamera (see createCameraResource), which
    // is why the cached Object3D can be handed over as a zoom-capable camera here.
    createKeyboardCameraResource(
      camera as THREE.OrthographicCamera | THREE.PerspectiveCamera,
      controls,
    );
  });

  observe(world, onRemove(Camera), (_entity$) => {
    logger.info("[camera:remove]");

    // Clean up keyboard input first, then the controls it drives
    disposeKeyboardCamera();
    disposeCameraControls();
  });
};
