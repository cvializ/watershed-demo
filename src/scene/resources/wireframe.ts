import * as THREE from "three";

import { createTerrainGeometry } from "@/scene/resources/terrain";

const createWireframeMaterialResource = () => {
  return new THREE.LineBasicMaterial({
    color: 0xffaa00,
    opacity: 0.1,
    transparent: true,
  });
};

export const createWireframeResource = () => {
  const terrainGeometry = createTerrainGeometry();
  const wireframeGeometry = new THREE.WireframeGeometry(terrainGeometry);
  const wireframeMaterial = createWireframeMaterialResource();
  const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);

  // Apply same rotation as terrain
  wireframe.rotation.x = -Math.PI / 2;

  return wireframe;
};
