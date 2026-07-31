import * as THREE from "three";

import { getMaterial, MaterialEnum } from "@/scene/resources/material";
import { MeshEnum } from "@/scene/resources/mesh";
import { createTerrainGeometry } from "@/scene/resources/meshes/terrain";
import { createDownslopeArrowsGeometry } from "@/shaders/visualizer/createDownslopeArrowsGeometry";

export const createDownslopeArrowsMeshResource = () => {
  const terrainGeometry = createTerrainGeometry();
  const arrowGeometry = createDownslopeArrowsGeometry(terrainGeometry, 0.3);

  const arrowMaterial = getMaterial(MaterialEnum.DownslopeArrowsMaterial);

  // Create LineSegments
  const arrows = new THREE.LineSegments(arrowGeometry, arrowMaterial);
  arrows.name = MeshEnum.DownslopeArrows;
  arrows.rotation.x = -Math.PI / 2;

  return arrows;
};