#!/usr/bin/env python
"""在设备当前界面上按文本点东西：python tap_text.py "文本" [--contains]

拉一份 uiautomator dump，找到第一个 text/content-desc 里含该文本、且 clickable 的节点，
点它的中心；找不到就往外找一层父节点（很多行本身不可点）。找不到返回非零。
"""
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ADB = r"D:\Android\android-sdk\platform-tools\adb.exe"
DUMP = "/sdcard/_tap.xml"
LOCAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_tap.xml")


def sh(*args: str) -> str:
    return subprocess.run([ADB, *args], capture_output=True, text=True, encoding="utf-8", errors="replace").stdout


def center(bounds: str):
    m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds or "")
    if not m:
        return None
    x1, y1, x2, y2 = map(int, m.groups())
    return (x1 + x2) // 2, (y1 + y2) // 2


def main() -> int:
    if len(sys.argv) < 2:
        print("用法: tap_text.py <文本>")
        return 2
    want = sys.argv[1]
    sh("shell", f"uiautomator dump {DUMP} >/dev/null 2>&1")
    sh("pull", DUMP, LOCAL)
    tree = ET.parse(LOCAL)
    parent = {c: p for p in tree.iter() for c in p}
    hits = []
    for n in tree.iter("node"):
        label = (n.get("text") or "") + (n.get("content-desc") or "")
        if want in label:
            hits.append(n)
    for n in hits:
        node = n
        for _ in range(3):
            pt = center(node.get("bounds"))
            if node.get("clickable") == "true" and pt:
                print(f"{want} -> {pt} (clickable={node.get('clickable')})")
                sh("shell", f"input tap {pt[0]} {pt[1]}")
                return 0
            node = parent.get(node)
            if node is None:
                break
    print(f"没找到可点的「{want}」（命中 {len(hits)} 个节点）")
    return 1


if __name__ == "__main__":
    sys.exit(main())