// Creates the main UI container and manages visibility

export interface UIContainerConfig {
  tabContainer: HTMLDivElement;
}

export const createUIContainer = (
  config: UIContainerConfig,
): {
  container: HTMLDivElement;
  wireframeControl: HTMLDivElement;
  materialControls: HTMLDivElement;
  velocityToggle: HTMLDivElement;
} => {
  const uiContainer = document.createElement("div");
  uiContainer.style.cssText =
    "position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: #fff;" +
    "padding: 15px; font-family: monospace; border-radius: 4px; z-index: 1000;";

  uiContainer.appendChild(config.tabContainer);

  // Wireframe control container - only visible in Water Flow mode
  const wireframeControl = document.createElement("div");
  wireframeControl.style.cssText =
    "margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2);" +
    "display: none; align-items: center; gap: 8px;";

  const wireframeCheckbox = document.createElement("input");
  wireframeCheckbox.type = "checkbox";
  wireframeCheckbox.id = "wireframe-toggle";
  wireframeCheckbox.checked = true;

  const wireframeLabel = document.createElement("label");
  wireframeLabel.htmlFor = "wireframe-toggle";
  wireframeLabel.textContent = "Show Wireframe";
  wireframeLabel.style.cssText = "cursor: pointer; font-size: 12px;";

  wireframeControl.appendChild(wireframeCheckbox);
  wireframeControl.appendChild(wireframeLabel);

  // Velocity control container - only visible in Water Flow mode
  const velocityToggle = document.createElement("div");
  velocityToggle.style.cssText = "display: flex; align-items: center; gap: 8px;";

  const velocityCheckbox = document.createElement("input");
  velocityCheckbox.type = "checkbox";
  velocityCheckbox.id = "velocity-toggle";
  velocityCheckbox.checked = false;

  const velocityLabel = document.createElement("label");
  velocityLabel.htmlFor = "velocity-toggle";
  velocityLabel.textContent = "Show Velocity";
  velocityLabel.style.cssText = "cursor: pointer; font-size: 12px;";

  velocityToggle.appendChild(velocityCheckbox);
  velocityToggle.appendChild(velocityLabel);

  wireframeControl.appendChild(velocityToggle);

  // Material selection container - only visible in Water Flow mode
  const materialControls = document.createElement("div");
  materialControls.style.cssText =
    "margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2);" +
    "display: none; flex-direction: column; gap: 6px;";

  // Material radio button container
  const materialGroup = document.createElement("div");
  materialGroup.style.cssText = "display: flex; flex-direction: column; gap: 4px;";

  const createMaterialOption = (id: string, label: string) => {
    const optionDiv = document.createElement("div");
    optionDiv.style.cssText = "display: flex; align-items: center; gap: 6px;";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "terrain-material";
    radio.id = id;
    radio.value = id;

    const labelEl = document.createElement("label");
    labelEl.htmlFor = id;
    labelEl.textContent = label;
    labelEl.style.cssText = "cursor: pointer; font-size: 12px;";

    optionDiv.appendChild(radio);
    optionDiv.appendChild(labelEl);
    return { container: optionDiv, radio };
  };

  const { container: defaultContainer, radio: defaultRadio } = createMaterialOption(
    "default",
    "Default (Water Flow)",
  );
  const { container: downslopeContainer, radio: _downslopeRadio } = createMaterialOption(
    "downslope",
    "Downslope Arrows",
  );
  const { container: slopeContainer, radio: _slopeRadio } = createMaterialOption(
    "slope",
    "Slope Visualization",
  );

  materialGroup.appendChild(defaultContainer);
  materialGroup.appendChild(downslopeContainer);
  materialGroup.appendChild(slopeContainer);

  // Set default selected (water flow)
  defaultRadio.checked = true;

  materialControls.appendChild(materialGroup);

  uiContainer.appendChild(wireframeControl);
  uiContainer.appendChild(materialControls);

  return { container: uiContainer, wireframeControl, materialControls, velocityToggle };
};
