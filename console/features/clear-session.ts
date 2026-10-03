/**
 * 「系统提示词」 with a 「清空重开」 button beside the upstream 「重载当前 session」: reloading swaps
 * the prefix and keeps the conversation; this one drops the conversation and starts Coo afresh from
 * the current prompt. It clears the `session` storage part (`core.loop.clearSession`), the same one
 * the advanced mode's Core page lists under data; the workspace, Coo's memory and persona, stays.
 */
import { post } from '../core/api.ts';
import { pick } from '../core/language.ts';
import { promptsFeature } from './prompts/index.ts';
import type { FeatureContext, FrameworkFeature } from './feature.ts';

const S = pick({
  zh: {
    button: '清空重开',
    title: '清空当前对话,让 Coo 从头开始?',
    body: 'Coo 会忘掉这段对话的上下文,按现在的系统提示词重新开始,不能撤销。工作区里的记忆和人设都保留。',
    clearing: '正在清空…',
    cleared: '已清空重开',
    failed: (why: string) => `没清空:${why}`,
  },
  en: {
    button: 'Clear and restart',
    title: 'Clear this conversation and start Coo afresh?',
    body: 'Coo forgets the context of this conversation and starts again from the current system prompt. This cannot be undone. Memory and persona in the workspace stay.',
    clearing: 'Clearing…',
    cleared: 'Cleared and restarted',
    failed: (why: string) => `Not cleared: ${why}`,
  },
});

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
