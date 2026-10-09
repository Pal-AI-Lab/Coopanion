/**
 * 「系统提示词」 with a 「清空重开」 button beside the upstream 「重载当前 session」: reloading swaps
 * the prefix and keeps the conversation; this one drops the conversation and starts Coo afresh from
 * the current prompt. It clears the `session` storage part (`core.loop.clearSession`), the same one
 * the advanced mode's Core page lists under data; the workspace, Coo's memory and persona, stays.
 */
import { post } from '../core/api.ts';
import { promptsFeature } from './prompts/index.ts';
import { S } from './strings.ts';
import type { FeatureContext, FrameworkFeature } from './feature.ts';

async function mount(ctx: FeatureContext): Promise<void> {
  await promptsFeature.mount(ctx);
  const { ui, root, signal } = ctx;
  const toolbar = root.querySelector('.prompt-toolbar');
  if (!toolbar || signal.aborted || ctx.capabilities.storage !== true) return;
  const status = toolbar.querySelector('.msgline');
  const say = (text: string, bad = false) => {
    if (!status) return;
    status.className = bad ? 'msgline bad' : 'msgline';
    status.textContent = text;
  };
  const button = ui.button(S.button, {
    size: 'sm',
    variant: 'danger',
    onClick: () => void (async () => {
      if (!await ui.confirm({ title: S.title, body: S.body, danger: true }) || signal.aborted) return;
      const lock = ui.disable(button);
      say(S.clearing);
      try {
        const out = await post<{ result?: string }>('/api/storage/clear?key=session', undefined, { signal });
        say(out?.result || S.cleared);
      } catch (err) {
        if (!signal.aborted) say(S.failed(err instanceof Error ? err.message : String(err)), true);
      } finally {
        lock.dispose();
      }
    })(),
  });
  toolbar.appendChild(button);
}

export const promptsWithClearFeature: FrameworkFeature = { ...promptsFeature, navMode: 'primary', mount };
