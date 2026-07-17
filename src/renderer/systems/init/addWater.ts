import { query } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import { Terrain, MeshRef } from "@/components/components";
import { getCamera, getMesh } from "@/scene/sceneUtils";

import { waterSimulation } from "./simulation";

const SIM_SIZE = 512;
const terrainSize = 12;

export const addWaterInitSystem: RendererInitSystem = (world, scene, renderer) => {
  const canvas: HTMLElement = renderer.domElement;

  canvas.addEventListener("click", (event) => {
    if (!waterSimulation) {
      return;
    }

    // Calculate mouse position in normalized device coordinates
    const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;

    const camera = getCamera(scene);
    const [terrainEid] = query(world, [Terrain, MeshRef]);
    const terrainMesh = getMesh(scene, MeshRef.ref[terrainEid]);

    if (!camera || !terrainMesh) {
      return;
    }

    // Create raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

    // Intersect with terrain (account for rotation)
    const terrainIntersects = raycaster.intersectObject(terrainMesh);

    if (terrainIntersects.length === 0) {
      return;
    }

    const intersect = terrainIntersects[0];
    const point = intersect.point;

    // Debug: log world coordinates
    console.log("World point:", { x: point.x, y: point.y, z: point.z });

    // Convert world coordinates to terrain-local coordinates for water simulation
    // Terrain is rotated -π/2 around X-axis:
    // - World X corresponds to terrain's width direction (original plane X)
    // - World Z corresponds to terrain's height direction (original plane Y, inverted)
    // The displacement texture maps: column→X (-6 to +6), row→Z (-6 to +6)

    // Map world coordinates to [0, terrainSize] for the water simulation
    const x = point.x + terrainSize / 2;
    const y = point.z + terrainSize / 2; // Removed the negative sign

    // Debug: log converted coordinates
    console.log("Converted terrain coords:", { x, y });

    // Debug: log texture texel coordinates
    const uvX = x / terrainSize;
    const uvY = y / terrainSize;
    const width = SIM_SIZE; // simulation grid size
    const texelX = Math.floor(uvX * width);
    const centerY = Math.floor((1.0 - uvY) * width); // Y is flipped for texture coordinates
    console.log("Texture texel coords:", { uvX, uvY, texelX, centerY });

    waterSimulation.addWater(x, y, 0.1, 3);
  });
};
