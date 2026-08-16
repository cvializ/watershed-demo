import type { SceneInitSystem } from "@/scene/types";

import { initObjects } from "@/scene/resources/objectCache";
import { cameraLookInitSystem } from "@/scene/systems/init/cameraLook";
import { hiddenInitSystem } from "@/scene/systems/init/hidden";
import { initMaterials } from "@/scene/systems/init/material";
import { initMeshes } from "@/scene/systems/init/mesh";
import { initRenderables } from "@/scene/systems/init/renderable";
import { initTextures } from "@/scene/systems/init/texture";
import { logger } from "@/utils/logger";

export const sceneInitSystem: SceneInitSystem = (world, scene): void => {
  logger.info("[scene:init]");

  initRenderables(world, scene);
  initTextures(world, scene);
  initMaterials(world, scene);
  initMeshes(world, scene);
  initObjects(world, scene);

  hiddenInitSystem(world, scene);

  cameraLookInitSystem(world, scene);
};
