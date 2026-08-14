import * as THREE from "three";

let _renderer: THREE.WebGLRenderer | null = null;

export const createRendererResource = () => {
  // Enable WebGL 2.0 for barycentric coordinates support
  _renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance", // Prefer WebGL 2.0
  });
  _renderer.setSize(innerWidth, innerHeight);
  _renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.getElementById("app")!.appendChild(_renderer.domElement);

  return _renderer;
};

/** Get the global renderer instance */
export const getRenderer = (): THREE.WebGLRenderer | null => {
  return _renderer;
};
