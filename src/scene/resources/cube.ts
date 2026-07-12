import * as THREE from "three";

export const createCubeResource = (scene: THREE.Scene) => {
  const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  const material = new THREE.MeshStandardMaterial({ color: "#e94560", roughness: 0.3 });
  const cubeMesh = new THREE.Mesh(geometry, material);
  scene.add(cubeMesh);

  const cubeMeshId = cubeMesh.id;

  return {
    cubeMeshId,
  };
};
