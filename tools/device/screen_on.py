#!/usr/bin/env python
"""开实时投屏（MediaProjection）：触发系统授权弹窗 → 自动选「共享整个屏幕」→ 下一步 → 验证。

用法：python screen_on.py
重装 APK 之后投屏授权会失效，跑这个就恢复，不需要人动手。
"""
import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ADB = r"D:\Android\android-sdk\platform-tools\adb.exe"
PKG = "lab.palailab.coo.mobile"
HERE = os.path.dirname(os.path.abspath(__file__))
LOCAL = os.path.join(HERE, "_screen.xml")
DEV = "/sdcard/_screen.xml"


def sh(*args: str) -> str:
    r = subprocess.run([ADB, *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.stdout or ""


def tap(x: int, y: int) -> None:
    sh("shell", f"input tap {x} {y}")


def tree():
    sh("shell", f"uiautomator dump {DEV} >/dev/null 2>&1")
    sh("pull", DEV, LOCAL)
    try:
        return ET.parse(LOCAL)
    except Exception:
        return None


def find(t, text):
    if t is None:
        return None
    for n in t.iter("node"):
        if text in (n.get("text") or ""):
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", n.get("bounds") or "")
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def live() -> dict:
    try:
        return json.loads(sh("shell", "curl -s --max-time 4 http://127.0.0.1:18080/live") or "{}")
    except Exception:
        return {}


def main() -> int:
    st = live()
    if st.get("running"):
        print(f"已经在跑：{st.get('width')}x{st.get('height')} {st.get('fps')} 帧/秒")
        return 0

    print("启动 app…")
    sh("shell", f"monkey -p {PKG} -c android.intent.category.LAUNCHER 1")
    time.sleep(12)

    print("触发授权…")
    subprocess.run([sys.executable, os.path.join(HERE, "cdp.py"), "eval",
                    "(()=>{try{CooAndroid.screenStart();return 'asked';}catch(e){return 'ERR '+e.message}})()"],
                   capture_output=True, text=True)
    time.sleep(4)

    t = tree()
    pt = find(t, "共享一个应用")
    if pt:
        print("展开范围…")
        tap(*pt)
        time.sleep(2)
        t = tree()
        pt = find(t, "共享整个屏幕")
        if pt:
            print("选整屏…")
            tap(*pt)
            time.sleep(2)
            t = tree()

    pt = find(t, "下一步")
    if not pt:
        print("没有授权弹窗（可能已授权或页面不对）")
        return 1
    print("下一步…")
    tap(*pt)
    time.sleep(5)

    st = live()
    if st.get("running"):
        print(f"OK 实时流在跑：{st.get('width')}x{st.get('height')}，{st.get('fps')} 帧/秒")
        return 0
    print(f"没起来：{st}")
    return 1


if __name__ == "__main__":
    sys.exit(main())