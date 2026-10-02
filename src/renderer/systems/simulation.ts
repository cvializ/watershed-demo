import type { ShaderMaterial } from "three";

import * as THREE from "three";

import type { RendererSystem } from "@/renderer/types";

import { cropGustTracker } from "@/renderer/resources/cropGusts";
import { getGameClock } from "@/renderer/resources/loop";
import { trackWind } from "@/renderer/resources/wind";
import {
  cloudSphereSystem,
  waterSimulation,
} from "@/renderer/systems/init/simulation";
import {
  getMaterial,
  MaterialEnum,
  type ReflectionVisualizationUniforms,
  type TestingVisualizationUniforms,
  type WaterVisualizationUniforms,
} from "@/scene/resources/material";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { getTexture, setTexture, TextureEnum } from "@/scene/resources/texture";
import { updateTerrainGeometryFromRenderTarget } from "@/scene/systems/updateTerrainGeometry";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

export const simulationSystem: RendererSystem = (
  world,
  scene,
  renderer,
  dt,
) => {
  // Skip updates when game is paused
  if (world.isPaused) {
    return;
  }

  if (!waterSimulation) {
    logger.warn("[simulation:skip] waterSimulation not initialized");
    return;
  }

  const clock = getGameClock();
  const gameTime = clock ? clock.getTime() : 0;

  logger.debug(
    { gameTime },
    "[simulation:gameTime] Current game time from clock",
  );

  const { showVelocity } = world;

  // Where the gusts over the crop stand: the wind the weather pane is riding,
  // drawn by the forecast rather than read off the sliders, so a wind changes
  // over the interval the pane sets instead of the moment the slider moves -
  // kept on the same three tracked values the clouds are kept on, so the crop
  // blows along the bearing that wind actually drives the sky down instead of
  // at an angle to it, and a change of wind carries a gust on from wherever the
  // old wind left it. Sampled once per pass so the water flow view and the
  // reflections view of a field wave in step.
  const wind = trackWind(world, gameTime);

  // The crop's gusts ride the wind the forecast drew - given to the tracker as
  // the wind aimed at (a drift in the cloud texture's frame, like the pane
  // sets it), which the tracker turns into the field's frame itself: the crop
  // is drawn in world xz, so the same wind has to be measured along the
  // bearing it actually drives the sky down - and the distance banked against
  // it keeps the march going from wherever the wind before it left it.
  const cropGusts = cropGustTracker.trail(
    { cloudWindX: wind.wind.x, cloudWindY: wind.wind.y },
    gameTime,
  );

  // Only update water/simulation uniforms for modes that use them
  const showsPollutants = world.visualizationMode === 7; // Water Quality: same material, substance overlay on top

  const usesWaterVisualization =
    world.visualizationMode === 4 || // Water Flow
    world.visualizationMode === 5 || // Water Flow (show velocity)
    showsPollutants; // Water Quality

  const material = getMaterial(MaterialEnum.WaterFlow) as ShaderMaterial;

  // Check if this is a testing simulation material
  const isTestingMaterial = world.visualizationMode === 6;

  // Reflections shows the same bodies of water with a mirror-like surface,
  // but on its own material so the water flow view stays untouched.
  const isReflectionsMaterial = world.visualizationMode === 8;

  if (isTestingMaterial) {
    logger.debug("[simulation:testing] Using TestingSimulation material");
    const testingMaterial = getMaterial(
      MaterialEnum.TestingSimulation,
    ) as ShaderMaterial;
    const uniform = getUniforms<TestingVisualizationUniforms>(testingMaterial);
    const testingTexture = waterSimulation.getTestingTexture();
    uniform.uTestingTexture.value = testingTexture;
  } else if (usesWaterVisualization) {
    // Update water visualization uniforms
    const uniforms = getUniforms<WaterVisualizationUniforms>(material);
    uniforms.uShowVelocity.value = showVelocity ? 1 : 0;
    // Written every pass this branch runs, so leaving Water Quality mode clears the overlay rather than leaving
    // a stale tint on the water flow view.
    uniforms.uShowPollutants.value = showsPollutants ? 1 : 0;
    uniforms.uPollutantSpecies.value = world.pollutantSpecies;
    // Advance the wind over the crop with the same logical clock the simulation runs on, so the
    // grain waves at the pace the game runs at rather than the wall clock's.
    uniforms.uTime.value = gameTime;
    // The gusts ride the wind the forecast drew for this interval - turned
    // into the field's frame and measured from the distance its previous winds
    // covered - so that wind is both the direction the gust train marches
    // along and the strength
    // it marches at, the march carries on across a wind change rather than
    // restarting from the clock, and a wind of nothing leaves the stand upright
    // and still.
    uniforms.uWind.value.set(cropGusts.wind.x, cropGusts.wind.y);
    uniforms.uGustDrift.value.set(
      cropGusts.bankedDrift.x,
      cropGusts.bankedDrift.y,
    );
    uniforms.uGustSetTime.value = cropGusts.windSetTime;
    uniforms.uLightPosition.value.x = world.sunPosition.x;
    uniforms.uLightPosition.value.y = world.sunPosition.y;
    uniforms.uLightPosition.value.z = world.sunPosition.z;
  }

  // Forward the erosion slider into the simulation's own API rather than writing a GPU uniform
  // directly, so the shader's parameter names stay private to the simulation (plan A16)
  waterSimulation.setSedimentErosionRate(world.erosionRate);

  // Forward repose angle and relax rate for terrain relaxation behavior
  waterSimulation.setTerrainReposeAngle(world.reposeAngle);
  waterSimulation.setTerrainRelaxRate(world.relaxRate);

  waterSimulation.compute(dt, gameTime);

  // Get dynamic height map (always needed for other materials)
  const dynamicHeightMap = waterSimulation.getDynamicHeightMapTexture();

  // Update mesh geometry from GPU height map (wireframe follows contours)
  // Access render target directly for reading
  const heightMapVariable = waterSimulation.getHeightMapVariable();
  const gpuCompute = waterSimulation.getGpuCompute();
  if (gpuCompute) {
    const heightRenderTarget =
      gpuCompute.getCurrentRenderTarget(heightMapVariable);
    // Re-apply the user-painted height field on top of the GPU heights every rebuild,
    // so keyboard (H/J) bumps survive the per-frame overwrite from the render target.
    updateTerrainGeometryFromRenderTarget(
      heightRenderTarget,
      renderer,
      waterSimulation.getTerrainHeightEditor(),
    );
  }

  // Update water visualization with dynamic height map (modified by sediment) and all simulation textures
  if (usesWaterVisualization) {
    setTexture(TextureEnum.HeightMap, dynamicHeightMap);

    const waterUniforms = getUniforms<WaterVisualizationUniforms>(material);
    waterUniforms.uHeightMap.value = dynamicHeightMap;
    // Update all simulation textures that were not available at material init time
    waterUniforms.uWaterHeightmap.value =
      waterSimulation.getSimulationTexture();
    waterUniforms.uCloudShadowMap.value =
      waterSimulation.getCloudShadowTexture();
    waterUniforms.uVelocityMap.value = waterSimulation.getVelocityTexture();
    waterUniforms.uPollutantMap.value = waterSimulation.getPollutantTexture();
    // The ground's share of the same substances, bound in the same pass so the shader can sample both behind one
    // flag rather than guarding two lifetimes separately.
    waterUniforms.uTerrainSubstanceMap.value =
      waterSimulation.getTerrainQualityTexture();

    // Update surface material map (shared texture used for both visualization and simulation)
    const surfaceMaterialTexture = getTexture(TextureEnum.SurfaceMaterialMap);
    if (surfaceMaterialTexture) {
      waterUniforms.uSurfaceMaterialMap.value = surfaceMaterialTexture;
    }
  }

  // Bind the same simulation textures on the Reflections material while that
  // view is active; the material is only ever displayed in mode 8.
  if (isReflectionsMaterial) {
    const reflectionsMaterial = getMaterial(
      MaterialEnum.Reflections,
    ) as ShaderMaterial;
    const uniforms =
      getUniforms<ReflectionVisualizationUniforms>(reflectionsMaterial);
    uniforms.uWaterHeightmap.value = waterSimulation.getSimulationTexture();
    uniforms.uCloudShadowMap.value = waterSimulation.getCloudShadowTexture();
    uniforms.uTime.value = gameTime;
    // Same tracked wind as the water flow view, so a crop field looks the same from
    // the water it grew on as it does from above it.
    uniforms.uWind.value.set(cropGusts.wind.x, cropGusts.wind.y);
    uniforms.uGustDrift.value.set(
      cropGusts.bankedDrift.x,
      cropGusts.bankedDrift.y,
    );
    uniforms.uGustSetTime.value = cropGusts.windSetTime;
    uniforms.uLightPosition.value.x = world.sunPosition.x;
    uniforms.uLightPosition.value.y = world.sunPosition.y;
    uniforms.uLightPosition.value.z = world.sunPosition.z;
    const surfaceMaterialTexture = getTexture(TextureEnum.SurfaceMaterialMap);
    if (surfaceMaterialTexture) {
      uniforms.uSurfaceMaterialMap.value = surfaceMaterialTexture;
    }
  }

  // Also update other materials that use the height map for displacement
  const heightVizMaterial = getMaterial(
    MaterialEnum.HeightVisualization,
  ) as ShaderMaterial;
  if (heightVizMaterial.uniforms.uHeightMap) {
    heightVizMaterial.uniforms.uHeightMap.value = dynamicHeightMap;
  }

  const slopeMaterial = getMaterial(MaterialEnum.Slope) as ShaderMaterial;
  if (slopeMaterial.uniforms.uHeightMap) {
    slopeMaterial.uniforms.uHeightMap.value = dynamicHeightMap;
  }

  // Update cloud spheres if available
  if (cloudSphereSystem) {
    const camera = scene.children.find(
      (c: THREE.Object3D) => (c as THREE.Camera).isCamera,
    ) as THREE.Camera;
    if (camera) {
      cloudSphereSystem.update(camera, dt);

      // Push weather color into the visualization shader
      cloudSphereSystem.setWeather({
        cloudColorR: world.cloudColorR,
        cloudColorG: world.cloudColorG,
        cloudColorB: world.cloudColorB,
      });

      // Add cloud sphere mesh to scene if not already added
      const cloudMesh = getMesh(MeshEnum.CloudMesh);

      // Check if mesh is already in scene by checking its parent
      if (!cloudMesh.parent) {
        logger.info("Adding volumetric clouds to scene");
        cloudMesh.name = "volumetric-clouds";
        scene.add(cloudMesh);
      }
    } else {
      logger.warn("Camera not found for clouds");
    }
  }

  // Push weather parameters into the cloud compute shader: the wind the
  // forecast has reached, not the wind the sliders point at, so the sky eases
  // round to wherever the pane last aimed it over the interval the pane set.
  if (waterSimulation) {
    waterSimulation.getClouds().setWeather(
      {
        cloudWindX: wind.wind.x,
        cloudWindY: wind.wind.y,
        cloudSpeed: world.cloudSpeed,
        cloudScale: world.cloudScale,
        cloudDensity: world.cloudDensity,
      },
      gameTime,
    );
  }
};
