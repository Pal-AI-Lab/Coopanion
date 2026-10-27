"""给 Coopanion 的 desktop-pet world 打一个最小补丁：让页面能代替全局热键开关收音。

为什么必须改这一处：
  World 的收音"闸门"只由全局热键（默认左 Alt）打开 —— gateOpen() = mic.mode === 'always'
  或 talking。手机没有键盘，页面也没有任何消息能打开它，所以音频帧会被整段丢掉。
  加一个 `case 'gate'` 让页面在"按住说话"的按下/松开时调用同一个 setTalking()，
  桌面原有的热键路径一行不动。

用法（Coo 升级后跑一次即可，幂等）：
    python tools/patches/apply-world-gate.py
    python tools/patches/apply-world-gate.py --check     # 只报告是否已打

覆盖范围：resources/app/node_modules/cortico-world-desktop-pet/src/world.ts
（该包 package.json 的 main 直接指到 src/index.ts，运行时由 tsx 直跑 TS，所以改源码即生效；
 打完要重启 Coopanion）
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

# PC 版安装目录里的 world.ts。装在哪因人而异，所以默认按相对路径找，
# 找不到就设环境变量 COOPANION_WORLD_TS 指过去（或用 --world 参数）。
WORLD = Path(
    os.environ.get(
        "COOPANION_WORLD_TS",
        "resources/app/node_modules/cortico-world-desktop-pet/src/world.ts",
    )
)

ANCHOR = "      case 'commit': return this.commitSpeech();\n      case 'cancel': return this.cancelSpeech();\n"

PATCH = """
      // Coo Mobile（无键盘的手机/平板）：页面在"按住说话"按下与松开时发 gate，
      // 代替桌面上的全局说话键。桌面原有热键路径完全不变，只有发了这条消息的页面才受影响。
      case 'gate': {
        if (typeof msg.open === 'boolean') this.setTalking(msg.open);
        return;
      }
"""

MARKER = "case 'gate'"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只检查是否已打补丁")
    args = ap.parse_args()

    if not WORLD.is_file():
        print(f"找不到 {WORLD}（Coo 装在别处就改这个脚本里的路径）")
        return 2
    text = WORLD.read_text(encoding="utf-8")

    if MARKER in text:
        print("已打过 gate 补丁，无需重复")
        return 0
    if args.check:
        print("未打补丁")
        return 1
    if ANCHOR not in text:
        print("锚点没找到（Coo 版本变了）：请手动在 onPage 的 switch 里加 case 'gate'")
        return 3

    backup = WORLD.with_suffix(".ts.bak-coo-mobile")
    if not backup.exists():
        shutil.copy2(WORLD, backup)
        print(f"备份 {backup.name}")

    WORLD.write_text(text.replace(ANCHOR, ANCHOR + PATCH, 1), encoding="utf-8")
    print(f"已补丁 {WORLD}\n重启 Coopanion 后生效。")
    return 0


if __name__ == "__main__":
    sys.exit(main())