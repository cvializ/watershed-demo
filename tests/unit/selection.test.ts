import { expect, test } from "@playwright/test";
import {
  addComponent,
  createWorld,
  hasComponent,
  query,
  removeComponent,
} from "bitecs";
import {
  Animal,
  Position,
  Renderable,
  Selected,
} from "src/components/components";
import { createGameWorldContext } from "src/context";
import { createAnimal } from "src/world/factories/animal";

// The selection system is event-driven (canvas right-click), so these tests
// validate the component contract it relies on: addComponent/removeComponent
// on the Selected tag drives which entity is selected, and the systems
// switch selection by clearing the previous Selected before tagging the next.
test("Selected tag can be toggled on a renderable entity", () => {
  const world = createWorld(createGameWorldContext());

  const animal$ = createAnimal(world, 1, 2, 3);
  expect(query(world, [Renderable])).toContain(animal$);

  addComponent(world, animal$, Selected);
  expect(query(world, [Selected])).toContain(animal$);
  expect(hasComponent(world, animal$, Selected)).toBe(true);

  removeComponent(world, animal$, Selected);
  expect(query(world, [Selected])).not.toContain(animal$);
  expect(hasComponent(world, animal$, Selected)).toBe(false);
});

test("only one Selected entity at a time via clear-then-add", () => {
  const world = createWorld(createGameWorldContext());

  const first = createAnimal(world, -3, 0.5, -3);
  const second = createAnimal(world, 3, 0.5, 3);

  addComponent(world, first, Selected);
  expect(query(world, [Selected]).length).toBe(1);

  // Switching to second: clear first, then add second.
  removeComponent(world, first, Selected);
  addComponent(world, second, Selected);

  expect(query(world, [Selected])).toEqual([second]);
  expect(query(world, [Animal, Selected])).toEqual([second]);
});

test("deselection leaves no Selected entity", () => {
  const world = createWorld(createGameWorldContext());
  const animal$ = createAnimal(world, 0, 0.5, 0);

  addComponent(world, animal$, Selected);

  removeComponent(world, animal$, Selected);

  expect(query(world, [Selected])).not.toContain(animal$);

  // Component data of an entity stays readable regardless of selection.
  expect(Position.y[animal$]).toBe(0.5);
});
