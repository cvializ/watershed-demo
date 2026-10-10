// Per-vertex distance-fade highlight for the watershed under the cursor.
// Each vertex carries `aMask` — its highlight intensity, 1 on the traced
// pour points and decreasing with each hop of flow-path distance from them
// (0 outside the watershed) — and the fragment shader uses the
// interpolated value as the highlight's alpha, so the colour fades as the
// catchment trails away from the highlight points.
attribute float aMask;
varying float vMask;

void main() {
  vMask = aMask;

  // Lift masked fragments slightly toward the camera so the highlight stays
  // visible on top of the terrain instead of z-fighting with it.
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}