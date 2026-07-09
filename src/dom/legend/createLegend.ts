// Creates visualization and slope legends

export interface VisualizationLegend {
  element: HTMLDivElement;
  textElement: HTMLDivElement;
}

export const createVisualizationLegend = (): VisualizationLegend => {
  const legend = document.createElement('div');
  legend.id = 'visualizationLegend';
  legend.className = 'legend-base visualizationLegend';

  const legendText = document.createElement('div');
  legendText.id = 'legendText';
  legendText.className = 'legend-text';
  legendText.innerHTML = 'Low <span>&larr;</span> Height <span>&rarr;</span> High';

  legend.appendChild(legendText);
  document.body.appendChild(legend);

  return { element: legend, textElement: legendText };
};

export interface VelocityLegend {
  element: HTMLDivElement;
  textElement: HTMLDivElement;
}

export const createVelocityLegend = (): VelocityLegend => {
  const velocityLegend = document.createElement('div');
  velocityLegend.id = 'velocityLegend';
  velocityLegend.className = 'legend-base velocityLegend legend-base-visibility';

  const velocityLegendText = document.createElement('div');
  velocityLegendText.className = 'legend-text';
  velocityLegendText.innerHTML = 'Low <span>&larr;</span> Velocity <span>&rarr;</span> High';

  velocityLegend.appendChild(velocityLegendText);
  document.body.appendChild(velocityLegend);

  return { element: velocityLegend, textElement: velocityLegendText };
};

export interface SlopeLegend {
  element: HTMLDivElement;
  textElement: HTMLDivElement;
}

export const createSlopeLegend = (): SlopeLegend => {
  const slopeLegend = document.createElement('div');
  slopeLegend.id = 'slopeLegend';
  slopeLegend.className = 'legend-base slopeLegend legend-base-visibility';

  const slopeLegendText = document.createElement('div');
  slopeLegendText.className = 'legend-text';
  slopeLegendText.innerHTML = 'Flat (0°) <span>&larr;</span> Slope Angle <span>&rarr;</span> Steep (90°)';

  slopeLegend.appendChild(slopeLegendText);
  document.body.appendChild(slopeLegend);

  return { element: slopeLegend, textElement: slopeLegendText };
};

export const showVelocityLegend = (legend: { element: HTMLDivElement }): void => {
  legend.element.style.display = 'block';
};

export const showLegend = (legend: { element: HTMLDivElement }): void => {
  legend.element.style.display = 'block';
};

export const hideLegend = (legend: { element: HTMLDivElement }): void => {
  legend.element.style.display = 'none';
};