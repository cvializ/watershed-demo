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
  minDisplacementLabel?: HTMLLabelElement;
  minDisplacementInput?: HTMLInputElement;
  maxDisplacementLabel?: HTMLLabelElement;
  maxDisplacementInput?: HTMLInputElement;
}

export const createUIContainer = (config: UIContainerConfig): HTMLDivElement => {
  const uiContainer = document.createElement('div');
  uiContainer.style.cssText =
    'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: #fff;' +
    'padding: 15px; font-family: monospace; border-radius: 4px; z-index: 1000;';

  uiContainer.appendChild(config.tabContainer);
  uiContainer.appendChild(document.createElement('br'));

  if (config.minDisplacementLabel) {
    uiContainer.appendChild(config.minDisplacementLabel);
  }
  if (config.minDisplacementInput) {
    uiContainer.appendChild(config.minDisplacementInput);
  }
  if (config.maxDisplacementLabel) {
    uiContainer.appendChild(config.maxDisplacementLabel);
  }
  if (config.maxDisplacementInput) {
    uiContainer.appendChild(config.maxDisplacementInput);
  }

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
  const isSlopeMode = visualizationMode === 2;
  
  if (config.minSlopeLabel) config.minSlopeLabel.style.display = isSlopeMode ? 'block' : 'none';
  if (config.minSlopeInput) config.minSlopeInput.style.display = isSlopeMode ? 'block' : 'none';
  if (config.maxSlopeLabel) config.maxSlopeLabel.style.display = isSlopeMode ? 'block' : 'none';
  if (config.maxSlopeInput) config.maxSlopeInput.style.display = isSlopeMode ? 'block' : 'none';

  // Only show displacement controls in original/displacement mode
  const isDisplacementMode = visualizationMode === 0;
  if (config.minDisplacementLabel) config.minDisplacementLabel.style.display = isDisplacementMode ? 'block' : 'none';
  if (config.minDisplacementInput) config.minDisplacementInput.style.display = isDisplacementMode ? 'block' : 'none';
  if (config.maxDisplacementLabel) config.maxDisplacementLabel.style.display = isDisplacementMode ? 'block' : 'none';
  if (config.maxDisplacementInput) config.maxDisplacementInput.style.display = isDisplacementMode ? 'block' : 'none';
};