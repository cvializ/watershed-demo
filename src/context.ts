export const createGameWorldContext = () => ({
  time: 0,
  fps: 0,
  showVelocity: true,
  sunAngle: 0,
  sunSpeed: 0.5, // Radians per second
});

export type GameWorldContext = ReturnType<typeof createGameWorldContext>;
