export const createGameWorldContext = () => ({
  time: 0,
  fps: 0,
  showVelocity: true,
});

export type GameWorldContext = ReturnType<typeof createGameWorldContext>;
