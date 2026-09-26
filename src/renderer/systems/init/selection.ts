import {
  addComponent,
  hasComponent,
  query,
  removeComponent,
  type World,
} from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";
import type { MeshEnum } from "@/scene/resources/mesh";
import type { ResourceEnum } from "@/scene/resources/objectCache";

import {
  MeshRef,
  ObjectRef,
  Renderable,
  Selected,
} from "@/components/components";
import { resolveEntityMesh } from "@/scene/resources/meshInstances";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";

/**
 * Resolve the Three.js object that represents an entity, so it can be
 * raycast against.
 *
 * Entities are addressed either by `ObjectRef` (a cached object such as the
 * camera or sun light) or by `MeshRef` (a mesh from the cache, or a
 * per-entity instance for types like `Animal`). Returns `undefined` when the
 * entity has neither reference, or when the referenced resource is missing.
 */
const resolveEntityObject = (
  world: World,
  entity$: number,
): THREE.Object3D | undefined => {
  if (hasComponent(world, entity$, ObjectRef)) {
    return getObject(ObjectRef.ref[entity$] as ResourceEnum) as
      | THREE.Object3D
      | undefined;
  }

  if (hasComponent(world, entity$, MeshRef)) {
    return resolveEntityMesh(entity$, MeshRef.ref[entity$] as MeshEnum);
  }

  return undefined;
};

/**
 * Find which renderable entity sits under a normalized-device-coordinate
 * point, or -1 when the pointer is over nothing renderable. The nearest hit
 * wins, so an animal standing on the terrain is picked instead of the
 * terrain behind it. Hidden objects are skipped.
 */
const pickEntityAt = (world: World, ndc: THREE.Vector2): number => {
  const camera = getObject(GeneralObjectEnum.Camera) as THREE.Camera;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);

  let hitEntity$ = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entity$ of query(world, [Renderable])) {
    const object = resolveEntityObject(world, entity$);
    if (object === undefined || !object.visible) {
      continue;
    }

    const [hit] = raycaster.intersectObject(object, true);
    if (hit !== undefined && hit.distance < nearestDistance) {
      nearestDistance = hit.distance;
      hitEntity$ = entity$;
    }
  }

  return hitEntity$;
};

/**
 * Register right-click-to-select on the render canvas.
 *
 * Right-clicking a renderable entity tags it with `Selected` (clearing any
 * previous selection, since only one entity is selected at a time) and stores
 * its id in `world.selectedEntity$`, which the properties pane reads.
 * Right-clicking empty space clears the selection.
 */
export const selectionInitSystem: RendererInitSystem = (
  world,
  _scene,
  renderer,
) => {
  const canvas: HTMLElement = renderer.domElement;

  canvas.addEventListener("contextmenu", (event: MouseEvent) => {
    event.preventDefault();

    const ndc = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );

    const hitEntity$ = pickEntityAt(world, ndc);

    // Clear any previous selection so exactly one entity carries `Selected`.
    for (const entity$ of query(world, [Selected])) {
      if (entity$ !== hitEntity$) {
        removeComponent(world, entity$, Selected);
      }
    }

    if (hitEntity$ === -1) {
      world.selectedEntity$ = -1;
      return;
    }

    addComponent(world, hitEntity$, Selected);
    world.selectedEntity$ = hitEntity$;
  });
};
