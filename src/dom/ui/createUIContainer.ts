// Creates the main UI container and manages visibility

export interface UIContainerConfig {
  tabContainer: HTMLDivElement;
  minHeightLabel?: HTMLLabelElement;
  minHeightInput?: HTMLInputElement;
  maxHeightLabel?: HTMLLabelElement;
  maxHeightInput?: HTMLInputElement;
  minSlopeLabel?: HTMLLabelElement;
  minSlopeInput?: HTMLInputElement;
  maxSlopeLabel?: HTMLLabelElement;
  maxSlopeInput?: HTMLInputElement;
}

export const createUIContainer = (config: UIContainerConfig): HTMLDivElement => {
  const uiContainer = document.createElement('div');
  uiContainer.style.cssText =
    'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: #fff;' +
    'padding: 15px; font-family: monospace; border-radius: 4px; z-index: 1000;';

  uiContainer.appendChild(config.tabContainer);
  uiContainer.appendChild(document.createElement('br'));

  if (config.minSlopeLabel) {
    uiContainer.appendChild(config.minSlopeLabel);
  }
  if (config.minSlopeInput) {
    uiContainer.appendChild(config.minSlopeInput);
  }
  if (config.maxSlopeLabel) {
    uiContainer.appendChild(config.maxSlopeLabel);
  }
  if (config.maxSlopeInput) {
    uiContainer.appendChild(config.maxSlopeInput);
  }

  if (config.minHeightLabel) {
    uiContainer.appendChild(config.minHeightLabel);
  }
  if (config.minHeightInput) {
    uiContainer.appendChild(config.minHeightInput);
  }
  if (config.maxHeightLabel) {
    uiContainer.appendChild(config.maxHeightLabel);
  }
  if (config.maxHeightInput) {
    uiContainer.appendChild(config.maxHeightInput);
  }

  return uiContainer;
};

export const updateVisibility = (
  visualizationMode: number,
  config: UIContainerConfig
): void => {
  // Slope controls show in Slope mode (mode 1)
  const isSlopeMode = visualizationMode === 1;
  
  if (config.minSlopeLabel) config.minSlopeLabel.style.display = isSlopeMode ? 'block' : 'none';
  if (config.minSlopeInput) config.minSlopeInput.style.display = isSlopeMode ? 'block' : 'none';
  if (config.maxSlopeLabel) config.maxSlopeLabel.style.display = isSlopeMode ? 'block' : 'none';
  if (config.maxSlopeInput) config.maxSlopeInput.style.display = isSlopeMode ? 'block' : 'none';

  // Height controls show in Height mode (mode 0)
  const isHeightMode = visualizationMode === 0;
  if (config.minHeightLabel) config.minHeightLabel.style.display = isHeightMode ? 'block' : 'none';
  if (config.minHeightInput) config.minHeightInput.style.display = isHeightMode ? 'block' : 'none';
  if (config.maxHeightLabel) config.maxHeightLabel.style.display = isHeightMode ? 'block' : 'none';
  if (config.maxHeightInput) config.maxHeightInput.style.display = isHeightMode ? 'block' : 'none';
};