import { type World, query, removeEntity } from "bitecs";
import { createSnapshotSerializer, createSnapshotDeserializer } from "bitecs/serialization";

import { Transform, Camera, Position, MeshRef, Velocity } from "@/components/components";

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
const initSerializers = (world: World) => {
  if (!serializer || !deserializer) {
    serializer = createSnapshotSerializer(world, components);
    deserializer = createSnapshotDeserializer(world, components);
  }
};

/**
 * Serialize the ECS world state to a base64 string
 */
const serializeWorld = (world: World): string => {
  initSerializers(world);

  // Serialize to ArrayBuffer (no args = serialize all entities)
  const buffer = serializer();
  if (!buffer) {
    throw new Error("empty serializer");
  }

  // Convert ArrayBuffer to base64 for localStorage
  return arrayBufferToBase64(buffer);
};

/**
 * Deserialize ECS state from base64 string and apply to world
 */
const deserializeWorld = (world: World, base64String: string): void => {
  if (!base64String) return;

  // Initialize deserializer if needed
  initSerializers(world);

  // Convert base64 to ArrayBuffer
  const buffer = base64ToArrayBuffer(base64String);

  // Clear all existing entities before deserializing
  // This ensures we replace old component data with new serialized data
  const allEntities = query(world, []);
  for (const eid of allEntities) {
    removeEntity(world, eid);
  }

  // Deserialize into world - this creates new entities with serialized data
  deserializer(buffer);
};

/**
 * Save ECS state to localStorage
 */
export const saveToWorldStorage = (world: World, storageKey = "ecs-snapshot"): void => {
  const serialized = serializeWorld(world);
  if (!serialized) {
    console.log("Serialization empty");
  }

  localStorage.setItem(storageKey, serialized);
  console.log("ECS state saved to localStorage");
};

/**
 * Load ECS state from localStorage
 */
export const loadFromWorldStorage = (world: World, storageKey = "ecs-snapshot"): void => {
  const serialized = localStorage.getItem(storageKey);
  if (!serialized) {
    console.log("No saved ECS state found in localStorage");
    return;
  }

  deserializeWorld(world, serialized);
  console.log("ECS state loaded from localStorage");
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
