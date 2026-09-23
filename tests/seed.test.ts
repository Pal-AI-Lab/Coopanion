import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEPLOYMENT, DISPLAY_NAME, ENDPOINT, KEY_NAME, seed } from '../core/seed.ts';

/** The self-description 0.1.1 seeded (0.1.0's after the rename). */
const SEED_0_1_1 = "# 我是谁\n\n我叫 Coo。我住在这台电脑的屏幕底边:一个 C 形的小身体,两只圆眼睛,两条短腿。\n\n我说话用头顶的气泡,一次一两句。能用一个表情说清的事,就不多说一句话。\n\n我听得见坐在电脑前的人说话,也看得见屏幕。别人请我帮忙操作电脑时,我一步一步来,每一步都看清结果再走下一步;碰到密码、付款、发出去就收不回的事,我先停下来问。\n\n我不是随叫随到的问答机器。没人理我的时候,我可以自己待着、走走、打个盹。想说话时我会说,不想说时安静也是一种回答。\n\n---\n\n这份文件是我的自述,每次开新的 session 都会放进我的系统前缀,它写了什么,我就是什么样子。\n它也是我工作区里的普通文件,我可以用自己的工具读它、改它;改动在下一次 session 开始时生效。\n";

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

describe('first-run seed', () => {
  it('creates the deployment, the DeepSeek endpoint without a key, and the constitution', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    expect(read(join(home, DEPLOYMENT, 'deployment.json'))).toEqual({ bot: 'cormini' });
    expect(read(join(home, DEPLOYMENT, 'config.json'))).toMatchObject({ activeProvider: ENDPOINT, language: 'zh' });
    expect(read(join(home, 'providers', ENDPOINT, 'config.json'))).toMatchObject({ kind: 'deepseek', secret: KEY_NAME, multimodal: true });
    expect(readFileSync(join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md'), 'utf8')).toContain('我叫 Coo');
    expect(readFileSync(join(home, DEPLOYMENT, 'avatar.png')).subarray(1, 4).toString()).toBe('PNG');
  });

  it('renames a deployment seeded with the old name in the config and the self-description', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    const cfg = join(home, DEPLOYMENT, 'config.json');
    writeFileSync(cfg, JSON.stringify({ ...read(cfg), displayName: '可缇' }));
    const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
    writeFileSync(constitution, '# 我是谁\n\n我叫可缇。可缇住在屏幕底边。\n');
    seed(home);
    expect(read(cfg).displayName).toBe(DISPLAY_NAME);
    expect(readFileSync(constitution, 'utf8')).toBe(`# 我是谁\n\n我叫 ${DISPLAY_NAME}。${DISPLAY_NAME}住在屏幕底边。\n`);
  });

  it('replaces a self-description still exactly as 0.1.1 seeded it, CRLF or LF', () => {
    for (const eol of ['\n', '\r\n']) {
      const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
      seed(home);
      const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
      writeFileSync(constitution, SEED_0_1_1.replaceAll('\n', eol));
      seed(home);
      expect(readFileSync(constitution, 'utf8')).toContain('「库...」');
    }
  });

  it('leaves files the operator already has', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    const cfg = join(home, DEPLOYMENT, 'config.json');
    writeFileSync(cfg, JSON.stringify({ displayName: 'mine' }));
    const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
    writeFileSync(constitution, '# 我自己写的');
    seed(home);
    expect(read(cfg)).toEqual({ displayName: 'mine' });
    expect(readFileSync(constitution, 'utf8')).toBe('# 我自己写的');
  });
});
