import { expect, test } from "@playwright/test";
import { createWorld } from "bitecs";
import { query } from "bitecs";
import { Animal, Position, Velocity } from "src/components/components";
import { createGameWorldContext } from "src/context";
import { setSurfaceMaterialTexture } from "src/scene/resources/surfaceMaterialTexture";
import { createSurfaceMaterialTexture } from "src/scene/resources/textures/surfaceMaterial";
import { animalSystem } from "src/scene/systems/animal";
import { addAnimal } from "src/world/factories/addAnimal";
import { createAnimal } from "src/world/factories/animal";
import * as THREE from "three";

test.describe("Animal", () => {
  test("should create an animal entity with required components", () => {
    const world = createWorld();

    const animal$ = createAnimal(world, 0, 0.5, 0);

    // Check that the entity exists
    expect(animal$).toBeGreaterThan(0);

    // Check that Animal tag component is present
    const animals = query(world, [Animal]);
    expect(animals).toContain(animal$);
  });

  test("should create animal at specified position", () => {
    const world = createWorld();

    const x = 3.5;
    const y = 0.8;
    const z = -2.1;

    const animal$ = createAnimal(world, x, y, z);

    // Verify position is set correctly - access Position arrays directly from component
    expect(Position.x[animal$]).toBeCloseTo(x, 5);
    expect(Position.y[animal$]).toBeCloseTo(y, 5);
    expect(Position.z[animal$]).toBeCloseTo(z, 5);
  });

  test("should add animal with default random position", () => {
    const world = createWorld();

    const animal$ = addAnimal(world);

    // Animal should be created within terrain bounds (-6 to 6)
    expect(Position.x[animal$]).toBeGreaterThanOrEqual(-6);
    expect(Position.x[animal$]).toBeLessThanOrEqual(6);
    expect(Position.z[animal$]).toBeGreaterThanOrEqual(-6);
    expect(Position.z[animal$]).toBeLessThanOrEqual(6);
  });

  test("should add animal with custom position options", () => {
    const world = createWorld();

    const animal$ = addAnimal(world, { x: 2.0, y: 1.0, z: -3.0 });

    expect(Position.x[animal$]).toBeCloseTo(2.0, 5);
    expect(Position.y[animal$]).toBeCloseTo(1.0, 5);
    expect(Position.z[animal$]).toBeCloseTo(-3.0, 5);
  });

  test("should support multiple animals", () => {
    const world = createWorld();

    const animal1$ = addAnimal(world, { x: -3.0, y: 0.5, z: -3.0 });
    const animal2$ = addAnimal(world, { x: 3.0, y: 0.5, z: 3.0 });
    const animal3$ = addAnimal(world, { x: 0.0, y: 0.5, z: 0.0 });

    const animals = query(world, [Animal]);
    expect(animals.length).toBe(3);
    expect(animals).toContain(animal1$);
    expect(animals).toContain(animal2$);
    expect(animals).toContain(animal3$);
  });

  test("should create animal with Velocity component", () => {
    const world = createWorld();

    const animal$ = createAnimal(world, 0, 0.5, 0);

    // Check that Velocity component is present and initialized to zero
    expect(Velocity.x[animal$]).toBe(0);
    expect(Velocity.y[animal$]).toBe(0);
    expect(Velocity.z[animal$]).toBe(0);
  });

  test("should query animals with Position and Velocity", () => {
    const world = createWorld();

    const animal1$ = addAnimal(world, { x: 2.0, y: 0.5, z: 2.0 });
    const animal2$ = addAnimal(world, { x: -2.0, y: 0.5, z: -2.0 });

    // Query animals with both Position and Velocity components
    const animals = query(world, [Animal, Position, Velocity]);
    expect(animals.length).toBe(2);
    expect(animals).toContain(animal1$);
    expect(animals).toContain(animal2$);
  });
});

// The animal system reads the terrain in world space (-6..+6) and paints on a
// 128px surface material texture, so tests use the same resolution.
test.describe("Animal movement", () => {
  const TERRAIN_SIZE = 12;
  const TEXTURE_SIZE = 128;

  const distanceTraveled = (entity$: number, x: number, z: number): number =>
    Math.hypot(Position.x[entity$] - x, Position.z[entity$] - z);

  // The system reads the terrain texture from the resource holder the water
  // simulation publishes it to, so tests publish one up front.
  const useGrassyTerrain = (): ReturnType<
    typeof createSurfaceMaterialTexture
  > => {
    const surfaceMaterialTexture = createSurfaceMaterialTexture(
      TEXTURE_SIZE,
      TERRAIN_SIZE,
    );
    setSurfaceMaterialTexture(surfaceMaterialTexture);
    return surfaceMaterialTexture;
  };

  const scene = new THREE.Scene();

  test("moves and grazes while the simulation is running", () => {
    const world = createWorld(createGameWorldContext());
    const surfaceMaterialTexture = useGrassyTerrain();

    const animal$ = addAnimal(world, { x: 0, y: 1.0, z: 0 });

    animalSystem(world, scene, 0.5);

    expect(distanceTraveled(animal$, 0, 0)).toBeGreaterThan(0);

    // Grazing happens on game time too: the animal eats the grass it stands on
    expect(
      surfaceMaterialTexture.getMaterialAtPosition(
        Position.x[animal$] + TERRAIN_SIZE / 2,
        Position.z[animal$] + TERRAIN_SIZE / 2,
      ),
    ).toBe("bareDirt");
  });

  test("freezes movement and grazing while the simulation is paused", () => {
    const world = createWorld(createGameWorldContext());
    const surfaceMaterialTexture = useGrassyTerrain();

    const animal$ = addAnimal(world, { x: 0, y: 1.0, z: 0 });
    const startX = Position.x[animal$];
    const startZ = Position.z[animal$];

    world.isPaused = true;

    // Several frames' worth of paused wall time must not advance the animal
    for (let frame = 0; frame < 5; frame++) {
      animalSystem(world, scene, 0.5);
    }

    expect(Position.x[animal$]).toBe(startX);
    expect(Position.z[animal$]).toBe(startZ);
    expect(Velocity.x[animal$]).toBe(0);
    expect(Velocity.z[animal$]).toBe(0);
    expect(
      surfaceMaterialTexture.getMaterialAtPosition(
        startX + TERRAIN_SIZE / 2,
        startZ + TERRAIN_SIZE / 2,
      ),
    ).toBe("grass");

    // Resuming picks the behaviour back up
    world.isPaused = false;
    animalSystem(world, scene, 0.5);
    expect(distanceTraveled(animal$, startX, startZ)).toBeGreaterThan(0);
  });
});
