import * as THREE from "three";

const createWireframeMaterialResource = () => {
  return new THREE.LineBasicMaterial({
    color: 0xffaa00,
    opacity: 0.1,
    transparent: true,
  });
};

export const createWireframeResource = (scene: THREE.Scene, mesh: THREE.Mesh) => {
  const wireframeGeometry = new THREE.WireframeGeometry(mesh.geometry);
  const wireframeMaterial = createWireframeMaterialResource();
  const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);

  // Apply same rotation as terrain
  wireframe.rotation.x = -Math.PI / 2;

  scene.add(wireframe);

  return {
    meshId: wireframe.id,
  };
};
