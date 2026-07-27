export const createGameWorldContext = () => ({
  gameTime: 0,
  time: 0,
  fps: 0,
  showVelocity: true,
  lastVizMode: 4, // Default to Water Flow mode
  visualizationMode: 4, // Default to Water Flow mode
  sunAngle: 0,
  sunSpeed: 0.5, // Radians per second
  sunPosition: {
    x: 0,
    y: 0,
    z: 0,
  },
  pendingInit: [],
  // Camera state for serialization
  cameraPosition: {
    x: 15,
    y: 12,
    z: 15,
  },
  cameraTarget: {
    x: 0,
    y: 0,
    z: 0,
  },
  cameraZoom: 2.5,
});

export type GameWorldContext = ReturnType<typeof createGameWorldContext>;
