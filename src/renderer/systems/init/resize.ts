import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import { GeneralObjectEnum } from "@/scene/resources/generalObject";
import { getObject } from "@/scene/resources/objectCache";

export const resizeInitSystem: RendererInitSystem = (
  _world,
  scene,
  renderer,
) => {
  // Handle window resize
  window.addEventListener("resize", () => {
    const camera = getObject(
      GeneralObjectEnum.Camera,
    ) as THREE.OrthographicCamera;

    const frustumSize = 20;
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = (frustumSize * aspect) / -2;
    camera.right = (frustumSize * aspect) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
};
