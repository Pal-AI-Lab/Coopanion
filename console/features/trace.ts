/**
 * 「运行轨迹」: Cortico's live page under the heading every page has (features/intro.ts); the live
 * band and the timeline below it keep the same content width (companion.css).
 */
import { liveFeature } from './live/index.ts';
import { intro } from './intro.ts';
import type { FeatureContext, FrameworkFeature } from './feature.ts';
import type { Disposable } from '../../shared/client-panel.ts';
import { L } from '../strings.ts';

async function mount(ctx: FeatureContext): Promise<void | Disposable> {
  const out = await liveFeature.mount(ctx);
  const view = ctx.root.querySelector(':scope > .liveview');
  if (view && !ctx.signal.aborted) view.prepend(intro(ctx.ui, L.trace));
  return out;
}

export const traceFeature: FrameworkFeature = { ...liveFeature, label: L.trace, mount };
