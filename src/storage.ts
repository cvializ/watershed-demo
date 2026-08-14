import { resetWorld } from "bitecs";
import {
  createSnapshotSerializer,
  createSnapshotDeserializer,
} from "bitecs/serialization";
import * as THREE from "three";

import * as Components from "@/components/components";
import { type GameWorldContext } from "@/context";
import { getControls } from "@/renderer/resources/camera";
import { getRenderer } from "@/renderer/resources/renderer";
import { waterSimulation } from "@/renderer/systems/init/simulation";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
import { getTerrainStateManager } from "@/terrain/TerrainStateManager";
import {
  type GPUSimulationState,
  restoreGPUSimulationState,
  saveGPUSimulationState,
} from "@/gpu/waterFlowSimulation/saveLoadSimulationState";
import { logger } from "@/utils/logger";

/**
 * Create a serializer for the ECS world
 */
const components = Object.values(Components).filter(
  (v) => !(v instanceof Function),
);
let serializer: (
  selectedEntities?: readonly number[],
) => ArrayBuffer | undefined;

// TODO: create serializer and deserializer right after world is initialized.
// Initialize serializers on first use (after world is created)
export const initSerializers = (world: GameWorldContext) => {
  logger.info("[storage:serializer:init]");

  serializer = createSnapshotSerializer(world, components);
};

/** Create a fresh deserializer for deserialization */
const createFreshDeserializer = (world: GameWorldContext) => {
  logger.info("[storage:deserializer:refresh]");
  return createSnapshotDeserializer(world, components);
};

/**
 * Serialize the ECS world state and custom context to strings
 */
const serializeWorld = (
  world: GameWorldContext,
): { ecs: string; context: string } => {
  logger.info("[serialize:start] Starting ECS world serialization");

  // Serialize ECS components to ArrayBuffer (no args = serialize all entities)
  const buffer = serializer();
  if (!buffer) {
    logger.error("[serialize:error] Serializer returned empty buffer");
    throw new Error("empty serializer");
  }

  const byteLength = buffer.byteLength;
  logger.info(
    { byteLength },
    "[serialize:ecs-buffer] ECS serialization complete",
  );

  // Convert ArrayBuffer to base64 for in-memory storage
  const ecsSerialized = arrayBufferToBase64(buffer);
  logger.info(
    { base64Length: ecsSerialized.length },
    "[serialize:base64] Converted to base64 string",
  );

  // Serialize custom context to JSON string (world IS the context object)
  const contextSerialized = JSON.stringify(world);
  logger.info(
    { contextLength: contextSerialized.length },
    "[serialize:context] Custom context serialization complete",
  );

  logger.info("[serialize:end] ECS world serialization finished");

  return { ecs: ecsSerialized, context: contextSerialized };
};

/**
 * Deserialize ECS state from base64 string and apply to world
 */
const deserializeWorld = (
  world: GameWorldContext,
  base64String: string,
): void => {
  logger.info("[deserialize:start] Starting ECS world deserialization");

  if (!base64String) {
    logger.warn(
      "[deserialize:skip] No base64 string provided, skipping deserialization",
    );
    return;
  }

  logger.info("[deserialize:base64] Received base64 string");

  // Convert base64 to ArrayBuffer
  const buffer = base64ToArrayBuffer(base64String);
  logger.info("[deserialize:buffer] Converted to ArrayBuffer");

  // Create fresh deserializer after resetWorld to ensure component registration is correct.
  // The original deserializer might have captured stale state from before reset.
  const freshDeserializer = createFreshDeserializer(world);

  // Reset world before deserializing to prevent entity ID recycling issues across save/load cycles.
  resetWorld(world);

  logger.info("[deserialize:apply] Calling deserializer...");
  // Deserialize into world - this creates new entities with serialized data
  const result = freshDeserializer(buffer); // mutates world
  const idMapSize = (result as Map<number, number> | undefined)
    ? (result as Map<number, number>).size
    : 0;
  logger.info(
    { idMapSize },
    "[deserialize:end] ECS world deserialization complete",
  );
};

/**
 * In-memory storage for game state
 */
type GameStorage = {
  ecs: string;
  context: string;
  terrain?: string; // Optional terrain geometry checkpoint
  gpuSimulation?: string; // Optional GPU simulation state
};

const inMemoryStorage = new Map<string, GameStorage>();

/**
 * Save ECS state and custom context to in-memory storage
 */
