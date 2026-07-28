import type { Scene } from "three";

import type { GameWorldContext } from "@/context";

export type SceneInitSystem = (world: GameWorldContext, scene: Scene) => void;

export type SceneSystem = (
  world: GameWorldContext,
  scene: Scene,
  dt: number,
) => void;
