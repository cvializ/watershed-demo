// Creates input controls for visualization parameters

export interface HeightControls {
  minLabel: HTMLLabelElement;
  minInput: HTMLInputElement;
  maxLabel: HTMLLabelElement;
  maxInput: HTMLInputElement;
  updateCallback: (minHeight: number, maxHeight: number) => void;
}

export const createHeightControls = (
  updateCallback: (minHeight: number, maxHeight: number) => void
): HeightControls => {
  const minHeightLabel = document.createElement('label');
  minHeightLabel.textContent = 'Compute Shader Min Height:';
  minHeightLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

  const minHeightInput = document.createElement('input');
  minHeightInput.type = 'number';
  minHeightInput.value = '-1.5';
  minHeightInput.placeholder = 'Min Height';
  minHeightInput.title = 'Minimum height value for color mapping in compute shader';
  minHeightInput.style.cssText = 'display: block; margin-bottom: 8px; padding: 4px; width: 100%;';

  const maxHeightLabel = document.createElement('label');
  maxHeightLabel.textContent = 'Compute Shader Max Height:';
  maxHeightLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

  const maxHeightInput = document.createElement('input');
  maxHeightInput.type = 'number';
  maxHeightInput.value = '2.0';
  maxHeightInput.placeholder = 'Max Height';
  maxHeightInput.title = 'Maximum height value for color mapping in compute shader';
  maxHeightInput.style.cssText = 'display: block; margin-bottom: 4px; padding: 4px; width: 100%;';

  const updateHeightRange = () => {
    updateCallback(parseFloat(minHeightInput.value), parseFloat(maxHeightInput.value));
  };

  minHeightInput.addEventListener('change', updateHeightRange);
  maxHeightInput.addEventListener('change', updateHeightRange);

  return {
    minLabel: minHeightLabel,
    minInput: minHeightInput,
    maxLabel: maxHeightLabel,
    maxInput: maxHeightInput,
    updateCallback: updateHeightRange,
  };
};

export interface SlopeControls {
  minLabel: HTMLLabelElement;
  minInput: HTMLInputElement;
  maxLabel: HTMLLabelElement;
  maxInput: HTMLInputElement;
}

export const createSlopeControls = (
  updateCallback: (minSlope: number, maxSlope: number) => void
): SlopeControls => {
  const minSlopeLabel = document.createElement('label');
  minSlopeLabel.textContent = 'Min Slope:';
  minSlopeLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

  const minSlopeInput = document.createElement('input');
  minSlopeInput.type = 'number';
  minSlopeInput.value = '0.0';
  minSlopeInput.placeholder = 'Min Slope';
  minSlopeInput.title = 'Minimum slope value for color mapping in slope visualization';
  minSlopeInput.style.cssText = 'display: block; margin-bottom: 8px; padding: 4px; width: 100%;';

  const maxSlopeLabel = document.createElement('label');
  maxSlopeLabel.textContent = 'Max Slope:';
  maxSlopeLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

  const maxSlopeInput = document.createElement('input');
  maxSlopeInput.type = 'number';
  maxSlopeInput.value = '2.0';
  maxSlopeInput.placeholder = 'Max Slope';
  maxSlopeInput.title = 'Maximum slope value for color mapping in slope visualization';
  maxSlopeInput.style.cssText = 'display: block; margin-bottom: 4px; padding: 4px; width: 100%;';

  const updateSlopeRange = () => {
    updateCallback(parseFloat(minSlopeInput.value), parseFloat(maxSlopeInput.value));
  };

  minSlopeInput.addEventListener('change', updateSlopeRange);
  maxSlopeInput.addEventListener('change', updateSlopeRange);

  return {
    minLabel: minSlopeLabel,
    minInput: minSlopeInput,
    maxLabel: maxSlopeLabel,
    maxInput: maxSlopeInput,
  };
};

export interface DisplacementControls {
  minLabel: HTMLLabelElement;
  minInput: HTMLInputElement;
  maxLabel: HTMLLabelElement;
  maxInput: HTMLInputElement;
}

export const createDisplacementControls = (
  updateCallback: (minDisp: number, maxDisp: number) => void
): DisplacementControls => {
  const minDisplacementLabel = document.createElement('label');
  minDisplacementLabel.textContent = 'Min Displacement:';
  minDisplacementLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

  const minDisplacementInput = document.createElement('input');
  minDisplacementInput.type = 'number';
  minDisplacementInput.value = '-1.5';
  minDisplacementInput.title = 'Minimum displacement value (vertical offset)';
  minDisplacementInput.style.cssText = 'display: block; margin-bottom: 8px; padding: 4px; width: 100%;';

  const maxDisplacementLabel = document.createElement('label');
  maxDisplacementLabel.textContent = 'Max Displacement:';
  maxDisplacementLabel.style.cssText = 'font-size: 12px; margin-bottom: 4px; display: block;';

  const maxDisplacementInput = document.createElement('input');
  maxDisplacementInput.type = 'number';
  maxDisplacementInput.value = '2.5';
  maxDisplacementInput.title = 'Maximum displacement value (height scale)';
  maxDisplacementInput.style.cssText = 'display: block; margin-bottom: 4px; padding: 4px; width: 100%;';

  const updateDisplacementRange = () => {
    updateCallback(parseFloat(minDisplacementInput.value), parseFloat(maxDisplacementInput.value));
  };

  minDisplacementInput.addEventListener('change', updateDisplacementRange);
  maxDisplacementInput.addEventListener('change', updateDisplacementRange);

  return {
    minLabel: minDisplacementLabel,
    minInput: minDisplacementInput,
    maxLabel: maxDisplacementLabel,
    maxInput: maxDisplacementInput,
  };
};