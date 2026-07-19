import type { Scene } from "three";

import type { GameWorld } from "@/types";

export type SceneInitSystem = (world: GameWorldConext, scene: Scene) => void;

export type SceneSystem = (world: GameWorldContext, scene: Scene, dt: number) => void;
