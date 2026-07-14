import { query, type World } from "bitecs";

import type { WorldInitSystem } from "@/world/types";

import { Camera, Velocity } from "@/components/components";

const CAMERA_SPEED = 8; // units / second for XY movement

function arrowDirection(code: string): [number, number] {
  switch (code) {
    case "ArrowUp":
      return [0, 1];
    case "ArrowDown":
      return [0, -1];
    case "ArrowLeft":
      return [-1, 0];
    case "ArrowRight":
      return [1, 0];
    default:
      return [0, 0];
  }
}

const getCameraEntity = (world: World): number => {
  const [cameraEid] = query(world, [Camera]);
  return cameraEid;
};

const addVelocity = (world: World, vx: number, vy: number): void => {
  const eid = getCameraEntity(world);
  Velocity.x[eid] += vx;
  Velocity.y[eid] += vy;
  Velocity.z[eid] = 0;
};

const onKeyDown = (e: KeyboardEvent, world: World): void => {
  const [x, y] = arrowDirection(e.code);
  addVelocity(world, x * CAMERA_SPEED, y * CAMERA_SPEED);
};

const onKeyUp = (e: KeyboardEvent, world: World): void => {
  const [x, y] = arrowDirection(e.code);
  addVelocity(world, -1 * x * CAMERA_SPEED, -1 * y * CAMERA_SPEED);
};

export const cameraMovementInitSystem: WorldInitSystem = (world) => {
  document.addEventListener("keydown", (event) => onKeyDown(event, world));
  document.addEventListener("keyup", (event) => onKeyUp(event, world));
};
