import * as THREE from "three";

import watershedHighlightFrag from "@/shaders/visualizer/watershed-highlight.frag?raw";
import watershedHighlightVert from "@/shaders/visualizer/watershed-highlight.vert?raw";

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