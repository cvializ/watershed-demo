import type { CloudSphereSystem } from "@/gpu/waterFlowSimulation/createCloudSphereSystem";

let cloudSphereSystem: CloudSphereSystem | null = null;

/**
 * Set the cloud sphere system for use throughout the application.
 */
export const setCloudSphereSystem = (system: CloudSphereSystem): void => {
  cloudSphereSystem = system;
};

/**
 * Get the cloud sphere system.
 */
export const getCloudSphereSystem = (): CloudSphereSystem | null => {
  return cloudSphereSystem;
};

/**
 * Clear the cloud sphere system (useful for cleanup).
 */
export const clearCloudSphereSystem = (): void => {
  cloudSphereSystem = null;
};