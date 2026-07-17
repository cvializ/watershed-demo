import * as THREE from "three";

import { calculateHeight } from "@/terrainUtils";
import { SurfaceMaterial } from "@/types/surfaceMaterials";

/**
 * Calculate surface material based on terrain characteristics
 * - High elevation + steep slope → Rocks
 * - Medium-high elevation + gentle slope → Grass  
 * - Medium elevation + moderate slope → Bare Dirt
 */
function calculateSurfaceMaterial(
  x: number,
  z: number,
  height: number,
): typeof SurfaceMaterial[keyof typeof SurfaceMaterial] {
  // Calculate slope using finite differences
  const delta = 0.1;
  const heightRight = calculateHeight(x + delta, z);
  const heightUp = calculateHeight(x, z + delta);
  
  const slopeX = Math.abs(heightRight - height);
  const slopeZ = Math.abs(heightUp - height);
  const slopeMagnitude = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);
  
  // Normalize elevation to 0-1 range (approximate)
  const normalizedElevation = (height + 2) / 4; // Height ranges roughly from -2 to 2
  
  // Material determination logic
  if (normalizedElevation > 0.7 && slopeMagnitude > 0.3) {
    // High elevation + steep slope = Rocks
    return SurfaceMaterial.Rocks;
  } else if (normalizedElevation > 0.4 && slopeMagnitude < 0.2) {
    // Medium-high elevation + gentle slope = Grass
    return SurfaceMaterial.Grass;
  } else {
    // Everything else = Bare Dirt
    return SurfaceMaterial.BareDirt;
  }
}

export const createTerrainGeometry = () => {
  // Create triangular terrain mesh
  const terrainSize = 12;
  const segments = 80;
  const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);

  // Convert plane to height-based terrain
  const positions = geometry.attributes.position;
  
  // Create surface material texture data (same resolution as segments)
  const materialWidth = segments + 1;
  const materialData = new Float32Array(materialWidth * materialWidth * 4);
  
  // Track materials for visualization
  const materials = new Map<number, typeof SurfaceMaterial[keyof typeof SurfaceMaterial]>();

  // Calculate height and materials for each vertex
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);

    // Calculate height using lower frequency noise for rolling hills
    let height = 0;
    height += calculateHeight(x, y);

    positions.setZ(i, height);
    
    // Calculate surface material
    const material = calculateSurfaceMaterial(x, y, height);
    materials.set(i, material);
    
    // Store material data for texture (map UV to texel)
    const row = Math.floor(i / materialWidth);
    const col = i % materialWidth;
    const texelIndex = (row * materialWidth + col) * 4;
    
    // Store material type in R channel, normalized elevation in G
    const normalizedElevation = (height + 2) / 4;
    materialData[texelIndex + 0] = material; // R: material type
    materialData[texelIndex + 1] = normalizedElevation; // G: elevation for visualization
    materialData[texelIndex + 2] = 0.0;
    materialData[texelIndex + 3] = 1.0;
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
  
  // Create surface material texture
  const surfaceMaterialTexture = new THREE.DataTexture(
    materialData,
    materialWidth,
    materialWidth,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  surfaceMaterialTexture.needsUpdate = true;
  
  // Store materials map in geometry for CPU-side access
  (geometry as any).surfaceMaterials = materials;
  (geometry as any).surfaceMaterialTexture = surfaceMaterialTexture;

  return geometry;
};
