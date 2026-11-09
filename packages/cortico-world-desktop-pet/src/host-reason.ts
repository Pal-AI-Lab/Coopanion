/**
 * Why the pet window is not there (`HostState.reason` in window-host.ts), and its wording. Imports nothing,
 * so the WebUI panels word it too.
 */
/** Why the window is not there; `error` carries the system's own message. */
export type HostReason =
  | { kind: 'badHostEnv'; env: string }
  | { kind: 'noElectronFile'; file: string }
  | { kind: 'noElectron' }
  | { kind: 'startFailed'; why: string }
  | { kind: 'closed' }
  | { kind: 'exited'; code: number | null }
  | { kind: 'error'; message: string };

/** The words for each reason, in one language. */
export interface HostReasonText {
  badHostEnv: (env: string) => string;
  noElectronFile: (file: string) => string;
  noElectron: string;
  startFailed: (why: string) => string;
  closed: string;
  exited: (code: number | null) => string;
}

export function describeHostReason(t: HostReasonText, reason: HostReason): string {
  switch (reason.kind) {
    case 'badHostEnv': return t.badHostEnv(reason.env);
    case 'noElectronFile': return t.noElectronFile(reason.file);
    case 'noElectron': return t.noElectron;
    case 'startFailed': return t.startFailed(reason.why);
    case 'closed': return t.closed;
    case 'exited': return t.exited(reason.code);
    case 'error': return reason.message;
  }
}
