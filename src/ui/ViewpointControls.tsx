import { query } from "bitecs";

import type { GameWorldContext } from "@/context";

import { Name, Viewpoint } from "@/components/components";
import { createViewpoint } from "@/world/factories/viewpoint";
import { TERRAIN_HALF_SIZE } from "@/terrain/constants";

type ViewpointControlsProps = {
  world: GameWorldContext;
};

/** Inset from the terrain edge so an added viewpoint is not placed on the rim. */
const PLACEMENT_MARGIN = 3;

/** How far beyond the stand point a freshly added viewpoint aims, toward centre. */
const DEFAULT_LOOK = { x: 0, z: 0 };

/**
 * Panel to add first-person viewpoints and switch the main view to one of them.
 *
 * Lists every `Viewpoint` entity in the world (seeded examples plus any the
 * user has added). Choosing one sets it as the active viewpoint, so the scene
 * renders from that stand point; choosing "Overhead" returns to the default
 * orbit camera.
 */
export const ViewpointControls = ({ world }: ViewpointControlsProps) => {
  // Recomputed each frame the UI re-renders, so newly added viewpoints appear.
  // `query` returns a `Uint32Array` (or array); copy to a plain array so we can
  // map it to React elements (a typed array's `map` returns the same numeric type).
  const viewpointEids = Array.from(query(world, [Viewpoint]));

  const handleSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    world.activeViewpoint$ = Number.parseInt(event.target.value, 10);
  };

  // Drop a new viewpoint at a random spot on the terrain looking toward centre,
  // mirroring how animals are scattered, then switch the view to it.
  const handleAddRandom = () => {
    const span = TERRAIN_HALF_SIZE - PLACEMENT_MARGIN;
    const x = Math.random() * 2 * span - span;
    const z = Math.random() * 2 * span - span;
    const entity$ = createViewpoint(world, {
      stand: { x, z },
      look: DEFAULT_LOOK,
      name: `Viewpoint ${viewpointEids.length + 1}`,
    });
    world.activeViewpoint$ = entity$;
  };

  const activeLabel =
    world.activeViewpoint$ >= 0
      ? Name.value[world.activeViewpoint$] ?? "Viewpoint"
      : "Overhead";

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Viewpoints:</div>
      <div style={styles.row}>
        <span style={styles.label}>View from:</span>
        <select
          id="viewpoint-select"
          value={String(world.activeViewpoint$)}
          onChange={handleSelect}
          style={styles.select}
        >
          <option value="-1">Overhead</option>
          {viewpointEids.map((entity$) => (
            <option key={entity$} value={String(entity$)}>
              {Name.value[entity$] ?? `Viewpoint ${entity$}`}
            </option>
          ))}
        </select>
      </div>
      <div style={styles.row}>
        <button
          id="add-viewpoint"
          onClick={handleAddRandom}
          style={styles.button}
        >
          Add Viewpoint (random)
        </button>
      </div>
      <div style={styles.hint}>
        Now viewing: {activeLabel}. Pick a stand point to look from, or add a
        new one and view the scene from there.
      </div>
    </div>
  );
};

ViewpointControls.displayName = "ViewpointControls";

const styles = {
  panel: {
    position: "absolute" as const,
    top: "96px",
    right: "20px",
    width: "236px",
    padding: "12px",
    borderRadius: "8px",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    color: "#fff",
    pointerEvents: "auto" as const,
  },
  title: {
    fontSize: "13px",
    fontWeight: "bold",
    color: "#87ceeb",
    marginBottom: "4px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "6px",
  },
  label: {
    fontSize: "12px",
    whiteSpace: "nowrap" as const,
  },
  select: {
    padding: "4px 8px",
    fontFamily: "monospace",
    fontSize: "12px",
    backgroundColor: "#333",
    color: "#fff",
    border: "1px solid #555",
    borderRadius: "4px",
    cursor: "pointer",
    outline: "none",
  },
  button: {
    padding: "6px 12px",
    fontFamily: "monospace",
    fontSize: "12px",
    backgroundColor: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  hint: {
    fontSize: "11px",
    color: "#aaa",
    marginTop: "6px",
  },
};