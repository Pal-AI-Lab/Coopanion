/**
 * 「语音输入」: the desktop-pet World's own `voice` panel (switch, talk key, microphone, level
 * meter, what it heard), mounted on its own without the World page around it, so the normal mode
 * reaches it without the World tree.
 */
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { S } from './strings.ts';

const PET_PAGE = 'world:desktop-pet';

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root } = ctx;
  root.classList.add('home');
  if (!ctx.consolePageHost) {
    root.append(ui.placeholder(S.unavailable));
    return;
  }
  const box = ui.h('div');
  root.append(box);
  const host = ctx.consolePageHost({ root: ui.h('div'), route: () => ['voice'] });
  await host.load();
  if (ctx.signal.aborted) return;
  ctx.lifecycle.own(await host.mountConnection(PET_PAGE, 'voice', box, {}, (context) => context));
}

export const voiceFeature: FrameworkFeature = {
  route: 'voice',
  label: S.nav,
  icon: 'activity',
  navMode: 'primary',
  mount,
};
