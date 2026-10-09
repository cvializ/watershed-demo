precision highp float;

varying float vMask;

void main() {
  // Skip anything not inside the watershed so the terrain underneath shows.
  if (vMask < 0.5) {
    discard;
  }

  // Translucent soft white over the contributing area; partial mask (cell edges) fades.
  // There is now a single overlay (one mesh), so this alpha must be strong
  // enough to see on its own — the old near-invisible 0.01 only appeared
  // because a new overlay was stacked over the last every frame.
  gl_FragColor = vec4(0.95, 0.95, 0.98, 0.35);
}