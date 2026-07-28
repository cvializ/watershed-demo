import type { World } from "bitecs";

import type { GameWorldContext } from "@/context";

export type WorldInitSystem = (world: GameWorldContext) => void;

export type WorldSystem = (world: GameWorldContext, dt: number) => void;
