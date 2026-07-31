import "@/style.css";
import { createWorld } from "bitecs";

import { createGameWorldContext } from "@/context";
import { createLoopResource } from "@/renderer/resources/loop";
import { createRendererResource } from "@/renderer/resources/renderer";
import { rendererInitSystem } from "@/renderer/systems/rendererInitSystem";
import { rendererSyncSystem } from "@/renderer/systems/rendererSyncSystem";
import { createSceneResource } from "@/scene/resources";
import { sceneInitSystem } from "@/scene/systems/sceneInitSystem";
import { sceneSyncSystem } from "@/scene/systems/sceneSyncSystem";
import { initSerializers } from "@/storage";
import { initGameUI, renderGameUI } from "@/ui/ui";
import { worldInitSystem } from "@/world/systems/worldInitSystem";
import { worldSyncSystem } from "@/world/systems/worldSyncSystem";

const gameWorldContext = createGameWorldContext();
const world = createWorld(gameWorldContext);

initSerializers(world);

const scene = createSceneResource();
const renderer = createRendererResource();

rendererInitSystem(world, scene, renderer);
sceneInitSystem(world, scene);
worldInitSystem(world);

initGameUI();

export const { tick } = createLoopResource(world, (_t, dt) => {
  worldSyncSystem(world, dt);
  sceneSyncSystem(world, scene, dt);
  rendererSyncSystem(world, scene, renderer, dt);

  renderGameUI(world);
});
