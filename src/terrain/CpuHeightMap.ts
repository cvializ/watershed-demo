import * as THREE from "three";

import { logger } from "@/utils/logger";

/**
 * CPU-side height map that mirrors GPU simulation.
 * This is used to update terrain mesh geometry for wireframe visualization.
 */
export class CpuHeightMap {
  private data: Float32Array;
  private size: number;

  constructor(size: number, initialValue: Float32Array | null = null) {
    this.size = size;
    if (initialValue) {
      // Copy from existing data
      this.data = new Float32Array(initialValue);
    } else {
      // Initialize to zero
      this.data = new Float32Array(size * size);
    }
  }

  /**
   * Get height at a specific pixel coordinate
   */
  get(x: number, y: number): number {
    const clampedX = Math.max(0, Math.min(this.size - 1, x));
    const clampedY = Math.max(0, Math.min(this.size - 1, y));
    return this.data[clampedY * this.size + clampedX];
  }

  /**
   * Set height at a specific pixel coordinate
   */
  set(x: number, y: number, value: number): void {
    const clampedX = Math.max(0, Math.min(this.size - 1, x));
    const clampedY = Math.max(0, Math.min(this.size - 1, y));
    this.data[clampedY * this.size + clampedX] = value;
  }

  /**
   * Get raw data array (for GPU texture initialization)
   */
  getData(): Float32Array {
    return this.data;
  }

  /**
   * Update height map from a DataTexture source
   */
  updateFromDataTexture(texture: THREE.DataTexture): void {
    if (!(texture.data instanceof Float32Array)) {
      logger.warn("[cpu-height-map] Texture data is not Float32Array");
      return;
    }

    const sourceData = texture.data as Float32Array;
    for (let i = 0; i < this.size * this.size && i < sourceData.length / 4; i++) {
      // R channel contains height
      this.data[i] = sourceData[i * 4];
    }

    logger.debug("[cpu-height-map] Updated from DataTexture");
  }

  /**
   * Create texture for GPU consumption (returns DataTexture with copy of data)
   */
  createTexture(): THREE.DataTexture {
    const textureData = new Float32Array(this.data);
    return new THREE.DataTexture(
      textureData,
      this.size,
      this.size,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
  }
}

// Singleton instance
let cpuHeightMap: CpuHeightMap | null = null;

export const getCpuHeightMap = () => cpuHeightMap;

export const initCpuHeightMap = (
  size: number,
  baseHeightData: Float32Array | null = null,
): CpuHeightMap => {
  cpuHeightMap = new CpuHeightMap(size, baseHeightData);
  return cpuHeightMap;
};