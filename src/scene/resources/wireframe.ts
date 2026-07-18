import * as THREE from "three";

import { materialCache } from "@/scene/resources/material";

const getWireframeMaterial = (uuid: string) => {
  return materialCache.get(uuid) as THREE.Material;
};

const createWireframeMaterialResource = () => {
  const wireframeMaterial = new THREE.LineBasicMaterial({
    color: 0xffaa00,
    opacity: 0.1,
    transparent: true,
  });

  materialCache.set(wireframeMaterial.uuid, wireframeMaterial);

  return {
    materialId: wireframeMaterial.uuid,
  };
};

export const createWireframeResource = (scene: THREE.Scene, mesh: THREE.Mesh) => {
  const wireframeGeometry = new THREE.WireframeGeometry(mesh.geometry);
  const { materialId } = createWireframeMaterialResource();
  const wireframeMaterial = getWireframeMaterial(materialId);
  const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);

  // Apply same rotation as terrain
  wireframe.rotation.x = -Math.PI / 2;

  scene.add(wireframe);

  return {
    meshId: wireframe.id,
    materialId: wireframeMaterial.uuid,
  };
};
