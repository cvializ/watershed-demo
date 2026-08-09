import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import { MaterialEnum } from "@/scene/resources/material";
import { createDefaultMaterialResource } from "@/scene/resources/materials/default";
import { createDownslopeArrowsMaterialResource } from "@/scene/resources/materials/downslopeArrows";
import { createHeightVisualizationMaterialResource } from "@/scene/resources/materials/heightVisualization";
import { createNormalMaterialResource } from "@/scene/resources/materials/normal";
import { createSlopeVisualizationMaterialResource } from "@/scene/resources/materials/slopeVisualization";
import { createTerrainWireframeMaterialResource } from "@/scene/resources/materials/terrainWireframe";
import { createTestingVisualizationMaterialResource } from "@/scene/resources/materials/testingVisualization";
import { createWaterVisualizationMaterialResource } from "@/scene/resources/materials/waterVisualization";
import { setObject } from "@/scene/resources/objectCache";
import { getTexture, TextureEnum } from "@/scene/resources/texture";
import { logger } from "@/utils/logger";

// Helper to get a texture with fallback to DefaultHeightMap if not found
const getTextureOrDefault = (id: TextureEnum): THREE.Texture => {
  try {
    return getTexture(id);
  } catch {
    return getTexture(TextureEnum.DefaultHeightMap);
  }
};

export const initMaterials: SceneInitSystem = () => {
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
  setObject(
    MaterialEnum.Slope,
    createSlopeVisualizationMaterialResource({
      heightmap: getTexture(TextureEnum.DefaultHeightMap),
    }),
  );
  setObject(
    MaterialEnum.WaterFlow,
    createWaterVisualizationMaterialResource({
      heightmap: getTextureOrDefault(TextureEnum.DefaultHeightMap),
      waterHeightMap: getTextureOrDefault(TextureEnum.WaterHeightMap),
      cloudShadowMap: getTextureOrDefault(TextureEnum.CloudShadowMap),
      velocityMap: getTextureOrDefault(TextureEnum.VelocityMap),
      surfaceMaterialMap: getTextureOrDefault(TextureEnum.SurfaceMaterialMap),
      sunLightPosition: new THREE.Vector3(0, 0, 0),
    }),
  );
  // Testing Simulation visualizes sediment flow
  setObject(
    MaterialEnum.TestingSimulation,
    createTestingVisualizationMaterialResource({
      testingTexture: getTextureOrDefault(TextureEnum.SedimentFlowMap),
    }),
  );
  // Terrain Wireframe visualizes mesh triangles
  setObject(
    MaterialEnum.TerrainWireframe,
    createTerrainWireframeMaterialResource({
      heightmap: getTextureOrDefault(TextureEnum.DefaultHeightMap),
    }),
  );
};
