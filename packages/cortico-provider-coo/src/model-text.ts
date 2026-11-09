/** What the bot reads from this provider, in English alone. */

/** Follows the `[blob …]` line of an image the request goes out without. */
export const imageLeftOut = (handle: string): string =>
  `[${handle} left out: the model service rejected the request that carried this image]`;