export const saveToWorldStorage = async (
  world: GameWorldContext,
  storageKey = "ecs-snapshot",
): Promise<void> => {
  const renderer = getRenderer();
  if (!renderer) {
    logger.warn(
      "[storage:save:error] Renderer not available for GPU state saving",
    );
  }
  logger.info(
    { storageKey },
    "[storage:save:start] Starting save to in-memory storage",
  );

  // Save current camera state to context before serialization
  const controls = getControls();
  if (controls) {
    world.cameraPosition.x = controls.object.position.x;
    world.cameraPosition.y = controls.object.position.y;
    world.cameraPosition.z = controls.object.position.z;
    world.cameraTarget.x = controls.target.x;
    world.cameraTarget.y = controls.target.y;
    world.cameraTarget.z = controls.target.z;
    const camera = getObject(
      GeneralObjectEnum.Camera,
    ) as THREE.OrthographicCamera;
    if (camera) {
      world.cameraZoom = camera.zoom;
    }
  }

  logger.info("[storage:save:serialize] Serializing world...");
  const serialized = serializeWorld(world);
  if (!serialized.ecs) {
    logger.warn("[storage:save:warn] ECS serialization empty");
  }

  // Save terrain geometry state if available
  const terrainStateManager = getTerrainStateManager();
  let terrainCheckpoint: string | null = null;
  if (terrainStateManager) {
    const checkpointState = terrainStateManager.createCheckpoint();
    if (checkpointState) {
      // Log first few position values for debugging
      const samplePositions = Array.from(checkpointState.positions.slice(0, 9));
      logger.info(
        { samplePositions },
        "[storage:save:terrain] Saved terrain geometry checkpoint (first 9 position values)",
      );
      // Store checkpoint state as JSON for persistence
      terrainCheckpoint = JSON.stringify({
        positions: Array.from(checkpointState.positions),
        uv: checkpointState.uv ? Array.from(checkpointState.uv) : null,
      });
    }
  }

  // Save GPU simulation state if available
  let gpuSimulationState: string | null = null;
  if (waterSimulation && renderer) {
    const heightMapVariable = waterSimulation.getHeightMapVariable();
    const gpuCompute = waterSimulation.getGpuCompute();
    if (gpuCompute) {
      const gpuState = saveGPUSimulationState(
        heightMapVariable,
        gpuCompute,
        renderer,
      );
      if (gpuState && gpuState.heightMapData) {
        // Store GPU state as JSON for persistence
        gpuSimulationState = JSON.stringify({
          heightMapData: Array.from(gpuState.heightMapData),
          width: gpuState.width,
          height: gpuState.height,
        });
        logger.info(
          { dataSize: gpuState.heightMapData.length },
          "[storage:save:gpu] Saved GPU simulation height map state",
        );
      }
    }
  }

  logger.info(
    { ecsSize: serialized.ecs.length, contextSize: serialized.context.length },
    "[storage:save:store] Storing to in-memory storage",
  );

  // Store in memory with terrain checkpoint and GPU state if available
  const storageData: GameStorage & { terrain?: string; gpuSimulation?: string } = {
    ecs: serialized.ecs,
    context: serialized.context,
  };
  if (terrainCheckpoint) {
    storageData.terrain = terrainCheckpoint;
  }
  if (gpuSimulationState) {
    storageData.gpuSimulation = gpuSimulationState;
  }

  inMemoryStorage.set(storageKey, storageData as GameStorage);

  logger.info(
    { storageKey },
    "[storage:save:end] Save to in-memory storage complete",
  );
};

/**
 * Load ECS state and custom context from in-memory storage
 */
