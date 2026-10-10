precision highp float;

varying float vMask;

void main() {
  // Skip anything fully faded out (outside the watershed, or beyond the
  // fade distance) so the terrain underneath shows.
  if (vMask <= 0.0) {
    discard;
  }

  // Translucent soft white over the contributing area, fading with each
  // fragment's distance along the drainage network from the highlight
  // points: `vMask` is 1 on the pour points and drops toward the highlight
  // floor as the catchment trails away, so the same distance that carries
  // the water also fades the highlight. Partial mask (interpolated between
  // cells at different distances) fades smoothly across cell edges.
  gl_FragColor = vec4(0.95, 0.95, 0.98, 0.65 * vMask);
}