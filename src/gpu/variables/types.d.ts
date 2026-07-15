export type GpuVariable = {
  variable: Variable;
  update: (deltaTime: number) => void;

  /**
   * Get the cloud texture from GPU computation render target.
   * This texture can be used as a shadow map on terrain materials.
   */
  getTexture: () => THREE.Texture;
};
