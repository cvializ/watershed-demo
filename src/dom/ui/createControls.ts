// Creates input controls for visualization parameters

export interface HeightControls {
  minLabel: HTMLLabelElement;
  minInput: HTMLInputElement;
  maxLabel: HTMLLabelElement;
  maxInput: HTMLInputElement;
  updateCallback: (minHeight: number, maxHeight: number) => void;
}
