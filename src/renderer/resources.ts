import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

import { getCamera } from "@/scene/sceneUtils";

export const createRendererResource = () => {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.getElementById("app")!.appendChild(renderer.domElement);

  let controls: OrbitControls | null = null;

  const render = (scene: THREE.Scene, dt: number) => {
    const camera = getCamera(scene);
    if (!camera) {
      console.log("no camera in scene");
      return;
    }

    if (!controls) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 2.0;
      controls.target.set(0, 0, 0);
    }

    controls.update(dt);

    renderer.render(scene, camera);
  };

  return {
    render,
    renderer,
  };
};

export type LoopFunction = (t: number, dt: number) => void;

export const createLoopResource = (cb: LoopFunction) => {
  // --- Animation Loop ---
  let lastTime = performance.now();

  function animate(now: number): void {
    const dt = (now - lastTime) / 1000; // delta time in seconds
    lastTime = now;

    cb(now, dt);

    requestAnimationFrame(animate);
  }

  animate(performance.now());
};
