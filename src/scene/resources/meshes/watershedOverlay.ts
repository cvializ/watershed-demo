import * as THREE from "three";

import watershedHighlightFrag from "@/shaders/watershed-highlight.frag?raw";
import watershedHighlightVert from "@/shaders/watershed-highlight.vert?raw";
import { type TerrainHeightGrid } from "@/terrain/terrainHeightGrid";

/**
 * Overlay material/mesh that paints the watershed under the cursor red.
 *
 * The overlay reuses the terrain's own geometry so its highlight always sits
 * exactly on the live terrain (including painted/eroded edits). Each vertex
 * carries a per-cell `aMask` (1 = inside the watershed, 0 = outside); the
 * fragment shader discards anything outside, so only the contributing area
 * shows.
 */

/** Name of the per-vertex mask attribute read by the shaders. */
export const MASK_ATTRIBUTE = "aMask";

/**
 * A red-overlay mesh sharing `terrainGeometry`, prepared hidden.
 *
 * If the geometry doesn't yet carry a mask attribute, one is added. Because
 * the geometry is shared with the terrain, the terrain's own materials simply
 * ignore the extra attribute.
 */
export const createWatershedOverlay = (
  terrainGeometry: THREE.BufferGeometry,
): THREE.Mesh => {
  // Reuse an existing mask attribute if present (e.g. after a geometry swap),
  // otherwise allocate one sized to the vertex count.
  const existing = terrainGeometry.getAttribute(MASK_ATTRIBUTE) as
    | THREE.BufferAttribute
    | undefined;
  if (!existing || existing.itemSize !== 1) {
    const count = terrainGeometry.getAttribute("position").count;
    terrainGeometry.setAttribute(
      MASK_ATTRIBUTE,
      new THREE.BufferAttribute(new Float32Array(count), 1),
    );
  }

  const material = new THREE.ShaderMaterial({
    vertexShader: watershedHighlightVert,
    fragmentShader: watershedHighlightFrag,
    transparent: true,
    // Don't write depth: the highlight sits on the terrain surface and must
    // blend over it rather than occlude its own coplanar triangles.
    depthWrite: false,
    // Bias the coplanar overlay toward the camera to stop it z-fighting with
    // the terrain it sits on.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(terrainGeometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 3;
  mesh.visible = false;

  return mesh;
};

/**
 * Fill the overlay's mask attribute from a `gridDim * gridDim` cell mask
 * (0/1, indexed the same as the geometry's vertices) and flag it for upload.
 */
export const setWatershedMask = (
  overlay: THREE.Mesh,
  mask: Uint8Array,
): void => {
  const attribute = overlay.geometry.getAttribute(
    MASK_ATTRIBUTE,
  ) as THREE.BufferAttribute;

  const array = attribute.array as Float32Array;
  const length = Math.min(array.length, mask.length);
  for (let index = 0; index < length; index++) {
    array[index] = mask[index];
  }

  attribute.needsUpdate = true;
};

/**
 * Arrow overlay for the watershed: `LineSegments` sized to hold one arrow at
 * every terrain vertex, prepared hidden and empty (draw range 0).
 *
 * The geometry is its own buffer (not the shared terrain geometry), laid out
 * in local plane space like the terrain, so `setWatershedArrows` can refill
 * it each hover without reallocating.
 */
export const createWatershedArrowOverlay = (
  terrainGeometry: THREE.BufferGeometry,
): THREE.LineSegments => {
  // One arrow per terrain vertex; each is three line segments (shaft + two
  // barbs) = six vertices.
  const vertexCount = terrainGeometry.getAttribute("position").count;
  const positionCount = vertexCount * 6 * 3;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positionCount), 3),
  );
  geometry.setDrawRange(0, 0);

  const material = new THREE.LineBasicMaterial({
    color: 0x001b26,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
  });

  const mesh = new THREE.LineSegments(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 4;
  mesh.visible = false;

  return mesh;
};

