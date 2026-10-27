#!/usr/bin/env python3
"""把 runtime.tgz 里的个人数据剔掉，产出一个可以分享的干净包。

背景：runtime.tgz 是「Node 运行时 + core 代码 + 你的 home 目录」打成的包，403MB。
其中 home/ 下存着**你自己的东西**：

    providers/*/config.json   模型 API key（明文）
    companion/data/           对话记录、run 日志、session-main.jsonl
    companion/config.json     你的名字、语言、端口等偏好
    companion/telemetry*      设备标识
    companion/avatar.png      你换过的头像
    companion/workspace/      CONSTITUTION.md、partner 等私人设定

仓库里的 .gitignore 已经把这个包整体排除了，正常提交不会带上去。
这个脚本是第二道保险：当你要把包发给别人 / 传到网盘前，先跑一次。

用法：
    python tools/pack-runtime.py
        默认读  android/app/src/main/assets/runtime.tgz
        默认写  android/app/src/main/assets/runtime-clean.tgz

    python tools/pack-runtime.py --in 某个.tgz --out 干净.tgz
    python tools/pack-runtime.py --list        # 只列出会被剔除的条目，不写文件

产生的干净包里，home/ 的目录结构会保留（空目录），app 首次启动时自己生成默认配置。
"""
from __future__ import annotations

import argparse
import os
import sys
import tarfile
from pathlib import PurePosixPath

DEFAULT_IN = "android/app/src/main/assets/runtime.tgz"
DEFAULT_OUT = "android/app/src/main/assets/runtime-clean.tgz"

# 相对 opt/coopanion/app/build/home/ 的路径前缀，命中就剔除
PRIVATE_PREFIXES = (
    "companion/data/",
    "companion/workspace/",
    "companion/config.json",
    "companion/deployment.json",
    "companion/telemetry.json",
    "companion/telemetry-id",
    "companion/theme.json",
    "companion/avatar.png",
)

# 命中就剔除。两处都有 home：opt/coopanion/home/ 是运行时数据，
# opt/coopanion/app/build/home/ 是出厂模板——但当初打这个包时把用户 home
# 整份复制进了模板，所以那边也混着 workspace、runs、avatar 之类的私人内容，一起清。
HOME_MARKS = (
    "opt/coopanion/home/",
    "opt/coopanion/app/build/home/",
)


def rel_under_home(name: str) -> str | None:
    """如果这个条目在任一 home/ 下，返回相对 home/ 的路径；否则 None。"""
    for mk in HOME_MARKS:
        i = name.find(mk)
        if i >= 0:
            return name[i + len(mk):]
    return None


def is_private(rel: str) -> bool:
    # providers/ 整个目录都是这台机器上的模型配置：baseUrl（内网地址）、.env 里的
    # 网关令牌、以及各家 API key，一个都不能带走。
    if rel.startswith("providers/"):
        return True
    return any(rel.startswith(p) for p in PRIVATE_PREFIXES)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", default=DEFAULT_IN)
    ap.add_argument("--out", dest="dst", default=DEFAULT_OUT)
    ap.add_argument("--list", action="store_true", help="只列出会被剔除的条目")
    args = ap.parse_args()

    if not os.path.exists(args.src):
        print(f"找不到 {args.src}", file=sys.stderr)
        return 1

    dropped: list[str] = []
    kept = 0

    with tarfile.open(args.src, "r:gz") as tin:
        out = None if args.list else tarfile.open(args.dst, "w:gz", compresslevel=6)
        try:
            for m in tin:
                rel = rel_under_home(m.name)
                if rel is not None and is_private(rel):
                    dropped.append(m.name)
                    continue
                kept += 1
                if out is not None:
                    out.addfile(m, tin.extractfile(m) if m.isfile() else None)
        finally:
            if out is not None:
                out.close()

    print(f"剔除 {len(dropped)} 个个人数据条目，保留 {kept} 个：")
    for n in dropped[:40]:
        print("  -", n)
    if len(dropped) > 40:
        print(f"  ... 还有 {len(dropped) - 40} 个")
    if not args.list:
        print(f"\n已写出：{args.dst}（{os.path.getsize(args.dst) / 1048576:.0f} MB）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())