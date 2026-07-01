// Creates the tab bar for visualization mode switching

const modes = [
  { id: 0, name: '3D Displacement', hasLegend: true },
  { id: 1, name: 'Height', hasLegend: true },
  { id: 2, name: 'Slope', hasLegend: false },
  { id: 3, name: 'Verify (Normal)', hasLegend: false },
  { id: 4, name: 'Downslope Arrows', hasLegend: false },
  { id: 5, name: 'Water Flow', hasLegend: false },
];

export const createTabBar = (
  onModeChange: (mode: number) => void
): { container: HTMLDivElement; buttons: HTMLButtonElement[] } => {
  // Tab bar container
  const tabContainer = document.createElement('div');
  tabContainer.style.cssText =
    'display: flex; gap: 5px; margin-bottom: 10px; background: rgba(255,255,255,0.1); padding: 4px; border-radius: 6px;';

  const tabButtons: HTMLButtonElement[] = [];
  modes.forEach((mode) => {
    const tab = document.createElement('button');
    tab.textContent = mode.name;
    tab.style.cssText =
      'padding: 6px 12px; background: transparent; color: #aaa;' +
      'border: none; border-radius: 4px; cursor: pointer; font-size: 11px;' +
      'transition: all 0.2s; flex: 1;';
    tab.addEventListener('click', () => onModeChange(mode.id));
    tabContainer.appendChild(tab);
    tabButtons.push(tab);
  });

  return { container: tabContainer, buttons: tabButtons };
};

export const updateTabActiveState = (
  buttons: HTMLButtonElement[],
  activeIndex: number
): void => {
  buttons.forEach((tab, index) => {
    if (index === activeIndex) {
      tab.style.background = '#4CAF50';
      tab.style.color = 'white';
    } else {
      tab.style.background = 'transparent';
      tab.style.color = '#aaa';
    }
  });
};