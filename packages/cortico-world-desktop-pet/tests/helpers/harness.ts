/**
 * A bot for end-to-end tests of a World through Cortico Core: real Core, real event store,
 * real tool dispatch and blob interning; only the model is scripted. The script sees the
 * context Core sends (`options.context`) and answers with tool calls or text.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBot, type Bot, type BotDefinition } from 'cortico/bot.ts';
import { CORE_DEFAULTS } from 'cortico/core/config.ts';
import type { LoadedConfig } from 'cortico/core/config.ts';
import type { Generation, GenerateOptions, ProviderAttempt, ResponseClient } from 'cortico/core/generation.ts';
import type { BlobStore, CoreApi, CoreConfig, Persona, PrefixSegment, SessionDecl, SystemPrefixContext, ToolDef, World } from 'cortico/core/types.ts';
import { createResponse, type Request } from 'cortico/protocol/open-responses/index.ts';
import { withWorlds, type WorldDefinition, type WorldSection } from 'cortico/world.ts';

export type Step = { calls: Array<{ name: string; args?: Record<string, unknown> }> } | { text: string };

/** What the script sees on each model call. */
export interface Turn {
  n: number;
  /** Context records as Core sent them (items with per-record context such as blobs). */
  records: Array<{ item: Record<string, unknown>; context?: { blobs?: Array<{ mime: string; handle: string }> } }>;
  /** Tool names offered in this request. */
  tools: string[];
}

let seq = 0;

export class ScriptedModel implements ResponseClient {
  readonly turns: Turn[] = [];
  constructor(private readonly script: (turn: Turn) => Step) {}

  async respond(request: Request, options: GenerateOptions = {}): Promise<Generation> {
    const turn: Turn = {
      n: this.turns.length,
      records: (options.context ?? []) as unknown as Turn['records'],
      tools: ((request.tools ?? []) as Array<{ name?: string }>).map((t) => t.name ?? ''),
    };
    this.turns.push(turn);
    const step = this.script(turn);
    const response = createResponse(`resp_${++seq}`, request);
    response.status = 'completed';
    response.output = ('text' in step
      ? [{ type: 'message', id: `msg_${seq}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: step.text, annotations: [] }] }]
      : step.calls.map((c, i) => ({ type: 'function_call', id: `fc_${seq}_${i}`, call_id: `call_${seq}_${i}`, name: c.name, arguments: JSON.stringify(c.args ?? {}), status: 'completed' }))) as never;
    const origin = { instance: 'scripted', module: 'scripted', model: 'scripted', compatibilityDomain: 'scripted' };
    const attempt: ProviderAttempt = {
      id: `att_${seq}`, generationId: response.id, ordinal: 0, origin, startedAt: new Date().toISOString(), elapsedMs: 0,
      requestId: null, responseId: response.id, outcome: 'completed', status: 200, serviceTier: null, charges: [],
      meters: { input: null, output: null, total: null, cachedInput: null, uncachedInput: null, reasoning: null, native: null },
    };
    return { response, origin, attempts: [attempt] } as Generation;
  }
}

class MemoryBlobs implements BlobStore {
  private readonly map = new Map<string, { bytes: Uint8Array; mime: string }>();
  put(name: string, bytes: Uint8Array, mime: string): string {
    const handle = `mem:blobs/${name}`;
    this.map.set(handle, { bytes, mime });
    return handle;
  }
  get(handle: string) { return this.map.get(handle) ?? null; }
  list() { return [...this.map].map(([handle, b]) => ({ handle, mime: b.mime, size: b.bytes.length })); }
}

/** One persistent session: World environment prompts in the prefix, World tools plus end_turn. */
class TestPersona implements Persona {
  readonly memoryDir: string;
  readonly blobs = new MemoryBlobs();
  constructor(memoryDir: string, private readonly worlds: readonly World[]) { this.memoryDir = memoryDir; }
  attach(_core: CoreApi): void {}
  async systemSegments(ctx: SystemPrefixContext): Promise<PrefixSegment[]> {
    return [{ title: 'PREFIX', text: ctx.worlds.map((w) => `## ${w.id}\n${w.envPrompt}`).join('\n\n') || 'no worlds' }];
  }
  declareSessions(): SessionDecl[] {
    const endTurn: ToolDef = {
      name: 'end_turn', description: 'End this turn.', tags: ['flow'], barrierAfter: true, endsTurn: true,
      parameters: { type: 'object', properties: {}, required: [] }, handler: async () => '[turn ended]',
    };
    return [{ id: 'main', label: 'main', rounds: () => ({ soft: 20, hard: 40 }), persistent: true, receivesEvents: true, tools: () => [...this.worlds.flatMap((w) => w.tools()), endTurn] }];
  }
  ownToolNames(): string[] { return ['end_turn']; }
}

/** A World that pushes one external event when mounted, to wake the bot. */
export function triggerWorld(text: string): WorldDefinition<WorldSection> {
  return {
    id: 'e2e',
    label: 'e2e',
    defaults: () => ({ enabled: false }),
    create: () => ({
      id: 'e2e',
      envPromptVars: () => null,
      tools: () => [],
      start: async (host) => {
        await host.pushEvent({ type: 'e2e.request', source: 'e2e', senderKey: 'e2e', ts: new Date().toISOString(), text }, { trigger: 'flush' });
      },
      stop: async () => {},
    }),
  };
}

export async function startBot(opts: {
  worlds: WorldDefinition<WorldSection>[];
  sections?: Record<string, unknown>;
  model: ScriptedModel;
  /** The deployment root; another bot started on it restores the session. */
  root?: string;
}): Promise<Bot<CoreConfig>> {
  const root = opts.root ?? mkdtempSync(join(tmpdir(), 'cortico-e2e-'));
  const ids = opts.worlds.map((w) => w.id);
  const base: BotDefinition<CoreConfig> = {
    id: 'e2e',
    declares: ids,
    defaults: () => ({
      ...CORE_DEFAULTS,
      displayName: 'e2e',
      providers: { scripted: { kind: 'openai-responses-compat', baseUrl: 'https://model.test', spec: { model: 'scripted', thinking: false }, multimodal: true } },
      activeProvider: 'scripted',
      paths: { memory: 'memory', data: 'data' },
      web: { port: 0, theme: 'mint' },
    } as CoreConfig),
    build: (loaded, worlds) => ({ persona: new TestPersona(loaded.memoryDir, worlds), llm: opts.model, console: { enabled: false } }),
  };
  const definition = withWorlds(base, opts.worlds);
  const config = definition.defaults() as CoreConfig & { worlds: Record<string, Record<string, unknown>> };
  for (const [id, patch] of Object.entries(opts.sections ?? {})) Object.assign(config.worlds[id], patch);
  const loaded: LoadedConfig<CoreConfig> = {
    config,
    secret: (name) => (name === 'CORTICO_WEB_PASSWORD' ? '' : 'fake-key'),
    rootDir: root,
    memoryDir: join(root, 'memory'),
    dataDir: join(root, 'data'),
  };
  const bot = createBot(loaded, definition);
  await bot.start();
  return bot;
}
