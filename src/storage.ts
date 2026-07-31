import { resetWorld } from "bitecs";
import {
  createSnapshotSerializer,
  createSnapshotDeserializer,
} from "bitecs/serialization";
import * as THREE from "three";

import * as Components from "@/components/components";
import { type GameWorldContext } from "@/context";
import { getControls } from "@/renderer/resources/camera";
import { waterSimulation } from "@/renderer/systems/init/simulation";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
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

  // Convert ArrayBuffer to base64 for localStorage
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
 * Save ECS state and custom context to localStorage
 */
export const saveToWorldStorage = async (
  world: GameWorldContext,
  storageKey = "ecs-snapshot",
): Promise<void> => {
  logger.info(
    { storageKey },
    "[storage:save:start] Starting save to localStorage",
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

  logger.info(
    { ecsSize: serialized.ecs.length, contextSize: serialized.context.length },
    "[storage:save:store] Storing to localStorage",
  );

  // Store ECS state in localStorage (base64 encoded)
  localStorage.setItem(`${storageKey}-ecs`, serialized.ecs);

  // Store custom context in localStorage (JSON string)
  localStorage.setItem(`${storageKey}-context`, serialized.context);

  logger.info(
    { storageKey },
    "[storage:save:end] Save to localStorage complete",
  );
};

/**
 * Load ECS state and custom context from localStorage
 */
export const loadFromWorldStorage = async (
  world: GameWorldContext,
  storageKey = "ecs-snapshot",
): Promise<void> => {
  logger.info(
    { storageKey },
    "[storage:load:start] Starting load from localStorage",
  );

  const ecsSerialized = localStorage.getItem(`${storageKey}-ecs`);
  const contextSerialized = localStorage.getItem(`${storageKey}-context`);

  logger.info(
    { ecsFound: !!ecsSerialized, contextFound: !!contextSerialized },
    "[storage:load:retrieve] Retrieved from localStorage",
  );

  if (!ecsSerialized) {
    logger.info(
      "[storage:load:notfound] No saved ECS state found in localStorage",
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
      "[storage:load:context:missing] No context data found in localStorage",
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
  updateGPUSimulationUniforms(world);

  logger.info(
    { storageKey },
    "[storage:load:end] Load from localStorage complete",
  );
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
 * Clear ECS state and custom context from localStorage
 */
export const clearWorldStorage = (storageKey = "ecs-snapshot"): void => {
  logger.info({ storageKey }, "[storage:clear:start] Clearing localStorage");
  localStorage.removeItem(`${storageKey}-ecs`);
  localStorage.removeItem(`${storageKey}-context`);
  localStorage.removeItem(`${storageKey}-gameTime`);
  logger.info({ storageKey }, "[storage:clear:end] Storage cleared");
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
