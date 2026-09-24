import type { OrganicDeposit } from "@/gpu/waterFlowSimulation/variables/createGpuTerrainQuality";

/**
 * Holder for the thing that puts organic matter on the ground, published by the simulation resource.
 *
 * The substance fields live on the GPU and their state belongs to the compute graph, so a grazer cannot add to them
 * the way it paints the surface material texture - it has to declare a deposit and let the next pass read it. This
 * module is how scene code reaches that declaration without importing the renderer: the simulation publishes its own
 * `addOrganicDeposit` here when it is created, exactly as it publishes the terrain painting texture on
 * `surfaceMaterialTexture`, and re-publishes when a load recreates the graph.
 */
export type OrganicMatterDepositor = (deposit: OrganicDeposit) => boolean;

let organicMatterDepositor: OrganicMatterDepositor | null = null;

export const setOrganicMatterDepositor = (
  depositor: OrganicMatterDepositor,
): void => {
  organicMatterDepositor = depositor;
};

/**
 * The current depositor, or null while no simulation is running. Callers that have nothing to do without one simply
 * skip the deposit rather than queueing it: a dropped pat is a lost gram of manure, a stale one would land in a world
 * that has since been reloaded.
 */
export const getOrganicMatterDepositor = (): OrganicMatterDepositor | null => {
  return organicMatterDepositor;
};
