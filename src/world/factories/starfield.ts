import { addComponent, addEntity, type World } from "bitecs";

import { MeshRef, Name, Renderable } from "@/components/components";
import { MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

/**
 * Create a starfield entity.
 *
 * The starfield is a single shared point cloud that fills the sky behind the
 * scene. It has no `Position` component - its transform is driven every frame
 * by {@link starfieldSystem} so the plane stays aligned with the camera and
 * the sky stays populated under the orthographic camera.
 */
export const createStarfield = (world: World): number => {
  logger.info("[starfield:create]");

  const entity$ = addEntity(world);

  addComponent(world, entity$, MeshRef);
  MeshRef.ref[entity$] = MeshEnum.Starfield;

  addComponent(world, entity$, Renderable);

  addComponent(world, entity$, Name);
  Name.value[entity$] = "Starfield";

  return entity$;
};