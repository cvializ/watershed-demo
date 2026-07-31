import { MeshEnum, setMesh } from "@/scene/resources/mesh";
import { createCloudSphereSystem } from "@/gpu/waterFlowSimulation/createCloudSphereSystem";

/**
 * Create cloud sphere mesh resource and store it in the mesh cache.
 * This is called from the renderer init system after GPU simulation is created.
 */
export const createCloudMeshResource = (
  cloudSphereSystem: ReturnType<typeof createCloudSphereSystem>,
) => {
  const cloudMesh = cloudSphereSystem.getMesh();
  if (cloudMesh) {
    setMesh(MeshEnum.CloudMesh, cloudMesh);
  }
};