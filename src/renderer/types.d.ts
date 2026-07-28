import type { GameWorldContext } from "@/context";

export type RendererInitSystem = (
  world: GameWorldContext,
  scene: THREE.Scene,
  renderer: THREE.Renderer,
) => void;

export type RendererSystem = (
  world: GameWorldContext,
  scene: THREE.Scene,
  renderer: THREE.Renderer,
  dt: number,
) => void;
