import type { World } from "bitecs";

export type WorldInitSystem = (world: World) => void;

export type WorldSystem = (world: World, dt: number) => void;
