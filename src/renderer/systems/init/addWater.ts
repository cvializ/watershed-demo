import { query } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import { Terrain, MeshRef } from "@/components/components";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
import { getOrganicMatterDepositor } from "@/scene/resources/organicMatterDeposition";
import { logger } from "@/utils/logger";

import { waterSimulation } from "./simulation";

const SIM_SIZE = 512;
const terrainSize = 12;

// Shift-click drops organic matter like an animal pat. Same size and mass as the grazing system,
// so it reads as a single deposit that washes away rather than a persistent spring.
const ORGANIC_DEPOSIT_RADIUS = 0.8;
const ORGANIC_DEPOSIT_AMOUNT = 0.5;

export const addWaterInitSystem: RendererInitSystem = (
  world,
  _scene,
  renderer,
) => {
  const canvas: HTMLElement = renderer.domElement;

  canvas.addEventListener("click", (event) => {
    if (!waterSimulation) {
      return;
    }

    // Calculate mouse position in normalized device coordinates
    const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;

    const camera = getObject(
      GeneralObjectEnum.Camera,
    ) as THREE.OrthographicCamera;
    const [terrainEid] = query(world, [Terrain, MeshRef]);
    const terrainMesh = getMesh(MeshRef.ref[terrainEid] as MeshEnum);

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
    logger.debug({ x: point.x, y: point.y, z: point.z }, "World point");

    // Convert world coordinates to terrain-local coordinates for water simulation
    // Terrain is rotated -π/2 around X-axis:
    // - World X corresponds to terrain's width direction (original plane X)
    // - World Z corresponds to terrain's height direction (original plane Y, inverted)
    // The displacement texture maps: column→X (-6 to +6), row→Z (-6 to +6)

    // Map world coordinates to [0, terrainSize] for the water simulation
    const x = point.x + terrainSize / 2;
    const y = point.z + terrainSize / 2; // Removed the negative sign

    // Debug: log converted coordinates
    logger.debug({ x, y }, "Converted terrain coords");

    // Debug: log texture texel coordinates
    const uvX = x / terrainSize;
    const uvY = y / terrainSize;
    const width = SIM_SIZE; // simulation grid size
    const texelX = Math.floor(uvX * width);
    const centerY = Math.floor((1.0 - uvY) * width); // Y is flipped for texture coordinates
    logger.debug({ uvX, uvY, texelX, centerY }, "Texture texel coords");

    // In the Water Quality view, shift-click drops organic matter on the ground instead of adding water:
    // a single deposit with the same size and mass as an animal pat, so it washes away rather than
    // persisting as a source. Gated on that view because it is the only place the tool is advertised.
    if (event.shiftKey && world.visualizationMode === 7) {
      const depositor = getOrganicMatterDepositor();
      if (depositor) {
        depositor({
          x,
          y,
          radius: ORGANIC_DEPOSIT_RADIUS,
          amount: ORGANIC_DEPOSIT_AMOUNT,
        });
      }
      return;
    }

    waterSimulation.addWater(x, y, 0.1, 3);
  });
};
