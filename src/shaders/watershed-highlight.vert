// Per-vertex mask highlight for the watershed under the cursor.
// Each vertex carries `aMask` (1 inside the watershed, 0 outside); fragments
// only draw where the interpolated mask is set, tinting the terrain red.
attribute float aMask;
varying float vMask;

void main() {
  vMask = aMask;

  // Lift masked fragments slightly toward the camera so the highlight stays
  // visible on top of the terrain instead of z-fighting with it.
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}