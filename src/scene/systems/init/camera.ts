import { observe, onAdd, onRemove, query } from "bitecs";
import { OrbitControls } from "three/examples/jsm/Addons.js";

import type { SceneInitSystem } from "@/scene/types";

import { Camera, MeshRef, Terrain } from "@/components/components";
import { createCameraResource } from "@/scene/resources/camera";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { getCamera } from "@/scene/sceneUtils";

let controls: OrbitControls | null = null;

export const getControls = () => controls;

export const updateControls = (dt: number) => controls?.update(dt);

export const cameraInitSystem: SceneInitSystem = (world, scene) => {
  observe(world, onAdd(Camera), () => {
    console.log("ON ADD CAMERA");

    const camera = createCameraResource();

    const [terrainEntity$] = query(world, [Terrain, MeshRef]);
    const terrain = getMesh(MeshRef.ref[terrainEntity$] as MeshEnum);
    camera.lookAt(terrain.position);

    // Create OrbitControls when camera is added (import already started at module load)
    // Get the renderer's domElement - it should be a child of the scene or in the document
    if (!controls) {
      controls = new OrbitControls(camera, document.getElementById("app"));
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 2.0;
      controls.target.set(0, 0, 0);
    }

    scene.add(camera);
  });

  observe(world, onRemove(Camera), () => {
    const camera = getCamera(scene);
    if (!camera) {
      return;
    }

    scene.remove(camera);

    // Clean up OrbitControls when camera is removed
    if (controls) {
      controls.disconnect();
      controls.dispose();
      controls = null;
    }
  });
};
