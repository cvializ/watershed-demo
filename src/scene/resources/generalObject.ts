export const GeneralObjectEnum = {
  Camera: "Camera",
  SunLight: "SunLight",
} as const;

export type GeneralObjectEnum = (typeof GeneralObjectEnum)[keyof typeof GeneralObjectEnum];