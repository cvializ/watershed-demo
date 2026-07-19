export const test = async (label: string, cb: (label: string) => void | Promise<void>) => {
  await cb(label); // semantic wrapper around test functions
};
