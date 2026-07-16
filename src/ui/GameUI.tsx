import type { GameWorld } from "@/types";
import { useState } from "react";


type MaterialId = "water" | "downslope" | "slope" | "height" | "debug-height-range" | "debug-position" | "debug-depth" | "debug-face-normal" | "debug-displacement" | "debug-time";

type GameUiProps = { 
  world: GameWorld 
};

/**
 * Main game UI component - renders on top of the canvas
 */
export const GameUI = ({ world }: GameUiProps) => {
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialId>("water");

  const materialOptions: { id: MaterialId; label: string }[] = [
    { id: "water", label: "Water Flow" },
    { id: "downslope", label: "Downslope Arrows" },
    { id: "slope", label: "Slope Visualization" },
    { id: "height", label: "Height Visualization" },
    { id: "debug-height-range", label: "Debug Height Range" },
    { id: "debug-position", label: "Debug Position" },
    { id: "debug-depth", label: "Debug Depth" },
    { id: "debug-face-normal", label: "Debug Face Normal" },
    { id: "debug-displacement", label: "Debug Displacement" },
    { id: "debug-time", label: "Debug Time" },
  ];

  const handleMaterialChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as MaterialId;
    setSelectedMaterial(value);
    world.showVelocity = value !== 'downslope';
  };

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
            value={selectedMaterial}
            onChange={handleMaterialChange}
            style={styles.materialDropdown}
          >
            {materialOptions.map((option) => (
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