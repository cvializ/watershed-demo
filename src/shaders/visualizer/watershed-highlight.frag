precision highp float;

varying float vMask;

void main() {
  // Skip anything not inside the watershed so the terrain underneath shows.
  if (vMask < 0.5) {
    discard;
  }

  // Solid-ish red over the contributing area; partial mask (cell edges) fades.
  gl_FragColor = vec4(1.0, 0.0, 0.0, 0.55);
}