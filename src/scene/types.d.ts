import type { World } from "bitecs";

export type SceneInitSystem = (world: World, scene: THREE.Scene) => void;

export type SceneSystem = (world: World, scene: THREE.Scene, dt: number) => void;