export const loadFromWorldStorage = async (
  world: GameWorldContext,
  storageKey = "ecs-snapshot",
): Promise<void> => {
  logger.info(
    { storageKey },
    "[storage:load:start] Starting load from in-memory storage",
  );

  const stored = inMemoryStorage.get(storageKey);

  if (!stored) {
    logger.info(
      "[storage:load:notfound] No saved ECS state found in in-memory storage",
    );
    return;
  }

  const { ecs: ecsSerialized, context: contextSerialized, terrain: terrainCheckpoint, gpuSimulation: gpuSimulationState } = stored;

  logger.info(
    { ecsFound: !!ecsSerialized, contextFound: !!contextSerialized },
    "[storage:load:retrieve] Retrieved from in-memory storage",
  );

  if (!ecsSerialized) {
    logger.info(
      "[storage:load:notfound] No saved ECS state found in in-memory storage",
    );
    return;
  }

  // Deserialize custom context from JSON
  if (contextSerialized) {
    try {
      logger.info("[storage:load:context] Deserializing custom context...");
      const deserializedContext = JSON.parse(
        contextSerialized,
      ) as GameWorldContext;
      // Merge with existing context to preserve any runtime properties
      Object.assign(world, deserializedContext);
      logger.info("[storage:load:context] Custom context loaded successfully");
    } catch (error) {
      logger.error(
        { err: error, storageKey },
        "[storage:load:context:error] Failed to deserialize custom context",
      );
    }
  } else {
    logger.warn(
      "[storage:load:context:missing] No context data found in in-memory storage",
    );
  }

  logger.info("[storage:load:ecs] Deserializing ECS world...");
  deserializeWorld(world, ecsSerialized);

  logger.info("[storage:load:camera] Restoring camera state...");

  // Restore camera state after deserialization
  const controls = getControls();
  if (controls) {
    controls.object.position.set(
      world.cameraPosition.x,
      world.cameraPosition.y,
      world.cameraPosition.z,
    );
    controls.target.set(
      world.cameraTarget.x,
      world.cameraTarget.y,
      world.cameraTarget.z,
    );
    const camera = getObject(
      GeneralObjectEnum.Camera,
    ) as THREE.OrthographicCamera;
    if (camera) {
      camera.zoom = world.cameraZoom;
      camera.updateProjectionMatrix();
    }
    controls.update();
  }

  // Restore terrain geometry state from checkpoint if available
  const terrainStateManager = getTerrainStateManager();
  logger.info(
    { hasTerrainManager: !!terrainStateManager, hasCheckpoint: !!terrainCheckpoint },
    "[storage:load:terrain] Checking terrain state restoration",
  );
  if (terrainStateManager && terrainCheckpoint) {
    try {
      const checkpointData = JSON.parse(terrainCheckpoint);
      const terrainState = {
        positions: new Float32Array(checkpointData.positions),
        uv: checkpointData.uv ? new Float32Array(checkpointData.uv) : undefined,
      };
      // Log first few values being restored
      const sampleRestored = Array.from(terrainState.positions.slice(0, 9));
      logger.info(
        { sampleRestored },
        "[storage:load:terrain] Restoring terrain from checkpoint (first 9 position values)",
      );
      terrainStateManager.restore(terrainState);
      logger.info(
        "[storage:load:terrain] Terrain geometry restoration complete",
      );
    } catch (error) {
      logger.error(
        { error, terrainCheckpointLength: terrainCheckpoint.length },
        "[storage:load:terrain:error] Failed to restore terrain checkpoint",
      );
    }
  } else {
    logger.warn(
      { hasTerrainManager: !!terrainStateManager, hasCheckpoint: !!terrainCheckpoint },
      "[storage:load:terrain] Skipping terrain restoration - missing manager or checkpoint",
    );
  }

  // Restore GPU simulation state from checkpoint if available
  logger.info(
    { hasGPUState: !!gpuSimulationState },
    "[storage:load:gpu] Checking GPU simulation state restoration",
  );
  if (waterSimulation && gpuSimulationState) {
    try {
      const gpuData = JSON.parse(gpuSimulationState);
      const gpuState: GPUSimulationState = {
        heightMapData: new Float32Array(gpuData.heightMapData),
        width: gpuData.width,
        height: gpuData.height,
      };
      // Log first few values being restored
      if (gpuState.heightMapData) {
        const sampleRestored = Array.from(gpuState.heightMapData.slice(0, 9));
        logger.info(
          { sampleRestored },
          "[storage:load:gpu] Restoring GPU simulation height map (first 9 values)",
        );
      }
      const heightMapVariable = waterSimulation.getHeightMapVariable();
      if (heightMapVariable) {
        const restored = restoreGPUSimulationState(
          heightMapVariable,
          gpuState,
        );
        logger.info(
          { restored },
          "[storage:load:gpu] GPU restoration result",
        );
        if (restored) {
          logger.info(
            "[storage:load:gpu] GPU simulation state restoration complete",
          );
        } else {
          logger.warn(
            "[storage:load:gpu:warn] GPU simulation state restoration failed (non-fatal)",
          );
        }
      } else {
        logger.error(
          "[storage:load:gpu:error] GPU compute not available for restoration",
        );
      }
    } catch (error) {
      logger.error(
        { error, gpuSimulationStateLength: gpuSimulationState.length },
        "[storage:load:gpu:error] Failed to restore GPU simulation checkpoint",
      );
    }
  } else {
    logger.warn(
      { hasWaterSimulation: !!waterSimulation, hasGPUState: !!gpuSimulationState },
      "[storage:load:gpu] Skipping GPU restoration - missing simulation or checkpoint",
    );
  }
  updateGPUSimulationUniforms(world);

  logger.info(
    { storageKey },
    "[storage:load:end] Load from in-memory storage complete (simulation paused to preserve restored state)",
  );

  // Pause the simulation to prevent it from overwriting restored state
  world.isPaused = true;
};

