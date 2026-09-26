import { hasComponent } from "bitecs";

import type { GameWorldContext } from "@/context";

import {
  Animal,
  Camera,
  MaterialRef,
  MeshRef,
  Name,
  ObjectRef,
  Position,
  Selected,
  Terrain,
  Velocity,
} from "@/components/components";

type EntityInspectorProps = {
  world: GameWorldContext;
};

/**
 * Properties pane for the right-clicked entity.
 *
 * Only rendered while an entity carries `Selected` (i.e. `world.selectedEntity$`
 * points at an entity that still has that tag). Shows whatever components that
 * entity actually has; unknown entity ids or deselection hide the pane.
 */
export const EntityInspector = ({ world }: EntityInspectorProps) => {
  const entity$ = world.selectedEntity$;

  // A stale id (or none) shows nothing, so the pane reflects actual selection.
  if (entity$ < 0 || !hasComponent(world, entity$, Selected)) {
    return null;
  }

  const row = (label: string, value: string) => (
    <div style={styles.row} key={label}>
      <span style={styles.label}>{label}</span>
      <span style={styles.value}>{value}</span>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        {hasComponent(world, entity$, Name)
          ? Name.value[entity$]
          : `Entity ${entity$}`}
      </div>

      {hasComponent(world, entity$, Position) &&
        row(
          "Position",
          `${Position.x[entity$].toFixed(2)}, ${Position.y[entity$].toFixed(
            2,
          )}, ${Position.z[entity$].toFixed(2)}`,
        )}

      {hasComponent(world, entity$, Velocity) &&
        row(
          "Velocity",
          `${Velocity.x[entity$].toFixed(2)}, ${Velocity.y[entity$].toFixed(
            2,
          )}, ${Velocity.z[entity$].toFixed(2)}`,
        )}

      {hasComponent(world, entity$, MeshRef) &&
        row("Mesh", MeshRef.ref[entity$])}

      {hasComponent(world, entity$, MaterialRef) &&
        row("Material", MaterialRef.ref[entity$])}

      {hasComponent(world, entity$, ObjectRef) &&
        row("Object", ObjectRef.ref[entity$])}

      {hasComponent(world, entity$, Terrain) && row("Kind", "Terrain")}
      {hasComponent(world, entity$, Animal) && row("Kind", "Animal")}
      {hasComponent(world, entity$, Camera) && row("Kind", "Camera")}
    </div>
  );
};

EntityInspector.displayName = "EntityInspector";

const styles = {
  container: {
    position: "absolute",
    top: "50%",
    right: "20px",
    transform: "translateY(-50%)",
    minWidth: "220px",
    padding: "12px 16px",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    borderRadius: "8px",
    color: "#fff",
    pointerEvents: "auto" as const,
  } satisfies React.CSSProperties,
  header: {
    fontFamily: "monospace",
    fontWeight: "bold",
    fontSize: "14px",
    marginBottom: "8px",
    borderBottom: "1px solid #444",
    paddingBottom: "6px",
  } satisfies React.CSSProperties,
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    fontSize: "12px",
    padding: "2px 0",
  } satisfies React.CSSProperties,
  label: {
    color: "#aaa",
  } satisfies React.CSSProperties,
  value: {
    fontFamily: "monospace",
  } satisfies React.CSSProperties,
};
