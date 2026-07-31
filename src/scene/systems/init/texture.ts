import type { SceneInitSystem } from "@/scene/types";

import { TextureEnum } from "@/scene/resources/texture";
import { createDisplacementTextureResource } from "@/scene/resources/textures/displacement";
import { setObject } from "@/scene/resources/objectCache";
import { logger } from "@/utils/logger";

export const initTextures: SceneInitSystem = (_world, _scene) => {
  logger.info("[texture:init]");

  setObject(TextureEnum.DefaultHeightMap, createDisplacementTextureResource(512, 12));
};