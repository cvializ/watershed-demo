import * as THREE from "three";

const materialCache = new Map<string, THREE.Material>();

export const getMaterial = (uuid: string) => {
  return materialCache.get(uuid);
};

export const createDefaultMaterialResource = () => {
  const material = new THREE.MeshPhongMaterial() as THREE.Material;
  materialCache.set(material.uuid, material);

  return {
    materialId: material.uuid,
  };
};
