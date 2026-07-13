import type { World } from "bitecs";

export type RendererInitSystem = (
  world: World,
  scene: THREE.Scene,
  renderer: THREE.Renderer,
) => void;

export type RendererSystem = (
  world: World,
  scene: THREE.Scene,
  renderer: THREE.Renderer,
  dt: number,
) => void;
