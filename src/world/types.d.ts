import type { World } from "bitecs";

import type { GameContext } from "@/context";

export type WorldInitSystem = (world: GameWorld) => void;

export type WorldSystem = (world: GameWorld, dt: number) => void;
