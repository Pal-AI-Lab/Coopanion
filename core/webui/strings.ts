/**
 * Text of the coopanion World's panels, read by the panel bundle (client.ts) and by the World for
 * the panel's title. Imports nothing at run time outside this folder, so it bundles for the browser.
 * A language without a key reads `zh`'s for `zh-Hant` and `en`'s for the rest.
 */
import type { Language } from 'cortico/core/language.ts';
import { S as zhHant } from './strings.zh-Hant.ts';
import { S as ja } from './strings.ja.ts';
import { S as ko } from './strings.ko.ts';
import { S as fr } from './strings.fr.ts';
import { S as de } from './strings.de.ts';
import { S as es419 } from './strings.es-419.ts';
import { S as ptBR } from './strings.pt-BR.ts';
import { S as it } from './strings.it.ts';
import { S as ru } from './strings.ru.ts';

const zh = {
  title: '闹钟',
  desc: 'Coo 设的闹钟。在这里删除后，Coo 会收到通知。',
  setAt: '设定于',
  daily: '每天',
  empty: 'Coo 现在没有设闹钟。',
  remove: '删除',
  confirmTitle: (when: string) => `删除 ${when} 的闹钟？`,
  removed: '已删除',
  failed: (msg: string) => `删除失败：${msg}`,
  loadFailed: (msg: string) => `读取失败：${msg}`,
  search: '搜索内容或时间',
  noMatch: '没有符合的闹钟。',
  perPage: '每页显示',
  shown: (from: number, to: number, total: number) => `显示 ${from}–${to}，共 ${total} 条`,
  prevPage: '‹ 上一页',
  nextPage: '下一页 ›',
  pageOf: (page: number, pages: number) => `${page} / ${pages}`,
};

export const en: typeof zh = {
  title: 'Alarms',
  desc: 'Alarms Coo has set. Coo is told when you delete one here.',
  setAt: 'Set at',
  daily: 'Daily',
  empty: 'Coo has no alarms set.',
  remove: 'Delete',
  confirmTitle: (when) => `Delete the alarm at ${when}?`,
  removed: 'Deleted',
  failed: (msg) => `Could not delete: ${msg}`,
  loadFailed: (msg) => `Could not load: ${msg}`,
  search: 'Search notes or times',
  noMatch: 'No alarm matches.',
  perPage: 'Per page',
  shown: (from, to, total) => `${from}–${to} of ${total}`,
  prevPage: '‹ Previous',
  nextPage: 'Next ›',
  pageOf: (page, pages) => `${page} / ${pages}`,
};

export type PanelText = typeof en;

const OWN: Partial<Record<Language, Partial<PanelText>>> = { 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru };

export function panelText(language: Language = 'zh'): PanelText {
  const base = language === 'zh' || language === 'zh-Hant' ? zh : en;
  const own = OWN[language];
  if (!own) return base;
  return { ...base, ...Object.fromEntries(Object.entries(own).filter(([, value]) => value !== undefined)) };
}
