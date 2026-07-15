// Creates diagnostic overlay for FPS and object count
import { createMaterialDropdown } from "./createMaterialDropdown";

export interface Overlay {
  element: HTMLDivElement;
  update: (fps: number, objectCount: number) => void;
}

export const createOverlay = (): Overlay => {
  // Create main overlay container with flex layout for horizontal adjacency
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #fff;" +
    "padding: 10px; font-family: monospace; border-radius: 4px; z-index: 1000;" +
    "display: flex; gap: 15px; align-items: center;";
  document.body.appendChild(overlay);

  // FPS and object count display (left side)
  const infoContainer = document.createElement("div");
  infoContainer.style.cssText = "font-size: 12px; white-space: nowrap;";

  // Material dropdown (right side)
  const materialDropdown = createMaterialDropdown();

  const update = (fps: number, objectCount: number): void => {
    infoContainer.textContent = `FPS: ${fps} | Objects: ${objectCount}`;
  };

  overlay.appendChild(infoContainer);
  overlay.appendChild(materialDropdown.container);

  return { element: overlay, update };
};
