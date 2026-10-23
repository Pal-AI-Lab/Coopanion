/**
 * A stand-in for the system recognizer's PowerShell helper: speaks its line protocol
 * (`B <id>` / `A <base64>` / `E` in; ready, partial and final JSON lines out).
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess, spawn } from 'node:child_process';

export interface FakeSapiScript {
  /** The text so far after `bytes` of audio in the sentence, or null for no partial line. */
  partial?: (bytes: number) => string | null;
  /** The sentence's text once it ends, from the audio it got. */
  final: (bytes: number) => string;
  /** First line; a `{"fatal":…}` makes the helper refuse to start. */
  first?: string;
  readyDelayMs?: number;
  exitDelayMs?: number;
}

export function fakeSapi(script: FakeSapiScript) {
  const spawned: Array<{ env: NodeJS.ProcessEnv | undefined; lines: string[]; child: ChildProcess }> = [];
  const spawnImpl = ((_exe: string, _args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), pid: 4242, exitCode: null as number | null,
      kill: () => { child.exitCode = 1; child.emit('exit', 1); return true; },
    });
    const record = { env: opts.env, lines: [] as string[], child: child as unknown as ChildProcess };
    spawned.push(record);
    const out = (o: Record<string, unknown>) => child.stdout.write(JSON.stringify(o) + '\n');
    let id = 0, bytes = 0, buf = '';
    child.stdin.on('data', (d: Buffer) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        record.lines.push(line);
        if (line.startsWith('B ')) { id = Number(line.slice(2)); bytes = 0; }
        else if (line.startsWith('A ')) {
          bytes += Buffer.from(line.slice(2), 'base64').length;
          const p = script.partial?.(bytes);
          if (p !== null && p !== undefined) out({ id, partial: p });
        } else if (line === 'E') out({ id, text: script.final(bytes) });
      }
    });
    child.stdin.on('finish', () => {
      const exit = () => { child.exitCode = 0; child.emit('exit', 0); };
      if (script.exitDelayMs) setTimeout(exit, script.exitDelayMs);
      else exit();
    });
    setTimeout(() => child.stdout.write((script.first ?? '{"ready":true,"culture":"zh-CN","name":"fake"}') + '\n'), script.readyDelayMs ?? 5);
    return child;
  }) as unknown as typeof spawn;
  return { spawnImpl, spawned };
}
