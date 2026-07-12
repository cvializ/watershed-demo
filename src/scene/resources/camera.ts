import * as THREE from "three";

export const createCameraResource = (scene: THREE.Scene) => {
  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = 20;
  const camera = new THREE.OrthographicCamera(
    (frustumSize * aspect) / -2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    frustumSize / -2,
    0.1,
    1000,
  );
  camera.position.set(15, 12, 15);
  camera.zoom = 2.5;
  camera.updateProjectionMatrix();

  scene.add(camera);

  return { camera };
};
