import { createSnapshotSerializer, createSnapshotDeserializer } from "bitecs/serialization";

import type { GameWorld } from "@/types";

import * as Components from "@/components/components";
import { type GameWorldContext } from "@/context";
import { getCameraFromControls, getControls } from "@/renderer/systems/init/camera";
import { logger } from "@/utils/logger";

/**
 * Create a serializer for the ECS world
 */
const components = Object.values(Components).filter((v) => !(v instanceof Function));
let serializer: (selectedEntities?: readonly number[]) => ArrayBuffer | undefined;
let deserializer: (
  packet: ArrayBuffer,
  idMapOverride?: Map<number, number>,
) => Map<number, number> | undefined;

// TODO: create serializer and deserializer right after world is initialized.
// Initialize serializers on first use (after world is created)
export const initSerializers = (world: GameWorld) => {
  logger.info("[storage:serializer:init]");

  serializer = createSnapshotSerializer(world, components);
  deserializer = createSnapshotDeserializer(world, components);
};

/**
 * Serialize the ECS world state and custom context to strings
 */
const serializeWorld = (world: GameWorld): { ecs: string; context: string } => {
  logger.info("[serialize:start] Starting ECS world serialization");

  // Serialize ECS components to ArrayBuffer (no args = serialize all entities)
  const buffer = serializer();
  if (!buffer) {
    logger.error("[serialize:error] Serializer returned empty buffer");
    throw new Error("empty serializer");
  }

  const byteLength = buffer.byteLength;
  logger.info({ byteLength }, "[serialize:ecs-buffer] ECS serialization complete");

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
const deserializeWorld = (_world: GameWorld, base64String: string): void => {
  logger.info("[deserialize:start] Starting ECS world deserialization");

  if (!base64String) {
    logger.warn("[deserialize:skip] No base64 string provided, skipping deserialization");
    return;
  }

  logger.info({ base64Length: base64String.length }, "[deserialize:base64] Received base64 string");

  // Convert base64 to ArrayBuffer
  const buffer = base64ToArrayBuffer(base64String);
  logger.info({ byteLength: buffer.byteLength }, "[deserialize:buffer] Converted to ArrayBuffer");

  // Clear all existing entities before deserializing
  // This ensures we replace old component data with new serialized data
  // const entities$ = query(world, []);
  // for (const entity$ of entities$) {
  //   console.log("REMOVE");
  //   removeEntity(world, entity$);
  // }

  logger.info("[deserialize:apply] Calling deserializer...");
  // Deserialize into world - this creates new entities with serialized data
  const result = deserializer(buffer);
  const idMapSize = (result as Map<number, number> | undefined)
    ? (result as Map<number, number>).size
    : 0;
  logger.info({ idMapSize }, "[deserialize:end] ECS world deserialization complete");
};

/**
 * Save ECS state and custom context to localStorage
 */
export const saveToWorldStorage = (world: GameWorld, storageKey = "ecs-snapshot"): void => {
  logger.info({ storageKey }, "[storage:save:start] Starting save to localStorage");

  // Save current camera state to context before serialization
  const controls = getControls();
  if (controls) {
    world.cameraPosition.x = controls.object.position.x;
    world.cameraPosition.y = controls.object.position.y;
    world.cameraPosition.z = controls.object.position.z;
    world.cameraTarget.x = controls.target.x;
    world.cameraTarget.y = controls.target.y;
    world.cameraTarget.z = controls.target.z;
    const camera = getCameraFromControls();
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

  logger.info({ storageKey }, "[storage:save:end] Save to localStorage complete");
};

/**
 * Load ECS state and custom context from localStorage
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const loadFromWorldStorage = (world: GameWorld, storageKey = "ecs-snapshot"): void => {
  logger.info({ storageKey }, "[storage:load:start] Starting load from localStorage");

  const ecsSerialized = localStorage.getItem(`${storageKey}-ecs`);
  const contextSerialized = localStorage.getItem(`${storageKey}-context`);

  logger.info(
    { ecsFound: !!ecsSerialized, contextFound: !!contextSerialized },
    "[storage:load:retrieve] Retrieved from localStorage",
  );

  // TODO: What's different the second time this is called?

  if (!ecsSerialized) {
    logger.info("[storage:load:notfound] No saved ECS state found in localStorage");
    return;
  }

  // Deserialize custom context from JSON
  if (contextSerialized) {
    try {
      logger.info("[storage:load:context] Deserializing custom context...");
      const deserializedContext = JSON.parse(contextSerialized) as GameWorldContext;
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
    logger.warn("[storage:load:context:missing] No context data found in localStorage");
  }

  logger.info("[storage:load:ecs] Deserializing ECS world...");
  // Deserialize ECS world first (creates entities including Camera component)
  deserializeWorld(world, ecsSerialized);

  logger.info("[storage:load:camera] Restoring camera state...");
  // Restore camera state after deserialization
  const controls = getControls();
  if (controls) {
    // Camera should be available now since ECS world was just deserialized
    controls.object.position.set(
      world.cameraPosition.x,
      world.cameraPosition.y,
      world.cameraPosition.z,
    );
    controls.target.set(world.cameraTarget.x, world.cameraTarget.y, world.cameraTarget.z);
    const camera = getCameraFromControls();
    if (camera) {
      camera.zoom = world.cameraZoom;
      camera.updateProjectionMatrix();
    }
    controls.update();
  }

  logger.info({ storageKey }, "[storage:load:end] Load from localStorage complete");
};

/**
 * Clear ECS state and custom context from localStorage
 */
export const clearWorldStorage = (storageKey = "ecs-snapshot"): void => {
  logger.info({ storageKey }, "[storage:clear:start] Clearing localStorage");
  localStorage.removeItem(`${storageKey}-ecs`);
  localStorage.removeItem(`${storageKey}-context`);
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
  logger.debug({ base64Length: result.length }, "[base64:convert] Conversion complete");
  return result;
};

/**
 * Helper: Convert base64 to ArrayBuffer
 */
const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  logger.debug({ base64Length: base64.length }, "[base64:parse] Parsing base64 string");
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const result = bytes.buffer;
  logger.debug({ byteLength: result.byteLength }, "[base64:parse] Parsing complete");
  return result;
};
