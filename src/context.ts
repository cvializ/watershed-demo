export const createGameContext = () => ({
  time: 0,
});

export type GameContext = ReturnType<typeof createGameContext>;
