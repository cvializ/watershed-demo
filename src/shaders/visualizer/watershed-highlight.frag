precision highp float;

varying float vMask;

void main() {
  // Skip anything not inside the watershed so the terrain underneath shows.
  if (vMask < 0.5) {
    discard;
  }

  // Translucent soft white over the contributing area; partial mask (cell edges) fades.
  gl_FragColor = vec4(0.95, 0.95, 0.98, 0.01);
}