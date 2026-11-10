import { describe, expect, it } from 'vitest';
import { petStat } from '../src/world.ts';

describe('the page\'s stats message', () => {
  it('passes a hover press and a closed menu on, with fields of the wrong kind made safe', () => {
    expect(petStat({ t: 'stats', hover: 'chat' })).toEqual({ hover: 'chat' });
    expect(petStat({
      t: 'stats',
      menu: { fromHover: 1, firstClickMs: -5, clicks: [{ id: 'theme', pinned: true, slot: 2 }, { id: 3 }, { id: 'quit', slot: 1.5 }, null] },
    })).toEqual({
      menu: { fromHover: false, firstClickMs: null, clicks: [{ id: 'theme', pinned: true, slot: 2 }, { id: 'quit', pinned: false, slot: null }] },
    });
  });

  it('is nothing for a message without a menu or a hover button', () => {
    expect(petStat({ t: 'stats' })).toBeNull();
    expect(petStat({ t: 'stats', menu: { clicks: 'all' } })).toBeNull();
  });
});
