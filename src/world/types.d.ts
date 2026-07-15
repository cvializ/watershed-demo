import type { World } from "bitecs";

import type { GameWorld } from "@/context";

export type WorldInitSystem = (world: GameWorld) => void;

export type WorldSystem = (world: GameWorld, dt: number) => void;
