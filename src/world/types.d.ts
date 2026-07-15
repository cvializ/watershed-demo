import type { World } from "bitecs";

import type { GameContext } from "@/context";

export type WorldInitSystem = (world: World<GameContext>) => void;

export type WorldSystem = (world: World<GameContext>, dt: number) => void;
