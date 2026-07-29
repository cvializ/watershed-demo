export const GeneralObjectEnum = {
  SunLight: "SunLight",
} as const;

export type GeneralObjectEnum = (typeof GeneralObjectEnum)[keyof typeof GeneralObjectEnum];