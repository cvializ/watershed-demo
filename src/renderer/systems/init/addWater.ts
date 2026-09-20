import { query } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import { Terrain, MeshRef } from "@/components/components";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
import { logger } from "@/utils/logger";

import { waterSimulation } from "./simulation";

const SIM_SIZE = 512;
const terrainSize = 12;

// Shift-click lays down a substance source. Radius is in world units against a 12 unit terrain, and the amount
// is mass per pass at 60 fps (the shader scales it by dtScale), so these are tuned for "a plume shows up within
// a second" rather than for any measured spill.
const POLLUTANT_SOURCE_RADIUS = 0.8;
const POLLUTANT_SOURCE_AMOUNT = 0.15;

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

    // In the Water Quality view, shift-click lays down a substance instead of water: an emitter that keeps
    // releasing into whatever the terrain does next, so a plume draws the flow paths out over the landscape
    // rather than being one slug. Gated on that view because it is the only place the tool is advertised - and
    // because shift-drag is a camera shortcut elsewhere, where an invisible injection would be plain confusing.
    if (event.shiftKey && world.visualizationMode === 7) {
      waterSimulation.addPollutantSource(
        x,
        y,
        POLLUTANT_SOURCE_RADIUS,
        POLLUTANT_SOURCE_AMOUNT,
        world.pollutantSpecies,
      );
      return;
    }

    waterSimulation.addWater(x, y, 0.1, 3);
  });
};
