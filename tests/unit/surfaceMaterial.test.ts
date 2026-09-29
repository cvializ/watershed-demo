import { expect, test } from "@playwright/test";
import {
  createSurfaceMaterialTexture,
  type SurfaceMaterialType,
} from "src/scene/resources/textures/surfaceMaterial";
import { TERRAIN_SIZE } from "src/terrain/constants";

/**
 * The two farmed substances, and how they relate to the substances they were defined against.
 *
 * Cultivated erodes like grass but a little more, fallow like bare dirt but a little less - which is a claim
 * about the shader tables (see tests/unit/sedimentConservation.test.ts, which mirrors them). What this file
 * pins is the painter's half of the deal: the new ids exist, are distinct, survive a paint/read round trip, and
 * carry the colours and flow properties the UI advertises.
 */

const SIZE = 32;

/** Every paintable substance, matching the list in src/scene/resources/textures/surfaceMaterial.ts. */
const SURFACE_MATERIAL_TYPES: SurfaceMaterialType[] = [
  "bareDirt",
  "grass",
  "rocks",
  "cultivated",
  "fallow",
  "forest",
];

/** A brush stroke big enough to cover a whole texel of this grid. */
const BRUSH_RADIUS = 2.0;

/** The texel centre a paint at `x`, `y` is expected to reach, matching the painter's own coordinate flip. */
const texelFor = (x: number, y: number): { column: number; row: number } => ({
  column: Math.floor((x / TERRAIN_SIZE) * (SIZE - 1)),
  row: Math.floor((1.0 - y / TERRAIN_SIZE) * (SIZE - 1)),
});

/** Read one texel's stored material id, so the test can compare ids rather than nearest-name guesses. */
const materialIdAt = (
  texture: ReturnType<typeof createSurfaceMaterialTexture>,
  x: number,
  y: number,
): number => {
  const data = (texture.getTexture().image as { data: Float32Array }).data;
  const { column, row } = texelFor(x, y);
  return data[(row * SIZE + column) * 4];
};

test.describe("cultivated and fallow ground", () => {
  test("paints each new substance and reads it back at that spot", () => {
    const surface = createSurfaceMaterialTexture(SIZE, TERRAIN_SIZE);

    // Freshly created ground is grass, so a painted stroke is distinguishable from the default.
    expect(surface.getMaterialAtPosition(20, 20)).toBe("grass");

    surface.paint(10, 10, "cultivated", BRUSH_RADIUS);
    expect(surface.getMaterialAtPosition(10, 10)).toBe("cultivated");

    surface.paint(30, 30, "fallow", BRUSH_RADIUS);
    expect(surface.getMaterialAtPosition(30, 30)).toBe("fallow");

    // Painting one substance does not leak into the other stroke's neighbourhood.
    expect(surface.getMaterialAtPosition(10, 10)).toBe("cultivated");
    expect(surface.getMaterialAtPosition(30, 30)).toBe("fallow");
  });

  test("stores a distinct id per substance, so no two collapse onto one table row", () => {
    const surface = createSurfaceMaterialTexture(SIZE, TERRAIN_SIZE);

    const ids = new Map<SurfaceMaterialType, number>();
    for (const [index, materialType] of SURFACE_MATERIAL_TYPES.entries()) {
      const x = 2 + index * 6; // a stroke per substance, farther apart than two brush diameters
      surface.paint(x, 20, materialType, BRUSH_RADIUS);
      ids.set(materialType, materialIdAt(surface, x, 20));
      expect(surface.getMaterialAtPosition(x, 20)).toBe(materialType);
    }

    expect(new Set(ids.values()).size).toBe(SURFACE_MATERIAL_TYPES.length);
    expect([...ids.entries()]).toEqual([
      ["bareDirt", 0.0],
      ["grass", 1.0],
      ["rocks", 2.0],
      ["cultivated", 3.0],
      ["fallow", 4.0],
      ["forest", 5.0],
    ]);
  });

  test("clear and reload keep the new substances rather than resetting them to grass", () => {
    const surface = createSurfaceMaterialTexture(SIZE, TERRAIN_SIZE);
    surface.paint(20, 20, "cultivated", 6.0);

    // Export/import is the save path: a painted field must survive it with its id intact, or a reloaded scene
    // would quietly turn every crop field back into grass.
    const saved = surface.exportToJson();
    expect(surface.importFromJson(saved)).toBe(true);
    expect(surface.getMaterialAtPosition(20, 20)).toBe("cultivated");

    surface.clear();
    expect(surface.getMaterialAtPosition(20, 20)).toBe("grass");
  });

  test("cultivated is light yellow and fallow is dark yellow", () => {
    const surface = createSurfaceMaterialTexture(SIZE, TERRAIN_SIZE);
    const cultivated = surface.getMaterialProperties("cultivated");
    const fallow = surface.getMaterialProperties("fallow");

    // Both are yellows: red leads, green follows close behind, blue trails by a margin wide enough that
    // neither could be mistaken for the browns or the grey already in the table.
    for (const [name, color] of [
      ["cultivated", cultivated.color],
      ["fallow", fallow.color],
    ] as const) {
      const [red, green, blue] = color;
      expect(red, name).toBeGreaterThan(green);
      expect(green, name).toBeGreaterThan(blue);
      expect(red - blue, name).toBeGreaterThan(0.3);
    }

    // ...and the light one is the light one: every channel of cultivated leads fallow's.
    expect(cultivated.color[0]).toBeGreaterThan(fallow.color[0]);
    expect(cultivated.color[1]).toBeGreaterThan(fallow.color[1]);
    expect(cultivated.color[2]).toBeGreaterThan(fallow.color[2]);
  });

  test("each new substance sits between the two it was defined against", () => {
    const surface = createSurfaceMaterialTexture(SIZE, TERRAIN_SIZE);
    const {
      infiltrationRate: grassInfiltration,
      frictionCoefficient: grassFriction,
    } = surface.getMaterialProperties("grass");
    const {
      infiltrationRate: dirtInfiltration,
      frictionCoefficient: dirtFriction,
    } = surface.getMaterialProperties("bareDirt");
    const cultivated = surface.getMaterialProperties("cultivated");
    const fallow = surface.getMaterialProperties("fallow");

    // A crop field still drinks and still slows the flow, just not as a sward does; fallow is closer to bare
    // earth again. Same ordering as the erosion tables, so the two tables cannot contradict each other.
    expect(cultivated.infiltrationRate).toBeLessThan(grassInfiltration);
    expect(cultivated.infiltrationRate).toBeGreaterThan(dirtInfiltration);
    expect(cultivated.frictionCoefficient).toBeLessThan(grassFriction);
    expect(cultivated.frictionCoefficient).toBeGreaterThan(dirtFriction);
    expect(fallow.infiltrationRate).toBeLessThan(grassInfiltration);
    expect(fallow.infiltrationRate).toBeGreaterThan(dirtInfiltration);
    expect(fallow.frictionCoefficient).toBeLessThan(grassFriction);
    expect(fallow.frictionCoefficient).toBeGreaterThan(dirtFriction);
  });

  test("an out-of-range stored id resolves to the nearest real substance", () => {
    const surface = createSurfaceMaterialTexture(SIZE, TERRAIN_SIZE);
    const data = (surface.getTexture().image as { data: Float32Array }).data;

    // A hand-edited save file can hold anything; painting grass everywhere first gives us a known grid, then
    // one texel of 2.7 (between rock and crop) has to answer "cultivated" rather than the fallback.
    surface.clear();
    for (let index = 0; index < SIZE * SIZE; index++) {
      data[index * 4] = 2.7;
    }

    expect(surface.getMaterialAtPosition(20, 20)).toBe("cultivated");
  });
});

