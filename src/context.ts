export const createGameWorldContext = () => ({
  time: 0,
});

export type GameWorldContext = ReturnType<typeof createGameWorldContext>;
