import { createWorld } from "bitecs";
import { expect, test } from "@playwright/test";

import { Animal, Position, Velocity } from "src/components/components";
import { addAnimal } from "src/world/factories/addAnimal";
import { createAnimal } from "src/world/factories/animal";
import { query } from "bitecs";

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