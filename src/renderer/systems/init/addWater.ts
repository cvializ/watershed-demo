import { query } from "bitecs";
import * as THREE from "three";

import type { PollutantSpeciesId } from "@/gpu/waterFlowSimulation/variables/createGpuWaterQuality";
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

// Shift-click releases whatever substance the Water Quality view has selected. Organic matter keeps the animal-pat
// law: same size and mass as the grazing system, so a click reads as one deposit that washes away rather than as a
// spring that never stops.
const ORGANIC_DEPOSIT_RADIUS = 0.8;
const ORGANIC_DEPOSIT_AMOUNT = 0.5;

// The other three species have no route onto the ground, so they are released as a spring into the film over the
// clicked cell - a soft disc that keeps releasing every pass until "Clear sources" runs, which is what makes a
// plume worth watching. Sized so the source texel clears the visualiser's 0.35 half-saturation within a couple of
// seconds while the rest of the disc carries a visible plume downstream; not calibrated to anything.
const SOURCE_RADIUS = 1.0;
const SOURCE_AMOUNT = 0.2;

// Organic matter is the one species dropped on the land rather than into the water, since the ground is where it
// comes from (see POLLUTANT_SPECIES and createGpuTerrainQuality.addOrganicDeposit). Everything else only ever
// arrives through a spring, so the species chosen in the view decides which of the two tools a click is.
const SPECIES_ORGANIC_MATTER: PollutantSpeciesId = 1;

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

    // In the Water Quality view, shift-click releases the selected substance: organic matter on the ground, since
    // that is the only route that species has onto land, and everything else as a spring into the film above the
    // clicked cell. Gated on that view because it is the only place the tool is advertised - and it used to drop
    // organic matter whatever the dropdown said, which is why a Bacteria or Nitrogen view had nothing to show.
    if (event.shiftKey && world.visualizationMode === 7) {
      const species = world.pollutantSpecies;

      if (species === SPECIES_ORGANIC_MATTER) {
        const depositOrganicMatter = getOrganicMatterDepositor();
        if (depositOrganicMatter) {
          depositOrganicMatter({
            x,
            y,
            radius: ORGANIC_DEPOSIT_RADIUS,
            amount: ORGANIC_DEPOSIT_AMOUNT,
          });
        } else {
          logger.warn(
            { x, y, species },
            "No organic matter depositor yet: this click drops nothing",
          );
        }

        return;
      }

      // A spring, not a dose: the slots stay registered until cleared, so a farm patch or a septic outflow keeps
      // feeding a plume and a clicking visitor can fill the catchment with eight clicks and no more.
      const sourceAdded = waterSimulation.addPollutantSource(
        x,
        y,
        SOURCE_RADIUS,
        SOURCE_AMOUNT,
        species,
      );
      if (!sourceAdded) {
        logger.warn(
          { x, y, species },
          "All source slots are busy: this click releases nothing",
        );
      }

      return;
    }

    waterSimulation.addWater(x, y, 0.1, 3);
  });
};
