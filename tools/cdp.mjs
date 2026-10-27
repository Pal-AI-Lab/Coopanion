// 手机 WebView 的 CDP 小工具（Hermes 2026-10-27）
// 用法：
//   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
//   node tools/cdp.mjs list
//   node tools/cdp.mjs eval "document.title"
//   node tools/cdp.mjs eval --file some.js
// 依赖：直接用 Coopanion 自带的 ws，无需 npm install。
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('D:/yangyu/Coopanion/resources/app/');
const WS = require('ws');

const ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const cmd = process.argv[2] || 'list';
const rest = process.argv.slice(3);

async function targets() {
  const r = await fetch(`${ENDPOINT}/json/list`);
  return r.json();
}

function pick(list) {
  const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  const want = process.env.CDP_TARGET || '';
  return pages.find((t) => want && t.url.includes(want)) || pages[0];
}

async function connect() {
  const t = pick(await targets());
  if (!t) throw new Error('no page target');
  const ws = new WS(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise((ok, bad) => {
    ws.on('open', ok);
    ws.on('error', bad);
  });
  let id = 0;
  const pending = new Map();
  ws.on('message', (d) => {
    let m;
    try {
      m = JSON.parse(d.toString());
    } catch {
      return;
    }
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      p(m);
    }
  });
  const send = (method, params = {}) =>
    new Promise((ok) => {
      const i = ++id;
      pending.set(i, ok);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { ws, send, target: t };
}

async function main() {
  if (cmd === 'list') {
    const list = await targets();
    for (const t of list) console.log(`${t.type}\t${t.url}\t${t.webSocketDebuggerUrl || ''}`);
    return;
  }
  const { ws, send, target } = await connect();
  if (cmd === 'eval') {
    let expr;
    if (rest[0] === '--file') expr = readFileSync(rest[1], 'utf8');
    else expr = rest.join(' ');
    const r = await send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.result?.exceptionDetails) {
      console.error('EXCEPTION', JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails, null, 2));
      process.exitCode = 1;
    } else {
      const v = r.result?.result?.value;
      console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
    }
  } else if (cmd === 'type') {
    // 真·输入：Input.insertText + Input.dispatchKeyEvent（trusted 事件，页面快捷键都认）
    const text = rest.join(' ');
    await send('Input.insertText', { text });
    console.log('typed', JSON.stringify(text));
  } else if (cmd === 'key') {
    const key = rest[0] || 'Enter';
    const map = {
      Enter: { code: 'Enter', keyCode: 13, text: '\r' },
      Escape: { code: 'Escape', keyCode: 27 },
      Tab: { code: 'Tab', keyCode: 9 },
    };
    const k = map[key] || { code: key, keyCode: 0 };
    const base = { key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode };
    await send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text ? { text: k.text } : {}) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    console.log('key', key);
  } else if (cmd === 'preload') {
    // 在页面任何脚本之前装上（沙箱 iframe 之外的主页面），然后重载页面
    const file = rest[0];
    const src = readFileSync(file, 'utf8');
    await send('Page.enable');
    const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
    console.log('preload registered', JSON.stringify(r.result || {}));
    await send('Page.reload', { ignoreCache: true });
    console.log('reloaded');
  } else if (cmd === 'shot') {
    const out = rest[0];
    const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const b64 = r.result?.data;
    if (!b64) {
      console.error('no data', JSON.stringify(r).slice(0, 300));
      process.exitCode = 1;
    } else {
      writeFileSync(out, Buffer.from(b64, 'base64'));
      console.log('saved', out);
    }
  } else if (cmd === 'evalall') {
    // 在每一个执行上下文里跑一遍（沙箱 iframe 是独立上下文，父页面访问不到）
    const expr = rest.join(' ');
    const ctxs = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.method === 'Runtime.executionContextCreated') ctxs.push(m.params.context);
    });
    await send('Runtime.enable');
    await new Promise((ok) => setTimeout(ok, 600));
    for (const c of ctxs) {
      const r = await send('Runtime.evaluate', {
        expression: expr,
        contextId: c.id,
        returnByValue: true,
        awaitPromise: true,
      });
      const v = r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? '';
      console.log(`#${c.id} ${c.origin || c.name || ''} => ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    }
  } else if (cmd === 'call') {
    // 任意 CDP 方法：node tools/cdp.mjs call Page.removeScriptToEvaluateOnNewDocument '{"identifier":"1"}'
    const method = rest[0];
    const params = JSON.parse(rest[1] || '{}');
    const r = await send(method, params);
    console.log(JSON.stringify(r.result ?? r.error ?? r, null, 1));
  } else if (cmd === 'logs') {
    await send('Runtime.enable');
    await send('Log.enable');
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      const text =
        m.method === 'Runtime.consoleAPICalled'
          ? `console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`
          : m.method === 'Log.entryAdded'
            ? `log.${m.params.entry.level}: ${m.params.entry.text}`
            : null;
      if (text) console.log(text);
    });
    await new Promise((ok) => setTimeout(ok, Number(process.env.CDP_WAIT_MS || 15000)));
  } else {
    console.error('unknown cmd', cmd);
    process.exitCode = 2;
  }
  ws.close();
}

main().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});