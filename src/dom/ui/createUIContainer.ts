// Creates the main UI container and manages visibility

export interface UIContainerConfig {
  tabContainer: HTMLDivElement;
}

export const createUIContainer = (config: UIContainerConfig): { container: HTMLDivElement; wireframeControl: HTMLDivElement } => {
  const uiContainer = document.createElement('div');
  uiContainer.style.cssText =
    'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: #fff;' +
    'padding: 15px; font-family: monospace; border-radius: 4px; z-index: 1000;';

  uiContainer.appendChild(config.tabContainer);

  // Wireframe control container - only visible in Water Flow mode
  const wireframeControl = document.createElement('div');
  wireframeControl.style.cssText =
    'margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2);' +
    'display: none; align-items: center; gap: 8px;';

  const wireframeCheckbox = document.createElement('input');
  wireframeCheckbox.type = 'checkbox';
  wireframeCheckbox.id = 'wireframe-toggle';
  wireframeCheckbox.checked = true;

  const wireframeLabel = document.createElement('label');
  wireframeLabel.htmlFor = 'wireframe-toggle';
  wireframeLabel.textContent = 'Show Wireframe';
  wireframeLabel.style.cssText = 'cursor: pointer; font-size: 12px;';

  wireframeControl.appendChild(wireframeCheckbox);
  wireframeControl.appendChild(wireframeLabel);

  uiContainer.appendChild(wireframeControl);

  return { container: uiContainer, wireframeControl };
};
