import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultRegion, endpointName, firstVendor } from 'cortico-provider-coo/src/vendors.ts';
import { CONSTITUTION_SEEDS, DEPLOYMENT, SEED_DIR, seed } from '../core/seed.ts';

/** The self-description 0.1.1 seeded (0.1.0's after the rename). */
const SEED_0_1_1 = "# 我是谁\n\n我叫 Coo。我住在这台电脑的屏幕底边:一个 C 形的小身体,两只圆眼睛,两条短腿。\n\n我说话用头顶的气泡,一次一两句。能用一个表情说清的事,就不多说一句话。\n\n我听得见坐在电脑前的人说话,也看得见屏幕。别人请我帮忙操作电脑时,我一步一步来,每一步都看清结果再走下一步;碰到密码、付款、发出去就收不回的事,我先停下来问。\n\n我不是随叫随到的问答机器。没人理我的时候,我可以自己待着、走走、打个盹。想说话时我会说,不想说时安静也是一种回答。\n\n---\n\n这份文件是我的自述,每次开新的 session 都会放进我的系统前缀,它写了什么,我就是什么样子。\n它也是我工作区里的普通文件,我可以用自己的工具读它、改它;改动在下一次 session 开始时生效。\n";

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

describe('first-run seed', () => {
  it('creates the deployment in its language, the endpoint of the first service for that language without a key, and the constitution', () => {
    for (const language of ['zh', 'en'] as const) {
      const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
      const vendor = firstVendor(language), endpoint = endpointName(vendor, defaultRegion(language));
      seed(home, language);
      expect(read(join(home, DEPLOYMENT, 'deployment.json'))).toEqual({ bot: 'cormini' });
      expect(read(join(home, DEPLOYMENT, 'config.json'))).toMatchObject({ activeProvider: endpoint, language });
      // the next start, in another system language, leaves a new install's language and computer-use asking as seeded
      seed(home, language === 'zh' ? 'en' : 'zh');
      expect(read(join(home, DEPLOYMENT, 'config.json'))).toMatchObject({ language, worlds: { cua: { permission: 'ask-once' } } });
      expect(read(join(home, 'providers', endpoint, 'config.json'))).toMatchObject({ kind: 'coo', secret: vendor.secret, spec: { model: vendor.model } });
      expect(readFileSync(join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md'), 'utf8')).toBe(readFileSync(join(SEED_DIR, CONSTITUTION_SEEDS[language]), 'utf8'));
      expect(readFileSync(join(home, DEPLOYMENT, 'avatar.png')).subarray(1, 4).toString()).toBe('PNG');
    }
  });

  it('replaces a self-description still exactly as 0.1.1 seeded it, CRLF or LF', () => {
    for (const eol of ['\n', '\r\n']) {
      const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
      seed(home, 'zh');
      const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
      writeFileSync(constitution, SEED_0_1_1.replaceAll('\n', eol));
      seed(home, 'zh');
      expect(readFileSync(constitution, 'utf8')).toContain('「库...」');
    }
  });

  it('seeds the self-description in the model-text language and swaps it on a language change only while it is unedited', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    mkdirSync(join(home, DEPLOYMENT));
    const cfg = join(home, DEPLOYMENT, 'config.json');
    const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
    const shipped = (language: 'zh' | 'en') => readFileSync(join(SEED_DIR, CONSTITUTION_SEEDS[language]), 'utf8');
    writeFileSync(cfg, JSON.stringify({ language: 'ja' }));
    seed(home, 'zh');
    expect(readFileSync(constitution, 'utf8')).toBe(shipped('en'));
    writeFileSync(cfg, JSON.stringify({ language: 'zh-Hant' }));
    seed(home, 'zh');
    expect(readFileSync(constitution, 'utf8')).toBe(shipped('zh'));
    const edited = `${shipped('zh')}\n我喜欢猫。\n`;
    writeFileSync(constitution, edited);
    writeFileSync(cfg, JSON.stringify({ language: 'en' }));
    seed(home, 'zh');
    expect(readFileSync(constitution, 'utf8')).toBe(edited);
  });

  it('moves endpoints of the old deepseek module to coo and leaves other modules alone', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home, 'zh');
    const endpoint = join(home, 'providers', endpointName(firstVendor('zh'), defaultRegion('zh')), 'config.json');
    const old = { ...read(endpoint), kind: 'deepseek', spec: { model: 'deepseek-v4-pro' } };
    writeFileSync(endpoint, JSON.stringify(old));
    const other = join(home, 'providers', 'mine', 'config.json');
    mkdirSync(join(home, 'providers', 'mine'));
    writeFileSync(other, JSON.stringify({ kind: 'openai-compatible', baseUrl: 'http://x' }));
    seed(home, 'zh');
    expect(read(endpoint)).toEqual({ ...old, kind: 'coo' });
    expect(read(other)).toEqual({ kind: 'openai-compatible', baseUrl: 'http://x' });
  });

  it('leaves files the operator already has', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home, 'zh');
    const cfg = join(home, DEPLOYMENT, 'config.json');
    writeFileSync(cfg, JSON.stringify({ displayName: 'mine' }));
    const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
    writeFileSync(constitution, '# 我自己写的');
    seed(home, 'zh');
    // a config from before new installs got `worlds.cua.permission` keeps the default it had
    expect(read(cfg)).toEqual({ displayName: 'mine', worlds: { cua: { permission: 'ask-each-turn' } } });
    expect(readFileSync(constitution, 'utf8')).toBe('# 我自己写的');
  });
});
