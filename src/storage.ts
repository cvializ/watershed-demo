import { createSnapshotSerializer, createSnapshotDeserializer } from "bitecs/serialization";

import type { GameWorld } from "@/types";

import * as Components from "@/components/components";
import { type GameWorldContext } from "@/context";
import { getCameraFromControls, getControls } from "@/renderer/systems/init/camera";

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
  serializer = createSnapshotSerializer(world, components);
  deserializer = createSnapshotDeserializer(world, components);
};

/**
 * Serialize the ECS world state and custom context to strings
 */
const serializeWorld = (world: GameWorld): { ecs: string; context: string } => {
  // Serialize ECS components to ArrayBuffer (no args = serialize all entities)
  const buffer = serializer();
  if (!buffer) {
    throw new Error("empty serializer");
  }

  // Convert ArrayBuffer to base64 for localStorage
  const ecsSerialized = arrayBufferToBase64(buffer);

  // Serialize custom context to JSON string (world IS the context object)
  const contextSerialized = JSON.stringify(world);

  return { ecs: ecsSerialized, context: contextSerialized };
};

/**
 * Deserialize ECS state from base64 string and apply to world
 */
const deserializeWorld = (_world: GameWorld, base64String: string): void => {
  if (!base64String) return;

  // Convert base64 to ArrayBuffer
  const buffer = base64ToArrayBuffer(base64String);

  // Clear all existing entities before deserializing
  // This ensures we replace old component data with new serialized data
  // const entities$ = query(world, []);
  // for (const entity$ of entities$) {
  //   console.log("REMOVE");
  //   removeEntity(world, entity$);
  // }

  // Deserialize into world - this creates new entities with serialized data
  deserializer(buffer);
};

/**
 * Save ECS state and custom context to localStorage
 */
export const saveToWorldStorage = (world: GameWorld, storageKey = "ecs-snapshot"): void => {
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

  const serialized = serializeWorld(world);
  if (!serialized.ecs) {
    console.log("ECS serialization empty");
  }

  // Store ECS state in localStorage (base64 encoded)
  localStorage.setItem(`${storageKey}-ecs`, serialized.ecs);

  // Store custom context in localStorage (JSON string)
  localStorage.setItem(`${storageKey}-context`, serialized.context);
  console.log("ECS state and custom context saved to localStorage");
};

/**
 * Load ECS state and custom context from localStorage
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const loadFromWorldStorage = (world: GameWorld, storageKey = "ecs-snapshot"): void => {
  const ecsSerialized = localStorage.getItem(`${storageKey}-ecs`);
  const contextSerialized = localStorage.getItem(`${storageKey}-context`);

  // TODO: What's different the second time this is called?

  if (!ecsSerialized) {
    console.log("No saved ECS state found in localStorage");
    return;
  }

  // Deserialize custom context from JSON
  if (contextSerialized) {
    try {
      const deserializedContext = JSON.parse(contextSerialized) as GameWorldContext;
      // Merge with existing context to preserve any runtime properties
      Object.assign(world, deserializedContext);
    } catch (error) {
      console.error("Failed to deserialize custom context:", error);
    }
  }

  // Deserialize ECS world first (creates entities including Camera component)
  deserializeWorld(world, ecsSerialized);
  console.log("ECS state loaded from localStorage");

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
  console.log("ECS state and custom context loaded from localStorage");
};

/**
 * Clear ECS state and custom context from localStorage
 */
export const clearWorldStorage = (storageKey = "ecs-snapshot"): void => {
  localStorage.removeItem(`${storageKey}-ecs`);
  localStorage.removeItem(`${storageKey}-context`);
  console.log(`Storage cleared for key: ${storageKey}`);
};

/**
 * Helper: Convert ArrayBuffer to base64
 */
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Helper: Convert base64 to ArrayBuffer
 */
const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};
