import * as THREE from "three";

export const createRendererResource = () => {
  // Enable WebGL 2.0 for barycentric coordinates support
  const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    powerPreference: "high-performance", // Prefer WebGL 2.0
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.getElementById("app")!.appendChild(renderer.domElement);

  return renderer;
};
