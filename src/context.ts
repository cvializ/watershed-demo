import type { PollutantSpeciesId } from "@/gpu/waterFlowSimulation/variables/createGpuWaterQuality";
import type { SurfaceMaterialType } from "@/scene/resources/textures/surfaceMaterial";

export const createGameWorldContext = () => ({
  gameTime: 0,
  fps: 0,
  showVelocity: true, // Mode 4 (Water Flow) shows velocity by default; modes 5 and 7 hide it
  erosionRate: 0.01,
  reposeAngle: 60, // Degrees - angle of repose for granular relaxation
  relaxRate: 0.25, // Fraction of over-steepened drop relocated per pass
  lastVizMode: 4, // Default to Water Flow mode
  visualizationMode: 4, // Default to Water Flow mode
  sunAngle: 0,
  sunSpeed: 0.5, // Radians per second
  sunPosition: {
    x: 0,
    y: 0,
    z: 0,
  },
  cameraPosition: {
    x: 15,
    y: 12,
    z: 15,
  },
  cameraTarget: {
    x: 0,
    y: 0,
    z: 0,
  },
  cameraZoom: 2.5,
  // Pause state
  isPaused: false,
  // Terrain painting state
  terrainPaintingEnabled: false,
  terrainBrushMaterial: "bareDirt" as SurfaceMaterialType,
  terrainBrushRadius: 2.0,
  // Water quality state: which substance the Water Quality view (visualizationMode 7) shows
  pollutantSpecies: 0 as PollutantSpeciesId,
  // Entity currently right-clicked and shown in the inspector pane, or -1 for none.
  selectedEntity$: -1,
});

export const togglePause = (world: GameWorldContext): void => {
  world.isPaused = !world.isPaused;
};

/**
 * Set the visualization mode and update showVelocity accordingly.
 * This ensures that when a material is selected, its variable values are properly initialized.
 *
 * Mode 4 (Water Flow) - Shows velocity by default
 * Mode 5 (Water height) - Hides velocity, shows blue water
 * Mode 7 (Water Quality) - Hides velocity, shows blue water with substance overlay
 */
export const setVisualizationMode = (
  world: GameWorldContext,
  mode: number,
): void => {
  world.visualizationMode = mode;
  // Modes 5 and 7 hide velocity; all other modes show it
  world.showVelocity = mode !== 5 && mode !== 7;
};

export type GameWorldContext = ReturnType<typeof createGameWorldContext>;
