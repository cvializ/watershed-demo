import type { GameWorld } from "@/types";

type GameUiProps = { 
  world: GameWorld 
};

/**
 * Main game UI component - renders on top of the canvas
 */
export const GameUI = ({ world }: GameUiProps) => {
  // Map internal visualization mode numbers to UI labels (not used but kept for reference)
  const _materialOptions: { id: number; label: string }[] = [
    { id: 0, label: "Height Visualization" },
    { id: 1, label: "Slope Visualization" },
    { id: 2, label: "Normal Material (Debug)" },
    { id: 3, label: "Downslope Arrows" },
    { id: 4, label: "Water Flow" },
  ];

  const handleMaterialChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(event.target.value, 10);
    world.visualizationMode = value;
  };

  // Get the current material name from visualization mode (not used but kept for reference)
  void _materialOptions.find(
    (_opt: any) => _opt.id === world.visualizationMode
  );

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <div style={styles.fpsSection}>
          <span>FPS: {Math.round(world.fps)}</span>
        </div>
        <div style={styles.materialSection}>
          <label htmlFor="material-select" style={styles.materialLabel}>Material:</label>
          <select
            id="material-select"
            value={world.visualizationMode}
            onChange={handleMaterialChange}
            style={styles.materialDropdown}
          >
            {_materialOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.erosionSection}>
          <span style={styles.label}>Erosion:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={world.erosionRate}
            onChange={(e) => world.erosionRate = parseFloat(e.target.value)}
            style={styles.slider}
            title="Erosion rate"
          />
        </div>
        <div style={styles.sunAngleSection}>
          <span style={styles.label}>Sun Angle:</span>
          <input
            type="range"
            min={0}
            max={Math.PI * 2}
            step="0.01"
            value={world.sunAngle}
            onChange={(e) => world.sunAngle = parseFloat(e.target.value)}
            style={styles.slider}
            title="Sun position angle"
          />
        </div>
      </div>
    </div>
  );
};

GameUI.displayName = "GameUI";

const styles = {
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none" as const,
  } satisfies React.CSSProperties,
  panel: {
    position: "absolute",
    top: "20px",
    left: "20px",
    padding: "16px",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: "8px",
    color: "#fff",
    pointerEvents: "auto" as const,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "16px",
  } satisfies React.CSSProperties,
  title: {
    display: "none",
  } satisfies React.CSSProperties,
  subtitle: {
    display: "none",
  } satisfies React.CSSProperties,
  fpsSection: {
    fontFamily: "monospace",
    fontSize: "12px",
  } satisfies React.CSSProperties,
  materialSection: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  } satisfies React.CSSProperties,
  materialLabel: {
    fontSize: "12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  } satisfies React.CSSProperties,
  materialDropdown: {
    padding: "4px 8px",
    fontFamily: "monospace",
    fontSize: "12px",
    backgroundColor: "#333",
    color: "#fff",
    border: "1px solid #555",
    borderRadius: "4px",
    cursor: "pointer",
    outline: "none",
  } satisfies React.CSSProperties,
  erosionSection: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  } satisfies React.CSSProperties,
  label: {
    fontSize: "12px",
    whiteSpace: "nowrap",
  } satisfies React.CSSProperties,
  slider: {
    width: "100px",
    cursor: "pointer",
  } satisfies React.CSSProperties,
  sunAngleSection: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  } satisfies React.CSSProperties,
};