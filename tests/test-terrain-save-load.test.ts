import { test, expect } from "@playwright/test";

test.describe("Terrain Save/Load Verification", () => {
  test("should save and restore terrain geometry state correctly", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Pause the game to stop simulation from modifying terrain
    const pauseButton = page.getByText("Pause");
    await pauseButton.click();
    await page.waitForTimeout(300);

    // Get initial terrain state before save
    const initialState = await page.evaluate(() => {
      const terrainManager = window.terrainStateManager;
      if (!terrainManager) {
        return null;
      }
      const state = terrainManager.getCurrentState();
      if (!state) {
        return null;
      }
      // Return first 10 position values for comparison (x, y, z for each vertex)
      return Array.from(state.positions.slice(0, 10));
    });

    console.log("Initial terrain state:", initialState);
    expect(initialState).not.toBeNull();
    if (!initialState) throw new Error("Initial state should not be null");
    expect(initialState.length).toBe(10);

    // Save the state
    const saveButton = page.getByTitle("Save current state");
    await saveButton.click();

    // Wait for save to complete
    await page.waitForTimeout(300);

    // Manually modify terrain positions to simulate erosion
    await page.evaluate(() => {
      const getTerrainMesh = window.getTerrainMesh;
      if (!getTerrainMesh) {
        return;
      }
      const mesh = getTerrainMesh();
      if (!mesh) {
        return;
      }
      const geometry = mesh.geometry;
      const positions = geometry.attributes.position;

      // Directly modify the position array to simulate erosion
      for (let i = 0; i < Math.min(10, positions.count); i++) {
        const currentZ = positions.getZ(i);
        positions.setZ(i, currentZ - 5.0); // Lower the terrain by 5.0
      }

      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    });

    // Get state after erosion (should be different)
    const stateAfterErosion = await page.evaluate(() => {
      const getTerrainMesh = window.getTerrainMesh;
      if (!getTerrainMesh) {
        return null;
      }
      const mesh = getTerrainMesh();
      if (!mesh) {
        return null;
      }
      const geometry = mesh.geometry;
      const positions = geometry.attributes.position;
      // Convert TypedArray to regular array
      return Array.from(positions.array as unknown as number[]);
    });

    console.log("State after erosion:", stateAfterErosion);

    // Verify that erosion actually changed the terrain significantly (only Z values at indices 2, 5, 8)
    const erosionChanged = [2, 5, 8].every((idx: number) => {
      if (!initialState || !stateAfterErosion) return false;
      const val = initialState[idx];
      const erodedVal = stateAfterErosion[idx];
      return Math.abs(val - erodedVal) > 4.0; // Should be changed by ~5.0
    });
    expect(erosionChanged).toBe(true);

    // Load the saved state
    const loadButton = page.getByTitle("Load saved state");
    await loadButton.click();

    // Wait for load to complete and pause simulation
    await page.waitForTimeout(300);

    // Pause the game to stop simulation from overwriting restored state
    await page.getByRole("button", { name: /Pause|Resume/ }).click();
    await page.waitForTimeout(300);

    // Get state after load (should match initial)
    const stateAfterLoad = await page.evaluate(() => {
      const terrainManager = window.terrainStateManager;
      if (!terrainManager) {
        return null;
      }
      const state = terrainManager.getCurrentState();
      if (!state) {
        return null;
      }
      return Array.from(state.positions.slice(0, 10));
    });

    console.log("State after load:", stateAfterLoad);

    // Verify that terrain was restored to initial state (only Z values at indices 2, 5, 8)
    const positionsRestored = [2, 5, 8].every((idx: number) => {
      if (!stateAfterLoad || !initialState) return false;
      const val = stateAfterLoad[idx];
      const initialVal = initialState[idx];
      // After load, should be close to initial (within 0.5 tolerance for simulation drift)
      return Math.abs(val - initialVal) < 0.5;
    });

    // Also verify it's different from the eroded state (only Z values)
    const differentFromEroded = [2, 5, 8].every((idx: number) => {
      if (!stateAfterLoad || !stateAfterErosion) return false;
      const val = stateAfterLoad[idx];
      const erodedVal = stateAfterErosion[idx];
      return Math.abs(val - erodedVal) > 4.0;
    });

    console.log({ positionsRestored, differentFromEroded });

    expect(positionsRestored).toBe(true);
    expect(differentFromEroded).toBe(true);
  });
});
