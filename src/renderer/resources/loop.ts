import * as THREE from "three";

export type LoopFunction = (t: number, dt: number) => void;

export const createLoopResource = (cb: LoopFunction) => {
  const timer = new THREE.Timer();
  timer.connect(document);

  // --- Animation Loop ---
  const animate: FrameRequestCallback = (time) => {
    requestAnimationFrame(animate);

    timer.update(time);
    cb(time, timer.getDelta());
  };

  animate(performance.now());
};
