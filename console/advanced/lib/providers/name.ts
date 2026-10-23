/** New connection names are portable directory names; unchanged historical keys are exempt. */
export function validateProviderName(name: string): 'shape' | 'reserved' | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) return 'shape';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name)) return 'reserved';
  return null;
}
