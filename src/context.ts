export const createGameWorldContext = () => ({
  time: 0,
  fps: 0,
  showVelocity: true,
  visualizationMode: 4, // Default to Water Flow mode
  sunAngle: 0,
  sunSpeed: 0.5, // Radians per second
  sunPosition: {
    x: 0,
    y: 0,
    z: 0,
  },
  pendingInit: [],
});

export type GameWorldContext = ReturnType<typeof createGameWorldContext>;
