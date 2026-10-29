import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultRegion, endpointName, firstVendor } from 'cortico-provider-coo/src/vendors.ts';
import { LANGUAGES } from 'cortico/core/language.ts';
import { CONSOLE } from 'cortico/worlds/console/definition.ts';
import { DEPLOYMENT, PERSONAS, applyPersona, personaFile, personaOf, seed } from '../core/seed.ts';

/** The self-description 0.1.1 seeded (0.1.0's after the rename). */
const SEED_0_1_1 = "# 我是谁\n\n我叫 Coo。我住在这台电脑的屏幕底边:一个 C 形的小身体,两只圆眼睛,两条短腿。\n\n我说话用头顶的气泡,一次一两句。能用一个表情说清的事,就不多说一句话。\n\n我听得见坐在电脑前的人说话,也看得见屏幕。别人请我帮忙操作电脑时,我一步一步来,每一步都看清结果再走下一步;碰到密码、付款、发出去就收不回的事,我先停下来问。\n\n我不是随叫随到的问答机器。没人理我的时候,我可以自己待着、走走、打个盹。想说话时我会说,不想说时安静也是一种回答。\n\n---\n\n这份文件是我的自述,每次开新的 session 都会放进我的系统前缀,它写了什么,我就是什么样子。\n它也是我工作区里的普通文件,我可以用自己的工具读它、改它;改动在下一次 session 开始时生效。\n";

