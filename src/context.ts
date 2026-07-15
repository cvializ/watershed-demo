export const createGameWorldContext = () => ({
  time: 0,
  fps: 0,
});

export type GameWorldContext = ReturnType<typeof createGameWorldContext>;
