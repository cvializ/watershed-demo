import * as THREE from "three";

import {
  createWatershedOverlay,
  setWatershedMask,
} from "@/scene/resources/meshes/watershedOverlay";
import {
  type DrainageNetwork,
  createDrainageNetwork,
  traceWatershed,
} from "@/terrain/computeWatershed";
import {
  buildHeightGrid,
  getCellIndexAtWorld,
  type TerrainHeightGrid,
} from "@/terrain/terrainHeightGrid";

/**
 * Configuration handed to the manager by the React UI each frame.
 */
export type WatershedConfig = {
  /** Show the watershed highlight under the cursor. */
  enabled: boolean;
};

/**
 * Traces and displays the watershed (contributing area) drained by whatever
 * point on the terrain sits under the mouse.
 *
 * It keeps its own pointer tracking (independent of terrain painting), so the
 * highlight follows the cursor whether or not painting is enabled.
 */
export type WatershedHighlightManager = {
  /**
   * Wire up camera, terrain mesh/geometry, and the highlight overlay.
   * Idempotent for the same terrain geometry, so it is safe to call every
   * frame; a geometry swap rebuilds a single fresh overlay.
   */
  initialize: (params: {
    camera: THREE.Camera;
    terrainMesh: THREE.Mesh;
    scene: THREE.Scene;
  }) => void;

  /** Push UI config into the manager. */
  updateFromUI: (config: WatershedConfig) => void;

  /** Recompute the highlight for the current pointer, if needed. */
  update: () => void;

  /** True when the highlight is currently shown. */
  isHighlighting: () => boolean;
};

let _watershedHighlightManager: WatershedHighlightManager | null = null;

/** True when two height grids hold exactly the same values. */
const sameHeights = (first: Float32Array, second: Float32Array): boolean => {
  if (first.length !== second.length) {
    return false;
  }
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) {
      return false;
    }
  }
  return true;
};

/**
 * Get the global watershed highlight manager, or `null` before it is created.
 */
export const getWatershedHighlightManager =
  (): WatershedHighlightManager | null => _watershedHighlightManager;

/**
 * Pointer position in client pixels, tracked by a single global `mousemove`
 * listener (module-level so a recreated manager never stacks extra listeners).
 */
let lastPointerClientX = 0;
let lastPointerClientY = 0;
let hasPointer = false;

if (typeof window !== "undefined") {
  window.addEventListener(
    "mousemove",
    (event: MouseEvent) => {
      lastPointerClientX = event.clientX;
      lastPointerClientY = event.clientY;
      hasPointer = true;
    },
    { passive: true },
  );
}

/**
 * Get the manager, or create one (idempotent).
 */
export const createWatershedHighlightManager =
  (): WatershedHighlightManager => {
    if (_watershedHighlightManager) {
      return _watershedHighlightManager;
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const config: WatershedConfig = { enabled: false };
    let camera: THREE.Camera | null = null;
    let terrainMesh: THREE.Mesh | null = null;
    let overlay: THREE.Mesh | null = null;

    // Cached grid + working buffers, rebuilt only when the terrain geometry
    // instance changes (e.g. on load). `heights`/`mask` are reused each frame.
    let grid: TerrainHeightGrid | null = null;
    let heights: Float32Array = new Float32Array(0);
    let mask: Uint8Array = new Uint8Array(0);

    // Cached drainage network (flow directions over both the authored surface
    // and the pit-filled one) plus the exact height grid it was traced from,
    // so the network is rebuilt only when painted/eroded edits change the
    // terrain, and just re-traced as the cursor moves between cells.
    let network: DrainageNetwork | null = null;
    let networkHeights: Float32Array | null = null;

    // Cell currently under the cursor, to skip recomputation while parked.
    let lastCell = -2;

    return {
      initialize: ({
        camera: cam,
        terrainMesh: mesh,
        scene,
      }: {
        camera: THREE.Camera;
        terrainMesh: THREE.Mesh;
        scene: THREE.Scene;
      }): void => {
        camera = cam;
        terrainMesh = mesh;

        // Only (re)build the overlay + grid when the terrain geometry changes.
        const currentGeometry = mesh.geometry;
        if (overlay && grid && overlay.geometry === currentGeometry) {
          return;
        }

        // Drop any previous overlay so no stale highlight lingers in the scene.
        if (overlay) {
          scene.remove(overlay);
        }

        overlay = createWatershedOverlay(currentGeometry);

        const built = buildHeightGrid(currentGeometry);
        if (!built) {
          scene.remove(overlay);
          overlay = null;
          grid = null;
          return;
        }

        grid = built;
        heights = new Float32Array(built.heights.length);
        mask = new Uint8Array(built.heights.length);
        network = null;
        networkHeights = null;
        lastCell = -2;

        if (!scene.children.includes(overlay)) {
          scene.add(overlay);
        }
      },

      updateFromUI: (next: WatershedConfig): void => {
        config.enabled = next.enabled;
        // When the tool is switched off, hide the highlight and forget the last
        // pour point so re-enabling recomputes from scratch.
        if (!next.enabled && overlay) {
          overlay.visible = false;
          lastCell = -2;
        }
      },

      update: (): void => {
        if (!config.enabled || !overlay || !camera || !terrainMesh || !grid) {
          if (overlay) {
            overlay.visible = false;
          }
          return;
        }

        // Nothing traced until the pointer moves over the terrain.
        if (!hasPointer) {
          return;
        }

        // Reuse the cached grid; rebuild the height array from live geometry so
        // painted/eroded edits are reflected.
        const position = terrainMesh.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        const array = position.array as Float32Array;
        for (let vertex = 0; vertex < heights.length; vertex++) {
          heights[vertex] = array[vertex * 3 + 2];
        }

        pointer.x = (lastPointerClientX / window.innerWidth) * 2 - 1;
        pointer.y = -(lastPointerClientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        const [hit] = raycaster.intersectObject(terrainMesh);
        if (!hit) {
          overlay.visible = false;
          lastCell = -2;
          return;
        }

        const cell = getCellIndexAtWorld(grid, hit.point.x, hit.point.z);

        // Re-trace the network whenever the heights differ from the ones it was
        // built from, and forget the parked cell so the hover stays in sync.
        if (
          network === null ||
          networkHeights === null ||
          !sameHeights(networkHeights, heights)
        ) {
          network = createDrainageNetwork(heights, grid.gridDim);
          networkHeights = Float32Array.from(heights);
          lastCell = -2;
        }

        // Skip recomputation while the cursor stays within the same terrain cell.
        if (cell === lastCell) {
          overlay.visible = true;
          return;
        }

        // traceWatershed writes straight into the reused working mask.
        traceWatershed(network, grid.gridDim, cell, mask);
        setWatershedMask(overlay, mask);

        lastCell = cell;
        overlay.visible = true;
      },

      isHighlighting: (): boolean => overlay !== null && overlay.visible,
    };
  };
