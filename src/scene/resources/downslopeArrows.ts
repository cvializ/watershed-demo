import * as THREE from "three";

import { getMaterial, MaterialEnum } from "@/scene/resources/material";
import { createTerrainGeometry } from "@/scene/resources/terrain";
import { createDownslopeArrowsGeometry } from "@/shaders/visualizer/createDownslopeArrowsGeometry";

export const createDownslopeArrowsMeshResource = (scene: THREE.Scene) => {
  const terrainGeometry = createTerrainGeometry();
  const arrowGeometry = createDownslopeArrowsGeometry(terrainGeometry, 0.3);

  const arrowMaterial = getMaterial(MaterialEnum.DownslopeArrows);

  // Create LineSegments
  const arrows = new THREE.LineSegments(arrowGeometry, arrowMaterial);
  arrows.name = "downslope-arrows";
  arrows.rotation.x = -Math.PI / 2;

  scene.add(arrows);

  return arrows;
};
