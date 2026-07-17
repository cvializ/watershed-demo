import "@/style.css";
import { createWorld } from "bitecs";

import { createGameWorldContext } from "@/context";
import { createLoopResource, createRendererResource } from "@/renderer/resources";
import { rendererInitSystem } from "@/renderer/systems/rendererInitSystem";
import { rendererSyncSystem } from "@/renderer/systems/renderSyncSystem";
import { createSceneResource } from "@/scene/resources";
import { sceneInitSystem } from "@/scene/systems/sceneInitSystem";
import { sceneSyncSystem } from "@/scene/systems/sceneSyncSystem";
import { initGameUI, renderGameUI } from "@/ui/ui";
import { worldInitSystem } from "@/world/systems/worldInitSystem";
import { worldSyncSystem } from "@/world/systems/worldSyncSystem";

const gameWorldContext = createGameWorldContext();
const world = createWorld(gameWorldContext);

const { scene } = createSceneResource();
const { renderer, render } = createRendererResource();

rendererInitSystem(world, scene, renderer); // why does this have to be first again?
sceneInitSystem(world, scene);
worldInitSystem(world);

initGameUI();

createLoopResource((_t, dt) => {
  worldSyncSystem(world, dt);
  sceneSyncSystem(world, scene, dt);
  rendererSyncSystem(world, scene, renderer, dt);

  render(scene, dt);
  renderGameUI(world);
});
