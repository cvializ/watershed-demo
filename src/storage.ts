import { query, removeEntity } from "bitecs";
import { createSnapshotSerializer, createSnapshotDeserializer } from "bitecs/serialization";

import type { GameWorld } from "@/types";

import { Transform, Camera, Position, MeshRef, Velocity } from "@/components/components";
import { type GameWorldContext } from "@/context";

/**
 * Create a serializer for the ECS world
 */
const components = [Transform, Camera, Position, MeshRef, Velocity];
let serializer: (selectedEntities?: readonly number[]) => ArrayBuffer | undefined;
let deserializer: (
  packet: ArrayBuffer,
  idMapOverride?: Map<number, number>,
) => Map<number, number> | undefined;

// Initialize serializers on first use (after world is created)
const initSerializers = (world: GameWorld) => {
  if (!serializer || !deserializer) {
    serializer = createSnapshotSerializer(world, components);
    deserializer = createSnapshotDeserializer(world, components);
  }
};

/**
 * Serialize the ECS world state and custom context to strings
 */
const serializeWorld = (world: GameWorld): { ecs: string; context: string } => {
  initSerializers(world);

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
const deserializeWorld = (world: GameWorld, base64String: string): void => {
  if (!base64String) return;

  // Initialize deserializer if needed
  initSerializers(world);

  // Convert base64 to ArrayBuffer
  const buffer = base64ToArrayBuffer(base64String);

  // Clear all existing entities before deserializing
  // This ensures we replace old component data with new serialized data
  const allEntities = query(world, []);
  for (const entity$ of allEntities) {
    removeEntity(world, entity$);
  }

  // Deserialize into world - this creates new entities with serialized data
  deserializer(buffer);
};

/**
 * Save ECS state and custom context to localStorage
 */
export const saveToWorldStorage = (world: GameWorld, storageKey = "ecs-snapshot"): void => {
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
export const loadFromWorldStorage = (world: GameWorld, storageKey = "ecs-snapshot"): void => {
  const ecsSerialized = localStorage.getItem(`${storageKey}-ecs`);
  const contextSerialized = localStorage.getItem(`${storageKey}-context`);

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
      console.warn("Failed to deserialize custom context:", error);
    }
  }

  deserializeWorld(world, ecsSerialized);
  console.log("ECS state and custom context loaded from localStorage");
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