/**
 * Update GPU simulation uniforms with the current gameTime.
 * This ensures that after loading, the GPU simulation shows the correct frame
 * even if the simulation is paused.
 *
 * Unlike compute(), this function only updates uniforms without running GPU computation,
 * so it doesn't advance the simulation state.
 */
const updateGPUSimulationUniforms = (world: GameWorldContext): void => {
  if (!waterSimulation) {
    logger.warn(
      "[storage:updateGPUSimulationUniforms] waterSimulation not initialized",
    );
    return;
  }

  waterSimulation.compute(0, world.gameTime);
};

/**
 * Clear ECS state and custom context from in-memory storage
 */
export const clearWorldStorage = (storageKey = "ecs-snapshot"): void => {
  logger.info({ storageKey }, "[storage:clear:start] Clearing in-memory storage");
  inMemoryStorage.delete(storageKey);
  logger.info({ storageKey }, "[storage:clear:end] Storage cleared");
};

/**
 * Export storage state to a JSON-serializable object for file saving
 */
export const exportStorageToFile = (
  storageKey = "ecs-snapshot",
): GameStorage | undefined => {
  logger.info(
    { storageKey },
    "[storage:export:start] Exporting storage to serializable format",
  );

  const stored = inMemoryStorage.get(storageKey);
  if (!stored) {
    logger.warn(
      { storageKey },
      "[storage:export:error] No data found for storage key",
    );
    return undefined;
  }

  logger.info(
    { storageKey },
    "[storage:export:end] Storage exported successfully",
  );
  return stored;
};

/**
 * Import storage state from a JSON-serializable object (e.g., loaded from file)
 */
export const importStorageFromFile = (
  data: GameStorage,
  storageKey = "ecs-snapshot",
): void => {
  logger.info(
    { storageKey },
    "[storage:import:start] Importing storage from serializable format",
  );

  if (!data.ecs || !data.context) {
    logger.error(
      { storageKey },
      "[storage:import:error] Invalid data format - missing ecs or context",
    );
    throw new Error("Invalid import data: missing ecs or context");
  }

  inMemoryStorage.set(storageKey, data);

  logger.info(
    { storageKey },
    "[storage:import:end] Storage imported successfully",
  );
};

/**
 * Get all storage keys
 */
export const getStorageKeys = (): string[] => {
  return Array.from(inMemoryStorage.keys());
};

/**
 * Check if storage has data for a given key
 */
export const hasStorage = (storageKey = "ecs-snapshot"): boolean => {
  return inMemoryStorage.has(storageKey);
};

/**
 * Get storage as a JSON string for saving to file
 * Example output: '{"ecs":"base64data...","context":"{}"}'
 */
export const getStorageAsJSON = (
  storageKey = "ecs-snapshot",
): string | undefined => {
  const stored = inMemoryStorage.get(storageKey);
  if (!stored) {
    return undefined;
  }
  return JSON.stringify(stored, null, 2);
};

/**
 * Load storage from a JSON string (e.g., loaded from file)
 */
export const loadStorageFromJSON = (
  jsonString: string,
  storageKey = "ecs-snapshot",
): void => {
  try {
    const data = JSON.parse(jsonString) as GameStorage;
    importStorageFromFile(data, storageKey);
  } catch (error) {
    logger.error(
      { error },
      "[storage:loadFromJSON:error] Failed to parse JSON",
    );
    throw new Error("Invalid JSON format for game storage");
  }
};

/**
 * Helper: Convert ArrayBuffer to base64
 */
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  logger.debug(
    { byteLength: buffer.byteLength },
    "[base64:convert] Converting ArrayBuffer to base64",
  );
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const result = btoa(binary);
  logger.debug(
    { base64Length: result.length },
    "[base64:convert] Conversion complete",
  );
  return result;
};

/**
 * Helper: Convert base64 to ArrayBuffer
 */
const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  logger.debug(
    { base64Length: base64.length },
    "[base64:parse] Parsing base64 string",
  );
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const result = bytes.buffer;
  logger.debug(
    { byteLength: result.byteLength },
    "[base64:parse] Parsing complete",
  );
  return result;
};
