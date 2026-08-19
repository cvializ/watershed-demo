import { addComponent, addEntity, type World } from "bitecs";

import { Animal, MeshRef, Name, Position, Renderable, Velocity } from "@/components/components";
import { MeshEnum } from "@/scene/resources/mesh";

/**
 * Creates an animal entity in the world.
 * Animals have a mesh reference, position, and are renderable.
 * 
 * @param world - The ECS world
 * @param x - X position in world space
 * @param y - Y position in world space  
 * @param z - Z position in world space
 * @returns The entity ID of the created animal
 */
export function createAnimal(
  world: World,
  x: number,
  y: number,
  z: number,
): number {
  const entity$ = addEntity(world);

  // Add Animal tag component
  addComponent(world, entity$, Animal);

  // Add Position component
  addComponent(world, entity$, Position);
  Position.x[entity$] = x;
  Position.y[entity$] = y;
  Position.z[entity$] = z;

  // Add Velocity component (initially zero)
  addComponent(world, entity$, Velocity);
  Velocity.x[entity$] = 0;
  Velocity.y[entity$] = 0;
  Velocity.z[entity$] = 0;

  // Add MeshRef component (using a simple sphere mesh for the animal)
  addComponent(world, entity$, MeshRef);
  MeshRef.ref[entity$] = MeshEnum.Animal;

  // Add Name component for debugging
  addComponent(world, entity$, Name);
  Name.value[entity$] = "Animal";

  // Add Renderable component to make it visible
  addComponent(world, entity$, Renderable);

  return entity$;
}