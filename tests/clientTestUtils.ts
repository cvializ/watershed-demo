export const test = async (_label: string, _cb: (label: string) => void | Promise<void>) => {
  return await _cb(_label); // semantic wrapper around test functions
};
