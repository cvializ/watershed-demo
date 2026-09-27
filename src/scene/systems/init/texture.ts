import type { SceneInitSystem } from "@/scene/types";

import { setObject } from "@/scene/resources/objectCache";
import { TextureEnum } from "@/scene/resources/texture";
import { createDisplacementTextureResource } from "@/scene/resources/textures/displacement";
import { TERRAIN_SIZE } from "@/terrain/constants";
import { logger } from "@/utils/logger";

/** Height-map grid resolution matching the water simulation grid. */
const HEIGHT_MAP_SIZE = 512;

export const initTextures: SceneInitSystem = (_world, _scene) => {
  logger.info("[texture:init]");

  setObject(
    TextureEnum.DefaultHeightMap,
    createDisplacementTextureResource(HEIGHT_MAP_SIZE, TERRAIN_SIZE),
  );
};
