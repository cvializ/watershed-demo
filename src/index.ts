import "@/style.css";
import { createWorld } from "bitecs";

import { rendererInitSystem } from "@/renderer/renderInitSystem";
import { rendererSyncSystem } from "@/renderer/renderSyncSystem";
import { createLoopResource, createRendererResource } from "@/renderer/resources";
import { createSceneResource } from "@/scene/resources";
import { sceneInitSystem } from "@/scene/systems/sceneInitSystem";
import { sceneSyncSystem } from "@/scene/systems/sceneSyncSystem";
// import { loadFromWorldStorage, saveToWorldStorage } from "@/storage";
// import { cameraMovementInitSystem } from "@/world/systems/cameraMovement";
import { worldInitSystem } from "@/world/systems/worldInitSystem";
import { worldSyncSystem } from "@/world/systems/worldSyncSystem";

const gameContext = {
  time: 0,
};

export type GameContext = typeof gameContext;

const world = createWorld<GameContext>(gameContext);

const { scene } = createSceneResource();
const { renderer, render } = createRendererResource();

rendererInitSystem(world, scene, renderer); // why does this have to be first again?
sceneInitSystem(world, scene);
worldInitSystem(world);

// cameraMovementInitSystem(world);

// Load saved ECS state from localStorage on startup
// loadFromWorldStorage(world, "ecs-snapshot");

// Create save/load UI controls
// function createEcsControls() {
//   const container = document.createElement("div");
//   container.className = "ecs-controls";

//   // Save button
//   const saveBtn = document.createElement("button");
//   saveBtn.className = "ecs-btn";
//   saveBtn.textContent = "💾 Save State";
//   saveBtn.onclick = () => {
//     saveToWorldStorage(world, "ecs-snapshot");
//   };

//   // Load button
//   const loadBtn = document.createElement("button");
//   loadBtn.className = "ecs-btn";
//   loadBtn.textContent = "📂 Load State";
//   loadBtn.onclick = () => {
//     loadFromWorldStorage(world, "ecs-snapshot");
//   };

//   // Clear button
//   const clearBtn = document.createElement("button");
//   clearBtn.className = "ecs-btn";
//   clearBtn.textContent = "🗑️ Clear State";
//   clearBtn.onclick = () => {
//     localStorage.removeItem("ecs-snapshot");
//     console.log("Saved ECS state cleared from localStorage");
//   };

//   container.appendChild(saveBtn);
//   container.appendChild(loadBtn);
//   container.appendChild(clearBtn);

//   document.body.appendChild(container);
// }

// createEcsControls();

createLoopResource((_t, dt) => {
  worldSyncSystem(world, dt);
  sceneSyncSystem(world, scene, dt);
  rendererSyncSystem(world, scene, renderer, dt);

  render(scene, dt);
});
