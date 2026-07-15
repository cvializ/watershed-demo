export const createGameWorldContext = () => ({
  time: 0,
  fps: 0,
  showVelocity: true,
  erosionRate: 0.1,
  depositionRate: 0.05,
  sedimentCapacity: 0.5,
});

export type GameWorldContext = ReturnType<typeof createGameWorldContext>;
