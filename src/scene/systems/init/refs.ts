import { observe, onAdd } from "bitecs";

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
  observe(world, onAdd(Default, MaterialRef), (entity$) => {
    const { materialId: defaultMaterialId } = createDefaultMaterialResource();
    MaterialRef.ref[entity$] = defaultMaterialId;
  });

  observe(world, onAdd(Default, HeightMap, TextureRef), (entity$) => {
    const { textureId } = createDefaultHeightMapTextureResource();
    TextureRef.ref[entity$] = textureId;
  });

  observe(world, onAdd(Terrain), (entity$) => {
    const { meshId } = createTerrainResource(scene);
    MeshRef.ref[entity$] = meshId;
  });
};
