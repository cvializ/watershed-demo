import type { GameWorld } from "@/types";

export type SceneInitSystem = (world: GameWorldConext, scene: THREE.Scene) => void;

export type SceneSystem = (world: GameWorldContext, scene: THREE.Scene, dt: number) => void;
