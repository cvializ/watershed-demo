// Creates the main UI container and manages visibility

export interface UIContainerConfig {
  tabContainer: HTMLDivElement;
}

export const createUIContainer = (config: UIContainerConfig): HTMLDivElement => {
  const uiContainer = document.createElement('div');
  uiContainer.style.cssText =
    'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: #fff;' +
    'padding: 15px; font-family: monospace; border-radius: 4px; z-index: 1000;';

  uiContainer.appendChild(config.tabContainer);

  return uiContainer;
};