test.describe("woodland", () => {
  test("paints forest, reads it back, and keeps it through a save round trip", () => {
    const surface = createSurfaceMaterialTexture(SIZE, TERRAIN_SIZE);

    surface.paint(20, 20, "forest", BRUSH_RADIUS);
    expect(surface.getMaterialAtPosition(20, 20)).toBe("forest");

    // Export/import is the save path: a painted stand has to come back as forest, or a reloaded scene would
    // quietly turn every wood into something else.
    const saved = surface.exportToJson();
    expect(surface.importFromJson(saved)).toBe(true);
    expect(surface.getMaterialAtPosition(20, 20)).toBe("forest");

    surface.clear();
    expect(surface.getMaterialAtPosition(20, 20)).toBe("grass");
  });

  test("is dark green - the same hue as grass, only deeper", () => {
    const surface = createSurfaceMaterialTexture(SIZE, TERRAIN_SIZE);
    const forest = surface.getMaterialProperties("forest");
    const grass = surface.getMaterialProperties("grass");
    const [red, green, blue] = forest.color;

    // Green leads both other channels, so a stand reads as vegetation rather than as soil or stone, and every
    // channel sits under grass's, so a forest is visibly darker from above than the sward next to it.
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
    expect(red).toBeLessThan(grass.color[0]);
    expect(green).toBeLessThan(grass.color[1]);
    expect(blue).toBeLessThan(grass.color[2]);

    // ...but not so dark that a painted wood is indistinguishable from a cloud shadow.
    expect(green).toBeGreaterThan(0.1);
    expect(green).toBeLessThan(0.4);
  });

  test("is the thirstiest and slowest ground in the table", () => {
    const surface = createSurfaceMaterialTexture(SIZE, TERRAIN_SIZE);
    const forest = surface.getMaterialProperties("forest");

    // A closed canopy over unturned, deeply rooted ground: nothing else in the table soaks or slows a sheet
    // flow better, so every other substance sits below forest on both counts.
    for (const materialType of SURFACE_MATERIAL_TYPES) {
      if (materialType === "forest") {
        continue;
      }

      const properties = surface.getMaterialProperties(materialType);
      expect(forest.infiltrationRate).toBeGreaterThan(
        properties.infiltrationRate,
      );
      expect(forest.frictionCoefficient).toBeGreaterThan(
        properties.frictionCoefficient,
      );
    }
  });

  test("an id past the end of the table resolves to forest, the nearest real substance", () => {
    const surface = createSurfaceMaterialTexture(SIZE, TERRAIN_SIZE);
    const data = (surface.getTexture().image as { data: Float32Array }).data;

    // 4.7 is nobody's id, but it is closer to forest's 5.0 than to fallow's 4.0, so a hand-edited save file
    // holding it should read as woodland rather than as whatever a fallthrough case returned.
    surface.clear();
    for (let index = 0; index < SIZE * SIZE; index++) {
      data[index * 4] = 4.7;
    }

    expect(surface.getMaterialAtPosition(20, 20)).toBe("forest");
  });
});
