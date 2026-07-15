import type { GameWorld } from "@/types";
import { memo } from "react";


type GameUiProps = { 
  world: GameWorld 
};

/**
 * Main game UI component - renders on top of the canvas
 */
export const GameUI = ({ world }: GameUiProps) => {
  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <h2 style={styles.title}>Game UI</h2>
        <p style={styles.subtitle}>React-based UI overlay</p>
        <p>{world.fps}</p>
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
  } satisfies React.CSSProperties,
  title: {
    margin: "0 0 8px 0",
    fontSize: "18px",
    fontWeight: "bold",
  } satisfies React.CSSProperties,
  subtitle: {
    margin: "0",
    fontSize: "14px",
    opacity: 0.8,
  } satisfies React.CSSProperties,
};