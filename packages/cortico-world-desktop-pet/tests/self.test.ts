import { describe, expect, it } from 'vitest';
import { DESKTOP_PET_DEFAULTS, PET_ACTIONS } from '../src/config.ts';
import { PET_TEXT, petText } from '../src/i18n/index.ts';
import type { Language } from 'cortico/core/language.ts';
import { figurePacks } from '../src/packs.ts';
import { planSettings } from '../src/self.ts';

const cfg = () => structuredClone(DESKTOP_PET_DEFAULTS);
const packs = figurePacks([]).packs;

describe('pet_set', () => {
  it('names every hover button in the consent bubble, in every language', () => {
    // a language's file holds each group whole, so its consent names are its own
    for (const language of Object.keys(PET_TEXT) as Language[]) for (const id of PET_ACTIONS) expect(petText(language).consent.actions[id], `${language} ${id}`).toBeTruthy();
  });

  it('changes what reaches the person only after asking them', () => {
    const { changes } = planSettings({ roam: 'free', sound: false, scale: 1.5, bubbleSize: 1.2, fontSize: 1.2, theme: 'light', user: '小明', hoverButtons: ['chat'] }, cfg(), packs);
    expect(Object.fromEntries(changes.map((c) => [c.key, c.tier]))).toEqual({ roam: 'self', sound: 'ask', scale: 'ask', bubbleSize: 'ask', fontSize: 'ask', theme: 'ask', user: 'ask', hoverButtons: 'ask' });
  });

  it('refuses settings that are not the bot\'s', () => {
    const { changes, errors } = planSettings({ asr: { enabled: false }, rememberPosition: true }, cfg(), packs);
    expect(changes).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  it('takes a pack\'s picks only for that pack', () => {
    expect(planSettings({ figure: 'whale', scheme: 'claude' }, cfg(), packs).errors).toEqual([]);
    expect(planSettings({ scheme: 'claude' }, cfg(), packs).errors).toHaveLength(1);
  });

  it('takes every hover button away with an empty list, and still refuses unknown or repeated ones', () => {
    const { changes, errors } = planSettings({ hoverButtons: [] }, cfg(), packs);
    expect(errors).toEqual([]);
    expect(changes.map((c) => [c.tier, c.patch])).toEqual([['ask', { hoverButtons: '' }]]);
    expect(changes[0]!.show).toBe('去掉所有悬停按钮');
    expect(planSettings({ hoverButtons: ['chat', 'chat'] }, cfg(), packs).errors).toHaveLength(1);
    expect(planSettings({ hoverButtons: ['menu'] }, cfg(), packs).errors).toHaveLength(1);
    expect(planSettings({ hoverButtons: 'chat' }, cfg(), packs).errors).toHaveLength(1);
    // a list with nothing but non-strings is not an empty answer
    for (const hoverButtons of [[3], [null], ['chat', 3]]) expect(planSettings({ hoverButtons }, cfg(), packs).errors).toHaveLength(1);
    // already none: nothing to change
    expect(planSettings({ hoverButtons: [] }, { ...cfg(), hoverButtons: '' }, packs).changes).toEqual([]);
  });

  it('dresses Coo through its skin\'s own fields', () => {
    const { changes, errors } = planSettings({ scheme: 'fox-cat-none-none-none' }, cfg(), packs);
    expect(errors).toEqual([]);
    expect(changes.map((c) => c.patch)).toEqual([{ skin: { palette: 'fox', head: 'cat', side: 'none', glasses: 'none', neck: 'none' } }]);
  });
});
