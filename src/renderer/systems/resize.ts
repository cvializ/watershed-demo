import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";
import { getCamera } from "@/scene/sceneUtils";

export const initResize: RendererInitSystem = (_world, scene, renderer) => {
  // Handle window resize
  window.addEventListener("resize", () => {
    const camera = getCamera(scene) as THREE.OrthographicCamera;
    if (!camera) {
      return;
    }

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