import { observe, onAdd, onRemove } from "bitecs";
import { OrbitControls } from "three/examples/jsm/Addons.js";

import type { RendererInitSystem } from "@/renderer/types";

import { Camera } from "@/components/components";
import { createCameraResource } from "@/renderer/resources/camera";
import { getCamera } from "@/scene/sceneUtils";

let controls: OrbitControls | null = null;

export const getControls = () => controls;

export const updateControls = (dt: number) => {
  if (!controls) {
    return;
  }
  controls.update(dt);
};

export const cameraInitSystem: RendererInitSystem = (world, scene, renderer) => {
  observe(world, onAdd(Camera), () => {
    console.log("ON ADD CAMERA");

    const camera = createCameraResource();

    // Create OrbitControls when camera is added (import already started at module load)
    // Get the renderer's domElement - it should be a child of the scene or in the document
    if (!controls) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 2.0;
      controls.target.set(0, 0, 0);
    }

    scene.add(camera);
  });

  observe(world, onRemove(Camera), () => {
    const camera = getCamera(scene);
    if (!camera) {
      return;
    }

    scene.remove(camera);

    if (!controls) {
      return;
    }

    controls.disconnect();
    controls.dispose();
    controls = null;
  });
};
