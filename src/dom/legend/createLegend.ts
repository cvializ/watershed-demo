// Creates visualization and slope legends

export interface VisualizationLegend {
  element: HTMLDivElement;
  textElement: HTMLDivElement;
}

export const createVisualizationLegend = (): VisualizationLegend => {
  const legend = document.createElement('div');
  legend.id = 'visualizationLegend';
  legend.style.cssText =
    'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);' +
    'width: 400px; height: 20px; background: linear-gradient(to right,' +
    'rgb(26,102,204) 0%,' +
    'rgb(153,153,153) 100%);' +
    'border-radius: 4px; border: 2px solid rgba(0,0,0,0.5); z-index: 1000;';

  const legendText = document.createElement('div');
  legendText.id = 'legendText';
  legendText.style.cssText =
    'position: absolute; bottom: -30px; width: 100%; text-align: center;' +
    'color: white; font-family: monospace; font-size: 12px; text-shadow: 1px 1px 2px black;';
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
  velocityLegend.style.cssText =
    'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);' +
    'width: 400px; height: 20px; background: linear-gradient(to right,' +
    'rgb(51,102,255) 0%,' +      // Blue - low velocity
    'rgb(51,255,102) 50%,' +      // Green - medium velocity
    'rgb(255,102,51) 100%);' +    // Red - high velocity
    'border-radius: 4px; border: 2px solid rgba(0,0,0,0.5); z-index: 1000; display: none;';

  const velocityLegendText = document.createElement('div');
  velocityLegendText.style.cssText =
    'position: absolute; bottom: -30px; width: 100%; text-align: center;' +
    'color: white; font-family: monospace; font-size: 12px; text-shadow: 1px 1px 2px black;';
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
  slopeLegend.style.cssText =
    'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);' +
    'width: 400px; height: 20px; background: linear-gradient(to right,' +
    'rgb(0,0,255) 0%,' +      // Blue - flat (0° slope)
    'rgb(128,0,128) 50%,' +   // Purple - medium slope
    'rgb(255,0,0) 100%);' +   // Red - steep (90° slope)
    'border-radius: 4px; border: 2px solid rgba(0,0,0,0.5); z-index: 1000; display: none;';

  const slopeLegendText = document.createElement('div');
  slopeLegendText.style.cssText =
    'position: absolute; bottom: -30px; width: 100%; text-align: center;' +
    'color: white; font-family: monospace; font-size: 12px; text-shadow: 1px 1px 2px black;';
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