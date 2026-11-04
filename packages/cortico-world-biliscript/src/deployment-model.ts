/**
 * The deployment's own model as the writer (`writer.mode` = `deployment`): the endpoint that
 * `activeProvider` in the deployment's config.json names, opened through Cortico's provider modules
 * the way Core opens it, so its key, model, generation settings and protocol handling all apply.
 * The endpoint is read when a job reaches the writer step; switching endpoints affects later jobs.
 *
 * The endpoint table (`<providers root>/<name>/config.json`), the provider registry and the
 * Open Responses helpers are Cortico modules outside the World contract. A failure to read or open
 * the endpoint is thrown with its reason; the job then keeps speaker labels and states that reason.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Charge, ProviderAttempt } from 'cortico/core/generation.ts';
import { GenerationError } from 'cortico/core/generation.ts';
import type { LLMProviderEntry, LLMUsage, Logger } from 'cortico/core/types.ts';
import { providersRoot } from 'cortico/paths.ts';
import { ProviderRegistry } from 'cortico/providers/registry.ts';
import { itemText, message } from 'cortico/protocol/open-responses/context.ts';
import { responseRequest, usageCounters } from 'cortico/protocol/open-responses/context-helpers.ts';
import type { ChatClient } from './writer.ts';

export interface DeploymentModelOptions {
  /** Deployment directory; its config.json names the active endpoint. */
  botDir: string;
  repoRoot: string;
  log: Logger;
  onUsage(usage: LLMUsage, model: string, charges: readonly Charge[]): void;
  /** Directories that hold endpoint directories, searched in order. Default: Cortico's shared providers root, then `<botDir>/providers`. */
  providersDirs?: readonly string[];
}

/** Request role written to Core's provider logs. */
const ROLE = 'biliscript';

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

/** The active endpoint: its name, the directory holding its directory, and its entry. */
export function activeEndpoint(
  botDir: string,
  providersDirs: readonly string[] = [providersRoot(), join(botDir, 'providers')],
): { name: string; root: string; entry: LLMProviderEntry } {
  const configFile = join(botDir, 'config.json');
  const name = existsSync(configFile) ? readJson(configFile).activeProvider : undefined;
  if (typeof name !== 'string' || !name) throw new Error(`${configFile} names no active model endpoint (activeProvider)`);
  const root = providersDirs.find((dir) => existsSync(join(dir, name, 'config.json')));
  if (!root) throw new Error(`model endpoint "${name}" has no config.json under ${providersDirs.join(' or ')}`);
  const entry = readJson(join(root, name, 'config.json')) as unknown as LLMProviderEntry;
  if (!entry.spec?.model) throw new Error(`model endpoint "${name}" has no model selected`);
  return { name, root, entry };
}

/**
 * Opens the active endpoint. Throws when it cannot be read or its provider module is not
 * registered in this process.
 */
export function openDeploymentModel(o: DeploymentModelOptions): ChatClient {
  const { name, root, entry } = activeEndpoint(o.botDir, o.providersDirs);
  const spec = entry.spec!;
  const registry = new ProviderRegistry(() => ({ [name]: entry }), {
    stateRoot: root,
    repoRoot: o.repoRoot,
    readBlob: () => null,
    keepThinking: () => false,
    log: o.log,
  });
  const client = registry.bind(name);
  const report = (attempts: readonly ProviderAttempt[]) => {
    for (const a of attempts) o.onUsage(usageCounters(a.meters), spec.model, a.charges);
  };
  return {
    model: `${spec.model} (${name})`,
    async chat(req, signal) {
      const context = [message('system', req.system), message('user', req.user)];
      let generation;
      try {
        generation = await client.respond(responseRequest(spec, context), {
          role: ROLE,
          context,
          nativeSpec: spec,
          signal,
          onEvent: () => {},
        });
      } catch (err) {
        if (err instanceof GenerationError) report(err.attempts);
        throw err;
      }
      report(generation.attempts);
      const { response } = generation;
      if (response.status === 'incomplete') {
        throw new Error(`the reply was cut off (${response.incomplete_details?.reason ?? 'no reason given'})`);
      }
      return response.output.filter((item) => item.type === 'message').map(itemText).join('');
    },
  };
}
