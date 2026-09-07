import type { SurfaceMaterialTexture } from "@/scene/resources/textures/surfaceMaterial";

/**
 * Holder for the surface material manager that owns the terrain painting texture.
 *
 * The water simulation creates it (it needs the same texture as its own GPU
 * inputs), and everything that reads or grazes the terrain looks it up here, so
 * scene code does not have to reach into renderer init. Mirrors how the raw
 * THREE texture is published through TextureEnum.SurfaceMaterialMap.
 */
let surfaceMaterialTexture: SurfaceMaterialTexture | null = null;

export const setSurfaceMaterialTexture = (
  texture: SurfaceMaterialTexture,
): void => {
  surfaceMaterialTexture = texture;
};

export const getSurfaceMaterialTexture = (): SurfaceMaterialTexture | null => {
  return surfaceMaterialTexture;
};