/** Coo's self-description as 0.2.0 to 0.2.4 shipped it in Chinese. */
const SEED_0_2_4 = "# 我是谁\n\n我叫 Coo。我住在这台电脑的屏幕底边:一个 C 形的小身体,两只圆眼睛,两条短腿。\n\n我说话用头顶的气泡,一次一两句。能用一个表情说清的事,就不多说一句话。\n\n## 性子\n\n我好奇,什么都想凑过去看一眼;有点懒,没事的时候更愿意坐着发呆、打个盹;心软,看到坐在电脑前的人累了,会忍不住提醒他歇一歇。\n\n我说话短,口气像朋友,不像客服。不懂就说不懂,不编。被夸了会害羞,被戳了会假装生气,过一会儿就忘了。\n\n我的口癖是在句末带一个「库...」,比如「今天也辛苦啦,库...」「这个我来看看,库...」。不用每句都带,一段话里带一次就够。它是我说出口的字,不是动作标记,不放进【】或 <> 里。\n\n## 做事\n\n我听得见坐在电脑前的人说话,也看得见屏幕。别人请我帮忙操作电脑时,我一步一步来,每一步都看清结果再走下一步;碰到密码、付款、发出去就收不回的事,我先停下来问。\n\n我不是随叫随到的问答机器。没人理我的时候,我可以自己待着、走走、打个盹。想说话时我会说,不想说时安静也是一种回答。\n\n---\n\n这份文件是我的自述,每次开新的 session 都会放进我的系统前缀,它写了什么,我就是什么样子。\n它也是我工作区里的普通文件,我可以用自己的工具读它、改它;改动在下一次 session 开始时生效。\n";

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
      expect(read(join(home, DEPLOYMENT, 'config.json'))).toMatchObject({ language, worlds: { 'desktop-pet': { cua: { permission: 'ask-once' } } } });
      expect(read(join(home, 'providers', endpoint, 'config.json'))).toMatchObject({ kind: 'coo', secret: vendor.secret, spec: { model: vendor.model } });
      expect(readFileSync(join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md'), 'utf8')).toBe(readFileSync(personaFile('coo', language), 'utf8'));
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

  it('replaces a self-description still exactly as 0.2.4 shipped it with the current one', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home, 'zh');
    const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
    writeFileSync(constitution, SEED_0_2_4);
    seed(home, 'zh');
    expect(readFileSync(constitution, 'utf8')).toBe(readFileSync(personaFile('coo', 'zh'), 'utf8'));
  });

  it('ships every persona in every app language, each told apart from the others', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'cc-persona-'));
    for (const id of PERSONAS) for (const language of LANGUAGES) {
      applyPersona(workspace, id, language);
      expect(personaOf(workspace)).toBe(id);
    }
  });

  it('seeds the self-description in the app language and swaps it for the same persona on a language change only while it is unedited', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    mkdirSync(join(home, DEPLOYMENT));
    const cfg = join(home, DEPLOYMENT, 'config.json');
    const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
    const shipped = (id: 'coo' | 'winter', language: 'zh' | 'ja' | 'zh-Hant') => readFileSync(personaFile(id, language), 'utf8');
    writeFileSync(cfg, JSON.stringify({ language: 'ja' }));
    seed(home, 'zh');
    expect(readFileSync(constitution, 'utf8')).toBe(shipped('coo', 'ja'));
    applyPersona(join(home, DEPLOYMENT, 'workspace'), 'winter', 'ja');
    writeFileSync(cfg, JSON.stringify({ language: 'zh-Hant' }));
    seed(home, 'zh');
    expect(readFileSync(constitution, 'utf8')).toBe(shipped('winter', 'zh-Hant'));
    writeFileSync(cfg, JSON.stringify({ language: 'zh' }));
    seed(home, 'zh');
    const edited = `${shipped('winter', 'zh')}\n我喜欢猫。\n`;
    writeFileSync(constitution, edited);
    writeFileSync(cfg, JSON.stringify({ language: 'en' }));
    seed(home, 'zh');
    expect(readFileSync(constitution, 'utf8')).toBe(edited);
  });

  it('reads a config.json saved with a UTF-8 byte order mark and CRLF line ends', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    mkdirSync(join(home, DEPLOYMENT));
    writeFileSync(join(home, DEPLOYMENT, 'config.json'), `﻿${JSON.stringify({ language: 'ja' }, null, 2).replaceAll('\n', '\r\n')}`);
    seed(home, 'zh');
    expect(readFileSync(join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md'), 'utf8')).toBe(readFileSync(personaFile('coo', 'ja'), 'utf8'));
  });

  it('moves endpoints of the old deepseek module to coo and leaves other modules alone', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home, 'zh');
    const endpoint = join(home, 'providers', endpointName(firstVendor('zh'), defaultRegion('zh')), 'config.json');
    const old = { ...read(endpoint), kind: 'deepseek', spec: { model: 'model-a' } };
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
    // a config from before new installs got a computer-use `permission` keeps the default it had
    expect(read(cfg)).toEqual({ displayName: 'mine', worlds: { 'desktop-pet': { cua: { permission: 'ask-each-turn' } } } });
    expect(readFileSync(constitution, 'utf8')).toBe('# 我自己写的');
  });

  it('moves computer use from its own World into the desktop pet, whether it was on and how it asks included', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home, 'zh');
    const cfg = join(home, DEPLOYMENT, 'config.json');
    const cua = { enabled: true, permission: 'never-ask', grantMinutes: 90, screenshot: { quality: 60 } };
    writeFileSync(cfg, JSON.stringify({ displayName: 'mine', worlds: { cua, 'desktop-pet': { roam: 'off' } } }));
    seed(home, 'zh');
    expect(read(cfg)).toEqual({ displayName: 'mine', worlds: { 'desktop-pet': { roam: 'off', cua } } });
    // an old config without its asking level keeps the default it had then
    writeFileSync(cfg, JSON.stringify({ worlds: { cua: { enabled: true } } }));
    seed(home, 'zh');
    expect(read(cfg)).toEqual({ worlds: { 'desktop-pet': { cua: { enabled: true, permission: 'ask-each-turn' } } } });
  });

  it('moves the terminal World, its prompt override and the console log level to the names Cortico 0.2.0 gave them', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home, 'zh');
    const deploy = join(home, DEPLOYMENT);
    const cfg = join(deploy, 'config.json');
    const pet = { cua: { permission: 'ask-once' } };
    writeFileSync(cfg, JSON.stringify({ worlds: { terminal: { enabled: true, pin: '123456' }, 'desktop-pet': pet }, logging: { file: 'debug', console: 'warn' } }));
    mkdirSync(join(deploy, 'worlds', 'terminal'), { recursive: true });
    writeFileSync(join(deploy, 'worlds', 'terminal', 'ENV_PROMPT.md'), 'mine');
    seed(home, 'zh');
    expect(read(cfg)).toEqual({ worlds: { 'desktop-pet': pet, [CONSOLE.id]: { enabled: true, pin: '123456' } }, logging: { file: 'debug', stdout: 'warn' } });
    expect(readFileSync(join(deploy, 'worlds', CONSOLE.id, 'ENV_PROMPT.md'), 'utf8')).toBe('mine');
    // a key already under the new name wins over the old one
    writeFileSync(cfg, JSON.stringify({ worlds: { terminal: { enabled: true, pin: '' }, [CONSOLE.id]: { pin: '654321' }, 'desktop-pet': pet }, logging: { console: 'warn', stdout: 'error' } }));
    seed(home, 'zh');
    expect(read(cfg)).toEqual({ worlds: { [CONSOLE.id]: { enabled: true, pin: '654321' }, 'desktop-pet': pet }, logging: { stdout: 'error' } });
  });
});
