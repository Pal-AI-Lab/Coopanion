/**
 * 安卓引擎：把 PC 上 Win32 / X11 的那几个系统调用，转到平板自己的无障碍服务上。
 *
 * 平板上的 Coo 跑在 proot 里（linux），没有 X11，也没有 xdotool/scrot —— 于是桌面版
 * 那套"看屏幕、点鼠标"在这里全是失败。但安卓本身有这个能力，只是要通过
 * app 的 `CuaBridgeService`（无障碍）出去。这一层的职责就是在两者之间当"接头"：
 *
 *   displays()/capture()  → GET  http://127.0.0.1:18080/size、/screen?raw=1
 *   moveTo/buttonDown/Up  → POST /tap 或 /swipe
 *   wheel()               → POST /swipe（竖直方向模拟滚动）
 *
 * 插件（world / bot 扩展）不需要知道这些：它们调的仍是 CUA 的同一套工具，
 * 只是引擎从 win32.ts 换成了本文件（engine-child.ts 里由 `COO_ANDROID_CUA` 选择）。
 *
 * 同步性：engine 的接口是同步的（capture 直接回 bgra），而 HTTP 是异步的。proot 里
 * 没有 curl/wget，所以这里用一个一次性的 node 子进程去 fetch，把结果写进临时文件再读回来。
 * 每次调用大约多花 60–120 ms，对"看一眼屏幕 → 点一下"这种节奏没有影响。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NativeDisplay } from './display.ts';
import { EngineFailure } from './fail.ts';

const BASE = process.env.COO_ANDROID_CUA_URL ?? 'http://127.0.0.1:18080';
const TMP = mkdtempSync(join(tmpdir(), 'coo-cua-'));

const FETCH_BIN =
  'fetch(process.argv[1])' +
  '.then(r=>r.ok?r.arrayBuffer():Promise.reject(new Error("http "+r.status)))' +
  '.then(b=>require("fs").writeFileSync(process.argv[2],Buffer.from(b)))' +
  '.catch(e=>{console.error(e.message);process.exit(3)})';

const POST_TEXT =
  'fetch(process.argv[1],{method:"POST",headers:{"content-type":"application/json"},body:process.argv[2]})' +
  '.then(r=>r.text()).then(t=>process.stdout.write(t))' +
  '.catch(e=>{console.error(e.message);process.exit(3)})';

function fail(what: string, detail: string): never {
  throw new EngineFailure('noDisplay', [`android-bridge:${what}:${detail}`]);
}

/** 同步 GET → Buffer。 */
function get(path: string, name = 'out.bin'): Buffer {
  const out = join(TMP, name);
  const r = spawnSync(process.execPath, ['-e', FETCH_BIN, BASE + path, out], {
    timeout: 20_000,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    fail(path, (r.stderr || r.error?.message || `exit ${r.status}`).trim().slice(0, 160));
  }
  return readFileSync(out);
}

/** 同步 POST（JSON）。 */
function post(path: string, body: unknown): { status: number; text: string } {
  const r = spawnSync(process.execPath, ['-e', POST_TEXT, BASE + path, JSON.stringify(body)], {
    timeout: 15_000,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    fail(path, (r.stderr || r.error?.message || `exit ${r.status}`).trim().slice(0, 160));
  }
  return { status: 0, text: r.stdout ?? '' };
}

/* ---------- 屏幕 ---------- */

let sizeCache: { w: number; h: number; at: number } | null = null;

function screen(): { w: number; h: number } {
  const now = Date.now();
  if (sizeCache && now - sizeCache.at < 3000) return sizeCache;
  const j = JSON.parse(get('/size', 'size.json').toString('utf8')) as { width: number; height: number };
  if (!(j.width > 0 && j.height > 0)) fail('/size', 'no-size');
  sizeCache = { w: j.width, h: j.height, at: now };
  return sizeCache;
}

export function displays(): NativeDisplay[] {
  const s = screen();
  return [{ id: 'android', primary: true, x: 0, y: 0, width: s.w, height: s.h, scale: 1 }];
}

/** 截图：接头给的是 RGBA_8888，engine 要 bgra（Windows 的 DIB 序），这里换一下 R/B。 */
export function capture(d: NativeDisplay): { width: number; height: number; bgra: Uint8Array } {
  const max = Math.max(1, Math.round(d.width * d.scale));
  const buf = get(`/screen?raw=1&max=${max}`, 'shot.bin');
  if (buf.length < 12) fail('/screen', 'empty');
  const width = buf.readUInt32LE(0);
  const height = buf.readUInt32LE(4);
  const src = buf.subarray(8);
  if (src.length < width * height * 4) fail('/screen', `short ${src.length} < ${width * height * 4}`);
  const out = Buffer.allocUnsafe(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    out[o] = src[o + 2];
    out[o + 1] = src[o + 1];
    out[o + 2] = src[o];
    out[o + 3] = src[o + 3];
  }
  return { width, height, bgra: new Uint8Array(out) };
}

/* ---------- 指针 ---------- */

let cur = { x: 0, y: 0 };
let down: { x: number; y: number } | null = null;

export function cursor(): { x: number; y: number } {
  return { ...cur };
}

export function tick(): number {
  return Date.now() >>> 0;
}

/** 安卓侧不跟踪"人有没有在动"：一律当作空闲（CUA 的让位判断会因此直接放行）。 */
export function lastInputTick(): number {
  return 0;
}

export function moveTo(x: number, y: number): void {
  cur = { x: Math.round(x), y: Math.round(y) };
}

export type Button = 'left' | 'right' | 'middle';

export function buttonDown(_b: Button): void {
  down = { ...cur };
}

export function buttonUp(_b: Button): void {
  if (!down) return;
  const from = down;
  down = null;
  const dist = Math.hypot(cur.x - from.x, cur.y - from.y);
  if (dist < 3) post('/tap', { x: from.x, y: from.y });
  else post('/swipe', { x1: from.x, y1: from.y, x2: cur.x, y2: cur.y, ms: Math.max(120, Math.round(dist)) });
}

/** 滚轮 → 一次竖直滑动（安卓没有"滚轮"这个概念）。 */
export function wheel(downLines: number, rightLines: number): void {
  if (!downLines && !rightLines) return;
  const dy = -downLines * 120;
  const dx = rightLines * 120;
  post('/swipe', { x1: cur.x, y1: cur.y, x2: cur.x + dx, y2: cur.y + dy, ms: 220 });
}

/* ---------- 键盘（安卓这侧暂时没有注入通道） ---------- */

export function chord(_vks: Array<{ vk: number; extended: boolean }>): void {
  /* 无障碍服务只能派发手势，注入按键需要 root/输入法；这里保持安静，模型会改用点击。 */
}

export function typeUnicode(_text: string): void {
  /* 同上：点输入框 + 手势仍可操作，文字注入等接头补上 /text 端点。 */
}

/* ---------- 窗口 ---------- */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowInfo {
  handle: string;
  title: string;
  process: string;
  rect: Rect;
  minimized: boolean;
  focused: boolean;
}

/** 安卓没有"窗口列表"这一层，但读屏树（/ui）能给出同样的线索。 */
export function windows(): WindowInfo[] {
  return [];
}

export function processName(_pid: number): string | null {
  return null;
}

export function focus(_handle: string): boolean {
  return false;
}

export function askYesNo(
  _text: string,
  _caption: string,
  _labels: { yes: string; no: string },
  _timeoutMs: number,
): Promise<'yes' | 'no' | 'timeout'> {
  return Promise.resolve('timeout');
}

/** 读屏树：给"界面上有什么"用（模型看文字比看像素省）。 */
export function uiTree(): Array<{ text: string; x: number; y: number; w: number; h: number }> {
  try {
    return JSON.parse(get('/ui', 'ui.json').toString('utf8'));
  } catch {
    return [];
  }
}