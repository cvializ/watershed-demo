import { expect, test } from "@playwright/test";

import { createTerrainHeightEditor } from "src/gpu/waterFlowSimulation/variables/createTerrainHeightEditing";

const SIZE = 64;
const TERRAIN_SIZE = 40;

/** Stroke count to reach the per-texel cap even at the brush edge. */
const STROKES_PAST_CAP = 40;

const makeEditor = () => createTerrainHeightEditor(SIZE, TERRAIN_SIZE, 10);

test.describe("createTerrainHeightEditor", () => {
  test("starts with a flat (zero) edit field", () => {
    const editor = makeEditor();

    for (const [x, y] of [
      [0, 0],
      [20, 20],
      [39.9, 0.1],
      [10.5, 30.25],
    ]) {
      expect(editor.getEditAt(x, y)).toBe(0);
    }
  });

  test("one stroke paints a smooth dome with the full delta at the centre", () => {
    const editor = makeEditor();

    editor.paint(20, 20, 2, 3);

    // The texels nearest the stroke centre get (almost) the full delta; the
    // stroke centre can straddle two texels, so allow for half-texel falloff.
    const centre = editor.getEditAt(20, 20);
    expect(centre).toBeGreaterThanOrEqual(2 * 0.98);
    expect(centre).toBeLessThanOrEqual(2);

    // A point just outside the brush stays untouched.
    expect(editor.getEditAt(24, 20)).toBe(0);

    // Points inside the brush decay smoothly toward the edge.
    const near = editor.getEditAt(21, 20);
    const far = editor.getEditAt(22.5, 20);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);

    // The sampled field is continuous along the radius.
    let previous = editor.getEditAt(20, 20);
    for (let y = 20.25; y <= 23; y += 0.25) {
      const sample = editor.getEditAt(20, y);
      expect(sample).toBeLessThanOrEqual(previous + 1e-9);
      previous = sample;
    }
  });

  test("holding a key accumulates smoothly and clamps at the cap", () => {
    const raiseEditor = makeEditor();
    const lowerEditor = makeEditor();

    // Repeated strokes at the same spot never exceed the configured cap...
    for (let stroke = 0; stroke < STROKES_PAST_CAP; stroke++) {
      raiseEditor.paint(12, 12, 0.4, 2);
      lowerEditor.paint(12, 12, -0.4, 2);
    }
    expect(raiseEditor.getEditAt(12, 12)).toBeLessThanOrEqual(10);
    expect(lowerEditor.getEditAt(12, 12)).toBeGreaterThanOrEqual(-10);

    // Enough strokes on a fresh field reach the cap exactly.
    const deepEditor = makeEditor();
    for (let stroke = 0; stroke < STROKES_PAST_CAP * 2; stroke++) {
      deepEditor.paint(12, 12, -0.4, 2);
    }
    expect(deepEditor.getEditAt(12, 12)).toBeCloseTo(-10, 5);
  });

  test("painted offsets stay put and mirror across positive and negative", () => {
    const editor = makeEditor();

    editor.paint(30, 10, 3, 2);
    editor.paint(8, 33, -2.5, 2);

    // A stroke over an already-painted cell replaces nothing: offsets are
    // per-texel and absolute once clamped, so re-stroking keeps them stable.
    editor.paint(30, 10, 3, 2);

    expect(editor.getEditAt(30, 10)).toBeLessThanOrEqual(6);
    expect(editor.getEditAt(30, 10)).toBeGreaterThanOrEqual(3);
    expect(editor.getEditAt(8, 33)).toBeGreaterThanOrEqual(-2.5);
    expect(editor.getEditAt(8, 33)).toBeLessThanOrEqual(-2);

    // Untouched terrain is unaffected by distant strokes.
    expect(editor.getEditAt(20, 20)).toBe(0);
  });

  test("clear resets the whole field", () => {
    const editor = makeEditor();

    editor.paint(20, 20, 2, 6);
    editor.clear();

    expect(editor.getEditAt(20, 20)).toBe(0);
    expect(editor.getEditAt(5, 5)).toBe(0);
  });

  test("getTexture exposes the edited data as a float texture", () => {
    const editor = makeEditor();

    editor.paint(20, 20, 1.5, 2);

    const texture = editor.getTexture();
    expect(texture.image.width).toBe(SIZE);
    expect(texture.image.height).toBe(SIZE);
    // needsUpdate is a write-only accessor in three; version ticks per update.
    expect(texture.version).toBeGreaterThanOrEqual(2);
    expect((texture.image.data as Float32Array)[0]).toBe(0);
  });
});