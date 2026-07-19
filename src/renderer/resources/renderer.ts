import * as THREE from "three";

export const createRendererResource = () => {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.getElementById("app")!.appendChild(renderer.domElement);

  return renderer;
};
