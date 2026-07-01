// Creates diagnostic overlay for FPS and object count

export interface Overlay {
  element: HTMLDivElement;
  update: (fps: number, objectCount: number) => void;
}

export const createOverlay = (): Overlay => {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #fff;' +
    'padding: 10px; font-family: monospace; font-size: 12px; border-radius: 4px; z-index: 1000;';
  document.body.appendChild(overlay);

  const update = (fps: number, objectCount: number): void => {
    overlay.textContent = `FPS: ${fps} | Objects: ${objectCount}`;
  };

  return { element: overlay, update };
};