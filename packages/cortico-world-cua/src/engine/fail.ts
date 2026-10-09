/**
 * An engine error the bot reads in a receipt. The engine child does not know the model-text language,
 * so it sends `code` and `args`, and the World words them (`engineErrors` in model-text.ts).
 */
export type EngineErrorCode =
  | 'macScreenPermission' | 'macInputPermission' | 'macNoKey'
  | 'x11Display' | 'linuxNoScreenshot' | 'linuxPixelFormat' | 'linuxNoKey' | 'linuxNoXdotool'
  | 'winBitBlt' | 'winGetDIBits' | 'winSendInput';

export class EngineFailure extends Error {
  constructor(readonly code: EngineErrorCode, readonly args: Array<string | number> = []) {
    super(`${code}${args.length ? ` ${args.join(' ')}` : ''}`);
  }
}
