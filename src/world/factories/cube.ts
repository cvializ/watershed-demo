import { addEntity, addComponent, type World } from "bitecs";

import { Cube, MeshRef, Rotate, Transform } from "@/components/components";

export function createCube(world: World, x: number, y: number, z: number): number {
  const eid = addEntity(world);

  addComponent(world, eid, Cube);
  addComponent(world, eid, Rotate);
  addComponent(world, eid, Transform);
  addComponent(world, eid, MeshRef); // configured in sceneInitSystem

  Transform.x[eid] = x;
  Transform.y[eid] = y;
  Transform.z[eid] = z;
  Transform.rx[eid] = 0;
  Transform.ry[eid] = 0;
  Transform.rz[eid] = 0;

  return eid;
}
