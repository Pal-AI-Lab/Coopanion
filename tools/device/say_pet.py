"""在桌宠气泡里打字说话（老大通道）：点 #tools 开气泡 → textarea 输入 → 真提交表单。

用法：python say_pet.py "要说的话"
"""
import json
import sys
import time

import websocket

import cdp

MSG = sys.argv[1] if len(sys.argv) > 1 else "你好"

cdp.ensure_forward()
page = None
for p in cdp.pages():
    if "7797" in (p.get("url") or ""):
        page = p
        break
if not page:
    raise SystemExit("没有桌宠页 (7797)")

ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=30, suppress_origin=True)
n = [0]


def call(method, **params):
    n[0] += 1
    ws.send(json.dumps({"id": n[0], "method": method, "params": params}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == n[0]:
            return m.get("result", {})


def ev(expr):
    r = call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
    return r.get("result", {}).get("value")


# 1. 气泡没开就先点 #tools 打开它
print("open:", ev("""
(() => {
  const b = document.querySelector('#bubble');
  if (b && !b.hidden && b.querySelector('form.b-own textarea')) return 'already';
  const bs = document.querySelectorAll('#tools button');
  if (bs.length) { bs[0].click(); return 'clicked'; }
  return 'no-tools';
})()
"""))
time.sleep(1.2)

# 2. 聚焦并插入
print("focus:", ev("""
(() => {
  const ta = document.querySelector('#bubble form.b-own textarea');
  if (!ta) return 'no-textarea';
  ta.focus();
  return 'ok';
})()
"""))
call("Input.insertText", text=MSG)
time.sleep(0.4)
print("value:", ev("""
(() => {
  const ta = document.querySelector('#bubble form.b-own textarea');
  return ta ? ta.value.slice(0, 30) : 'gone';
})()
"""))

# 3. 真提交表单（和按回车同一条路）
print("submit:", ev("""
(() => {
  const f = document.querySelector('#bubble form.b-own');
  if (!f) return 'no-form';
  f.requestSubmit();
  return 'submitted';
})()
"""))
time.sleep(1.5)
print("after:", ev("""
(() => {
  const b = document.querySelector('#bubble');
  return b ? 'bubbleHidden=' + b.hidden : 'gone';
})()
"""))
ws.close()