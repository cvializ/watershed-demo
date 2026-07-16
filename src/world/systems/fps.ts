import type { WorldSystem } from "@/world/types";

let frameCount = 0;
let fpsUpdateTime = 0;

export const fpsSystem: WorldSystem = (world) => {
  frameCount++;

  // Update FPS every 500ms for smoother readings
  if (world.time - fpsUpdateTime >= 0.5) {
    world.fps = frameCount / (world.time - fpsUpdateTime);
    frameCount = 0;
    fpsUpdateTime = world.time;
  }
};
