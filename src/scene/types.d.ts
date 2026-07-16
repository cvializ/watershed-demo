import type { GameWorld } from "@/types";

export type SceneInitSystem = (world: GameWorld, scene: THREE.Scene) => void;

export type SceneSystem = (world: GameWorld, scene: THREE.Scene, dt: number) => void;
