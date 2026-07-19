import { observe, onAdd, onRemove, query } from "bitecs";

import type { SceneInitSystem } from "@/scene/types";

import { Camera, MeshRef, Terrain } from "@/components/components";
import { createCameraResource } from "@/scene/resources/camera";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { getCamera } from "@/scene/sceneUtils";

// Lazy load OrbitControls at module level
const OrbitControlsPromise = import("three/examples/jsm/Addons.js").then((mod) => mod.OrbitControls);

export const cameraInitSystem: SceneInitSystem = (world, scene) => {
  let controls: any | null = null;

  observe(world, onAdd(Camera), () => {
    console.log("ON ADD CAMERA");

    const camera = createCameraResource();

    const [terrainEntity$] = query(world, [Terrain, MeshRef]);
    const terrain = getMesh(MeshRef.ref[terrainEntity$] as MeshEnum);
    camera.lookAt(terrain.position);

    scene.add(camera);

    // Create OrbitControls when camera is added (import already started at module load)
    OrbitControlsPromise.then((OrbitControls) => {
      // Get the renderer's domElement - it should be a child of the scene or in the document
      const app = document.getElementById("app");
      if (app) {
        const canvas = app.querySelector("canvas") as HTMLCanvasElement;
        if (canvas) {
          controls = new OrbitControls(camera, canvas);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;
          controls.autoRotate = true;
          controls.autoRotateSpeed = 2.0;
          controls.target.set(0, 0, 0);
        }
      }
    });
  });

  observe(world, onRemove(Camera), () => {
    console.log("ON REMOVE CAMERA");
    const camera = getCamera(scene);
    if (!camera) {
      return;
    }

    scene.remove(camera);

    // Clean up OrbitControls when camera is removed
    if (controls) {
      controls.dispose();
      controls = null;
    }
  });
};
