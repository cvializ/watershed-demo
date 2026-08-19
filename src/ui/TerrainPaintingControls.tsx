import type { GameWorldContext } from "@/context";

type TerrainPaintingControlsProps = {
  world: GameWorldContext;
  paintingSystem?: {
    getMaterialUnderCursor: () => string | null;
    saveSurfaceMaterials: () => boolean;
    loadSurfaceMaterials: () => boolean;
  };
};

/**
 * React component for terrain painting controls.
 * Provides UI for selecting brush material, size, and strength.
 */
export const TerrainPaintingControls = ({
  world,
  paintingSystem,
}: TerrainPaintingControlsProps) => {
  const handleMaterialChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const value = event.target.value as "bareDirt" | "grass" | "rocks";
    world.terrainBrushMaterial = value;
  };

  const handleRadiusChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    world.terrainBrushRadius = parseFloat(event.target.value);
  };

  const handleTogglePainting = () => {
    world.terrainPaintingEnabled = !world.terrainPaintingEnabled;
  };

  const handleClearMaterials = () => {
    // Trigger clear by dispatching a custom event that the painting system listens to
    window.dispatchEvent(new CustomEvent("terrain-paint-clear"));
  };

  // Get material under cursor for display
  const getMaterialUnderCursor = (): string => {
    if (!paintingSystem) return "N/A";
    const material = paintingSystem.getMaterialUnderCursor();
    if (!material) return "N/A";
    // Format material name for display
    return material.charAt(0).toUpperCase() + material.slice(1);
  };

  // Type guard for material info display
  const getMaterialInfo = () => {
    switch (world.terrainBrushMaterial) {
      case "grass":
        return (
          <>
            <li>Infiltration: 0.8 (high absorption)</li>
            <li>Friction: 1.3 (slower flow)</li>
          </>
        );
      case "rocks":
        return (
          <>
            <li>Infiltration: 0.2 (low absorption)</li>
            <li>Friction: 0.8 (faster flow)</li>
          </>
        );
      default:
        return (
          <>
            <li>Infiltration: 0.5 (moderate absorption)</li>
            <li>Friction: 1.0 (normal flow speed)</li>
          </>
        );
    }
  };

  return (
    <div style={styles.container}>
      {/* Material under cursor display */}
      <div style={styles.cursorInfo}>
        <strong>Cursor:</strong>
        <span style={styles.cursorMaterial}>{getMaterialUnderCursor()}</span>
      </div>

      <div style={styles.section}>
        <label htmlFor="brush-material" style={styles.label}>
          Brush Material:
        </label>
        <select
          id="brush-material"
          value={world.terrainBrushMaterial}
          onChange={handleMaterialChange}
          style={styles.dropdown}
        >
          <option value="bareDirt">Bare Dirt</option>
          <option value="grass">Grass</option>
          <option value="rocks">Rocks</option>
        </select>
      </div>

      <div style={styles.section}>
        <label htmlFor="brush-radius" style={styles.label}>
          Brush Size: {world.terrainBrushRadius.toFixed(1)}
        </label>
        <input
          type="range"
          id="brush-radius"
          min="0.5"
          max="6.0"
          step="0.5"
          value={world.terrainBrushRadius}
          onChange={handleRadiusChange}
          style={styles.slider}
          title="Brush radius in world units"
        />
      </div>

      <div style={styles.section}>
        <button
          onClick={handleTogglePainting}
          style={{
            ...styles.button,
            backgroundColor: world.terrainPaintingEnabled
              ? "#28a745"
              : "#6c757d",
          }}
          title={
            world.terrainPaintingEnabled
              ? "Disable painting"
              : "Enable painting"
          }
        >
          {world.terrainPaintingEnabled ? "Painting ON" : "Painting OFF"}
        </button>
      </div>

      <div style={styles.section}>
        <button
          onClick={handleClearMaterials}
          style={{ ...styles.button, backgroundColor: "#dc3545" }}
          title="Clear all materials (reset to bare dirt)"
        >
          Clear Materials
        </button>
      </div>

      <div style={styles.instructions}>
        <strong>How to paint:</strong> Left-click and drag on terrain
      </div>

      <div style={styles.materialInfo}>
        <strong>Material Properties:</strong>
        <ul style={styles.infoList}>{getMaterialInfo()}</ul>
      </div>
    </div>
  );
};

TerrainPaintingControls.displayName = "TerrainPaintingControls";

const styles = {
  container: {
    position: "absolute",
    top: "20px",
    right: "20px",
    padding: "16px",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: "8px",
    color: "#fff",
    pointerEvents: "auto" as const,
    minWidth: "220px",
  } satisfies React.CSSProperties,
  cursorInfo: {
    marginBottom: "12px",
    padding: "8px",
    backgroundColor: "rgba(64, 224, 208, 0.15)",
    borderRadius: "6px",
    borderLeft: "3px solid #40E0D0",
  } satisfies React.CSSProperties,
  cursorMaterial: {
    display: "inline-block",
    marginLeft: "8px",
    padding: "2px 8px",
    backgroundColor: "rgba(64, 224, 208, 0.3)",
    borderRadius: "4px",
    fontFamily: "monospace",
    fontWeight: "bold",
  } satisfies React.CSSProperties,
  section: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "8px",
    marginBottom: "12px",
  } satisfies React.CSSProperties,
  label: {
    fontSize: "12px",
    fontWeight: "bold",
  } satisfies React.CSSProperties,
  dropdown: {
    padding: "6px 8px",
    fontFamily: "monospace",
    fontSize: "12px",
    backgroundColor: "#333",
    color: "#fff",
    border: "1px solid #555",
    borderRadius: "4px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
  } satisfies React.CSSProperties,
  slider: {
    width: "100%",
    cursor: "pointer",
  } satisfies React.CSSProperties,
  button: {
    padding: "8px 16px",
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    transition: "background-color 0.2s",
    width: "100%",
  } satisfies React.CSSProperties,
  instructions: {
    fontSize: "11px",
    color: "#aaa",
    marginTop: "8px",
    padding: "8px",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: "4px",
  } satisfies React.CSSProperties,
  materialInfo: {
    fontSize: "11px",
    marginTop: "12px",
    padding: "8px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: "4px",
  } satisfies React.CSSProperties,
  infoList: {
    margin: "8px 0 0 0",
    paddingLeft: "16px",
    fontSize: "11px",
  } satisfies React.CSSProperties,
};
