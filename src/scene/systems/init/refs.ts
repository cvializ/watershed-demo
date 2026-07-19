import { observe, onAdd, query } from "bitecs";

import type { SceneInitSystem } from "@/scene/types";

import {
  Default,
  HeightMap,
  MaterialRef,
  MeshRef,
  Terrain,
  TextureRef,
} from "@/components/components";
import { createDefaultMaterialResource } from "@/scene/resources/material";
import { createTerrainResource } from "@/scene/resources/terrain";
import { createDefaultHeightMapTextureResource } from "@/scene/resources/texture";

export const refsInitSystem: SceneInitSystem = (world, scene) => {
  observe(world, onAdd(Default, HeightMap, TextureRef), (entity$) => {
    const { textureId } = createDefaultHeightMapTextureResource();
    TextureRef.ref[entity$] = textureId;
  });

  observe(world, onAdd(Terrain), (entity$) => {
    const { meshId } = createTerrainResource(scene);
    MeshRef.ref[entity$] = meshId;
    // Add default material reference that will be updated by visualization init system
    const { materialId: terrainMaterialId } = createDefaultMaterialResource();
    MaterialRef.ref[entity$] = terrainMaterialId;

    const [heightMap$] = query(world, [Default, HeightMap, TextureRef]);
    TextureRef.ref[entity$] = TextureRef.ref[heightMap$];
  });
};
