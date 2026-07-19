import type { GameWorldContext } from "@/context";
import type { GameWorld } from "@/types";

export type RendererInitSystem = (
  world: GameWorld,
  scene: THREE.Scene,
  renderer: THREE.Renderer,
) => void;

export type RendererSystem = (
  world: GameWorldContext,
  scene: THREE.Scene,
  renderer: THREE.Renderer,
  dt: number,
) => void;