/**
 * Rebuild the arrow overlay so every watershed vertex gets a small arrow
 * pointing continuously downslope.
 *
 * Direction comes from each vertex's own normal: for a heightfield laid out
 * as a local `(x, y)` plane with height in `z`, the normal is proportional to
 * `(dz/dx, dz/dy, -1)`, so `(nx/nz, ny/nz)` recovers the local-plane
 * gradient and the arrow points along steepest descent at an arbitrary angle
 * (not snapped to the eight grid directions). Arrow length stays fixed at
 * about one cell so neighbours don't overlap; only masked vertices get one.
 *
 * @param arrow - The `LineSegments` from `createWatershedArrowOverlay`.
 * @param grid - Height grid, whose bounds give the cell size for arrow size.
 * @param terrainGeometry - Source geometry to read each vertex's position and
 *   normal from (its vertex order matches the grid and mask indexing).
 * @param mask - `gridDim * gridDim` watershed mask (1 = inside).
 */
export const setWatershedArrows = (
  arrow: THREE.LineSegments,
  grid: TerrainHeightGrid,
  terrainGeometry: THREE.BufferGeometry,
  mask: Uint8Array,
): void => {
  const arrowGeometry = arrow.geometry;
  const arrowPositions = arrowGeometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;
  const array = arrowPositions.array as Float32Array;

  const sourcePositions = terrainGeometry.getAttribute("position");
  const sourceNormals = terrainGeometry.getAttribute("normal");
  if (!sourcePositions || !sourceNormals) {
    arrowGeometry.setDrawRange(0, 0);
    arrowPositions.needsUpdate = true;
    return;
  }
  const positionArray = sourcePositions.array as Float32Array;
  const normalArray = sourceNormals.array as Float32Array;

  const vertexCount = sourcePositions.count;
  const { gridDim, minX, maxX, minY, maxY } = grid;
  const cellW = (maxX - minX) / (gridDim - 1);
  const cellH = (maxY - minY) / (gridDim - 1);

  // Arrows stay about one cell long so a vertex-per-arrow field stays
  // readable without neighbouring arrows overlapping.
  const arrowLen = Math.min(cellW, cellH) * 0.6;
  const barbLen = arrowLen * 0.3;
  const barbWidth = arrowLen * 0.25;
  const lift = arrowLen * 0.5;

  let vertex = 0;
  const push = (x: number, y: number, z: number): void => {
    array[vertex * 3] = x;
    array[vertex * 3 + 1] = y;
    array[vertex * 3 + 2] = z;
    vertex++;
  };

  for (let index = 0; index < vertexCount; index++) {
    if (mask[index] !== 1) {
      continue;
    }

    const baseX = positionArray[index * 3];
    const baseY = positionArray[index * 3 + 1];
    const surfaceZ = positionArray[index * 3 + 2] + lift;

    // Continuous downslope from the vertex normal (see docs above).
    const nx = normalArray[index * 3];
    const ny = normalArray[index * 3 + 1];
    const nz = normalArray[index * 3 + 2];
    if (Math.abs(nz) <= 1e-3) {
      continue;
    }

    let dx = nx / nz;
    let dy = ny / nz;
    const dirLength = Math.hypot(dx, dy);
    if (dirLength < 1e-3) {
      continue;
    }
    dx /= dirLength;
    dy /= dirLength;
    const perpX = -dy;
    const perpY = dx;

    const half = arrowLen / 2;
    const sx = baseX - dx * half;
    const sy = baseY - dy * half;
    const tx = baseX + dx * half;
    const ty = baseY + dy * half;

    // Shaft.
    push(sx, sy, surfaceZ);
    push(tx, ty, surfaceZ);
    // Barbs running back from the tip to each side.
    const bx = tx - dx * barbLen;
    const by = ty - dy * barbLen;
    push(tx, ty, surfaceZ);
    push(bx + perpX * barbWidth, by + perpY * barbWidth, surfaceZ);
    push(tx, ty, surfaceZ);
    push(bx - perpX * barbWidth, by - perpY * barbWidth, surfaceZ);
  }

  arrowGeometry.setDrawRange(0, vertex);
  arrowPositions.needsUpdate = true;
};