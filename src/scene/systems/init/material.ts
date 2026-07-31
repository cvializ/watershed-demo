import * as THREE from "three";

import { MaterialEnum } from "@/scene/resources/material";
import { createDefaultMaterialResource } from "@/scene/resources/materials/default";
import { createDownslopeArrowsMaterialResource } from "@/scene/resources/materials/downslopeArrows";
import { createHeightVisualizationMaterialResource } from "@/scene/resources/materials/heightVisualization";
import { createNormalMaterialResource } from "@/scene/resources/materials/normal";
import { createPulsingVisualizationMaterialResource } from "@/scene/resources/materials/pulsingVisualization";
import { createSlopeVisualizationMaterialResource } from "@/scene/resources/materials/slopeVisualization";
import { createWaterVisualizationMaterialResource } from "@/scene/resources/materials/waterVisualization";
import { setObject } from "@/scene/resources/objectCache";
import { getTexture, TextureEnum } from "@/scene/resources/texture";
import { logger } from "@/utils/logger";

export const initMaterials = () => {
  logger.info("[material:init]");

  setObject(MaterialEnum.Default, createDefaultMaterialResource());
  setObject(
    MaterialEnum.HeightVisualization,
    createHeightVisualizationMaterialResource({
      heightmap: getTexture(TextureEnum.DefaultHeightMap),
    }),
  );
  setObject(MaterialEnum.Normal, createNormalMaterialResource());
  setObject(
    MaterialEnum.DownslopeArrowsMaterial,
    createDownslopeArrowsMaterialResource(),
  );
  setObject(MaterialEnum.Slope, createSlopeVisualizationMaterialResource());
  setObject(
    MaterialEnum.WaterFlow,
    createWaterVisualizationMaterialResource({
      heightmap: getTexture(TextureEnum.DefaultHeightMap),
      waterHeightMap: getTexture(TextureEnum.WaterHeightMap),
      cloudShadowMap: getTexture(TextureEnum.CloudShadowMap),
      velocityMap: getTexture(TextureEnum.VelocityMap),
      sunLightPosition: new THREE.Vector3(0, 0, 0),
    }),
  );
  setObject(
    MaterialEnum.PulsingSimulation,
    createPulsingVisualizationMaterialResource({
      pulsingTexture: getTexture(TextureEnum.PulsingTexture),
    }),
  );
};
