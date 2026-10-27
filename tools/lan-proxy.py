"""Coopanion LAN 反代 (Hermes 2026-10-27)

把手机/平板访问的 http://<PC-IP>:17789 转发给本机 Coopanion 的 http://127.0.0.1:17788。

为什么需要它：Coopanion 的"宠物页"服务只 bind 127.0.0.1，并且校验 Host / Origin 必须是 loopback
(防 DNS rebinding)。本反代在转发时把 Host 改写成 127.0.0.1:17788、Origin 改写成
http://127.0.0.1:17788，于是手机浏览器在 Coopanion 眼里就是"本机的一个浏览器标签页"，
可以完整使用宠物页（文字、表情、气泡、语音窗口外的全部页面功能）。

用法：
    python lan-proxy.py                       # 0.0.0.0:17789 -> 127.0.0.1:17788
    python lan-proxy.py --port 17789 --upstream 17788
    python lan-proxy.py --upstream 192.168.1.10:17788   # 指向别的机器上的 Coopanion

退出：Ctrl+C。
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

HOST_HEADER = b"host:"
ORIGIN_HEADER = b"origin:"
# 手机本机反代会给每个请求加这个标记；只有带它的请求才会被注入「按住说话」脚本
MOBILE_MARK = b"x-coo-mobile: 1"
# 要注入的模块（追加在模块末尾 = 模块作用域，可直接用页面自己的 send()）
INJECT_PATH = "/web/pet-app.js"
SHIM_FILE = Path(__file__).with_name("phone-talk-shim.js")


async def read_head(reader: asyncio.StreamReader) -> bytes | None:
    try:
        return await reader.readuntil(b"\r\n\r\n")
    except (asyncio.IncompleteReadError, asyncio.LimitOverrunError):
        return None


def rewrite_head(head: bytes, upstream_host: str, upstream_port: int) -> bytes:
    lines = head.split(b"\r\n")
    out = [lines[0]]
    want_host = f"{upstream_host}:{upstream_port}".encode()
    want_origin = f"http://{upstream_host}:{upstream_port}".encode()
    for line in lines[1:]:
        low = line.lower()
        if low.startswith(HOST_HEADER):
            out.append(b"Host: " + want_host)
        elif low.startswith(ORIGIN_HEADER) and line.split(b":", 1)[-1].strip().lower() != b"null":
            # `Origin: null` 是沙箱 iframe 的不透明来源，服务器对它回
            # `Access-Control-Allow-Origin: null`；改写掉会让形象包脚本被 CORS 拦住。
            out.append(b"Origin: " + want_origin)
        else:
            out.append(line)
    return b"\r\n".join(out)


def rewrite_response_head(head: bytes, client_port: int) -> bytes:
    """把响应头里写死的 PetServer origin 改写成客户端实际用的端口。

    `/figure-frame` 的 CSP 是 `script-src http://127.0.0.1:7797`（写死服务器自己的端口）。
    手机页面是从 `http://127.0.0.1:<客户端端口>` 加载的，形象包（whale/coo）的脚本在沙箱
    iframe 里按 CSP 校验来源，端口不一致就被拦，宠物本体永远不出现（20 秒后报"形象没有
    准备好"）。在这里把 `127.0.0.1:7797` 换成 `127.0.0.1:<客户端端口>`，手机侧无需特殊处理。
    只动头部字节，body / chunked / WebSocket 帧原样透传。
    """
    if b"127.0.0.1:7797" not in head:
        return head
    return head.replace(b"127.0.0.1:7797", f"127.0.0.1:{client_port}".encode())


async def pump(src: asyncio.StreamReader, dst: asyncio.StreamWriter) -> None:
    try:
        while True:
            chunk = await src.read(65536)
            if not chunk:
                break
            dst.write(chunk)
            await dst.drain()
    except (ConnectionResetError, BrokenPipeError, asyncio.CancelledError):
        pass
    finally:
        try:
            dst.close()
        except Exception:
            pass


def log(msg: str) -> None:
    print(msg, flush=True)


async def handle(client_reader, client_writer, upstream_host, upstream_port, client_port):
    peer = client_writer.get_extra_info("peername")
    head = await read_head(client_reader)
    if head is None:
        client_writer.close()
        return
    first = head.split(b"\r\n", 1)[0].decode("latin-1")
    is_upgrade = b"upgrade: websocket" in head.lower()
    try:
        up_reader, up_writer = await asyncio.open_connection(
            upstream_host, upstream_port, limit=1024 * 1024
        )
    except OSError as exc:
        log(f"[{client_port}] upstream {upstream_host}:{upstream_port} refused: {exc}")
        client_writer.write(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
        await client_writer.drain()
        client_writer.close()
        return
    path = first.split(" ")[1] if len(first.split(" ")) > 1 else ""
    # 电脑桌宠窗的让位/归还：手机要当"真正的 pet"（能收音）就得让 PC 那个窗口先断开，
    # 协议里 window 优先于 tab，两者只能有一个是 pet。
    if path.startswith("/__coo/petwindow/"):
        await pet_window(client_writer, path.split("?")[0][len("/__coo/petwindow/"):], log, client_port)
        return
    if path.startswith("/__coo/test/"):
        name = path[len("/__coo/test/"):].split("?")[0]
        target = (Path(__file__).with_name("test-audio") / name).resolve()
        base = Path(__file__).with_name("test-audio").resolve()
        try:
            if base not in target.parents or not target.is_file():
                raise FileNotFoundError(name)
            data = target.read_bytes()
            ctype = "audio/wav" if target.suffix == ".wav" else "application/octet-stream"
            client_writer.write(
                b"HTTP/1.1 200 OK\r\nContent-Type: " + ctype.encode()
                + b"\r\nContent-Length: " + str(len(data)).encode()
                + b"\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n" + data
            )
            await client_writer.drain()
            log(f"[{client_port}] serve test audio {name} ({len(data)} bytes)")
        except Exception as exc:
            client_writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            log(f"[{client_port}] test audio {name}: {exc}")
        try:
            client_writer.close()
        except Exception:
            pass
        return
    inject = MOBILE_MARK in head.lower() and path.split("?")[0] == INJECT_PATH
    if inject:
        # 要改 body 就不能让上游压缩（否则追加的字节落进 gzip 流里）
        head = re.sub(rb"(?i)accept-encoding:[^\r\n]*", b"Accept-Encoding: identity", head)
    up_writer.write(rewrite_head(head, upstream_host, upstream_port))
    await up_writer.drain()
    log(f"[{client_port}] {peer} {first}{' [ws]' if is_upgrade else ''}{' [inject]' if inject else ''}")
    # 先把客户端→上游的泵挂起来，免得带 body 的请求在等响应头时卡住
    up_pump = asyncio.create_task(pump(client_reader, up_writer))
    try:
        resp_head = await up_reader.readuntil(b"\r\n\r\n")
    except (asyncio.IncompleteReadError, asyncio.LimitOverrunError):
        resp_head = b""
    if inject and resp_head.startswith(b"HTTP/1.1 200"):
        # 整个 body 读进来 → 追加「按住说话」脚本 → 用 Content-Length 重发
        try:
            body = await read_body(up_reader, resp_head)
            shim = SHIM_FILE.read_bytes() if SHIM_FILE.exists() else b""
            body = body + b"\n" + shim + b"\n"
            client_writer.write(rebuild_head(resp_head, len(body)) + body)
            await client_writer.drain()
            log(f"[{client_port}] inject ok: {len(body)} bytes")
        except Exception as exc:  # 注入失败就退化成普通转发（页面只是没有按钮）
            log(f"[{client_port}] inject failed: {exc}")
        # 不能等客户端→上游的泵结束（它在等客户端关连接，而客户端在等我们 EOF）
        up_pump.cancel()
        try:
            await up_pump
        except BaseException:
            pass
        for w in (up_writer, client_writer):
            try:
                w.close()
            except Exception:
                pass
        return
    if resp_head:
        client_writer.write(rewrite_response_head(resp_head, client_port))
        await client_writer.drain()
    await asyncio.gather(up_pump, pump(up_reader, client_writer))


async def read_body(reader: asyncio.StreamReader, head: bytes) -> bytes:
    """按响应头把 body 读全（chunked / content-length / 读到断开）。"""
    low = head.lower()
    if b"transfer-encoding: chunked" in low:
        out = bytearray()
        while True:
            line = await reader.readline()
            if not line:
                break
            size = int((line.strip().split(b";")[0] or b"0"), 16)
            if size == 0:
                while True:  # trailer
                    trailer = await reader.readline()
                    if trailer in (b"\r\n", b"\n", b""):
                        break
                break
            out += await reader.readexactly(size)
            await reader.readline()  # 块尾 CRLF
        return bytes(out)
    m = re.search(rb"content-length:\s*(\d+)", low)
    if m:
        return await reader.readexactly(int(m.group(1)))
    return await reader.read()


def rebuild_head(head: bytes, length: int) -> bytes:
    """改完 body 后重发响应头：去掉分块/长度/缓存校验，给一个准确的 Content-Length。"""
    out = [head.split(b"\r\n")[0]]
    for line in head.split(b"\r\n")[1:]:
        if not line:
            continue
        low = line.lower()
        if low.startswith((b"transfer-encoding:", b"content-length:", b"content-encoding:", b"etag:", b"last-modified:")):
            continue
        out.append(line)
    out.append(b"Content-Length: " + str(length).encode())
    out.append(b"Connection: close")
    return b"\r\n".join(out) + b"\r\n\r\n"


PETWIN_RECORD = Path(__file__).with_name("pet-window.cmdline.txt")
PS_LIST = (
    "Get-CimInstance Win32_Process -Filter \"Name='Coopanion.exe'\" | "
    "Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
)


def _ps_procs() -> list[dict]:
    """列出 Coopanion 进程（pid + 命令行），走 PowerShell CIM。"""
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", PS_LIST],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=25,
        )
        raw = (r.stdout or "").strip()
        if not raw:
            return []
        data = json.loads(raw)
        return data if isinstance(data, list) else [data]
    except Exception:
        return []


def _pet_hosts() -> list[dict]:
    return [{"pid": p.get("ProcessId"), "cmdline": p.get("CommandLine") or ""}
            for p in _ps_procs() if "--pet-host" in (p.get("CommandLine") or "")]


def _main_pid() -> int | None:
    for p in _ps_procs():
        cmd = (p.get("CommandLine") or "").strip()
        if "--pet-host" not in cmd and "--type=" not in cmd:
            return p.get("ProcessId")
    return None


async def pet_window(writer, action: str, log, port: int) -> None:
    """GET /__coo/petwindow/{status|yield|restore}，给手机端做"桌宠窗让位/归还"。"""
    body, code = await asyncio.to_thread(_pet_window_sync, action, log)
    payload = json.dumps(body, ensure_ascii=False).encode()
    writer.write(
        b"HTTP/1.1 " + code + b"\r\nContent-Type: application/json; charset=utf-8\r\n"
        b"Content-Length: " + str(len(payload)).encode()
        + b"\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n" + payload
    )
    try:
        await writer.drain()
        writer.close()
    except Exception:
        pass
    log(f"[{port}] petwindow {action}: {body}")


def _pet_window_sync(action: str, log) -> tuple[dict, bytes]:
    hosts = _pet_hosts()
    if action == "status":
        return (
            {"running": bool(hosts), "pids": [h["pid"] for h in hosts],
             "restorable": PETWIN_RECORD.exists()},
            b"200 OK",
        )
    if action == "yield":
        # 记下命令行再杀，之后能原样还原（key 是本次运行生成的，必须留着）
        if not hosts:
            return ({"ok": True, "already": True, "running": False}, b"200 OK")
        PETWIN_RECORD.write_text(hosts[0]["cmdline"], encoding="utf-8")
        for p in hosts:
            subprocess.run(["taskkill", "/PID", str(p["pid"]), "/F"], capture_output=True, timeout=20)
        time.sleep(1.5)
        left = _pet_hosts()
        return (
            {"ok": not left, "saved": str(PETWIN_RECORD),
             "killed": [p["pid"] for p in hosts], "running": bool(left)},
            b"200 OK",
        )
    if action == "restore":
        if hosts:
            return ({"ok": True, "already": True, "running": True}, b"200 OK")
        if not PETWIN_RECORD.exists():
            return ({"ok": False, "error": "没有记录过桌宠窗命令行，只能在电脑托盘里手动打开"},
                    b"409 Conflict")
        cmdline = PETWIN_RECORD.read_text(encoding="utf-8").strip()
        m = re.match(r'^"?([^"]+?\.exe)"?\s*(.*)$', cmdline)
        if not m:
            return ({"ok": False, "error": f"命令行解析失败: {cmdline}"}, b"500 Internal Server Error")
        exe, rest = m.group(1), m.group(2).split()
        main_pid = _main_pid()
        args = []
        for a in rest:
            if a.startswith("--parent-pid="):
                if main_pid:  # 父进程 pid 每次启动都变，必须换成当前的
                    args.append(f"--parent-pid={main_pid}")
                continue
            args.append(a)
        # 关键：不能把 ELECTRON_RUN_AS_NODE 传给 Electron（否则 exe 当 node 跑，
        # 直接报 "bad option: --pet-host" 退出）。代理进程可能是带着它启动的。
        env = {k: v for k, v in os.environ.items() if not k.upper().startswith("ELECTRON_")}
        subprocess.Popen([exe, *args], close_fds=True, env=env,
                         creationflags=0x00000008 | 0x00000200)  # DETACHED | NEW_PROCESS_GROUP
        time.sleep(1.0)
        return ({"ok": True, "launched": exe, "args": args}, b"200 OK")
    return ({"ok": False, "error": f"unknown action {action}"}, b"404 Not Found")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bind", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=17789)
    ap.add_argument("--upstream", default="127.0.0.1:17788")
    ap.add_argument("--log", default="", help="把输出追加到这个文件（pythonw 无控制台时用）")
    args = ap.parse_args()
    if args.log:
        f = open(args.log, "a", encoding="utf-8", buffering=1)
        sys.stdout = f
        sys.stderr = f
    up_host, _, up_port = args.upstream.partition(":")
    upstream_port = int(up_port or 17788)
    server = await asyncio.start_server(
        lambda r, w: handle(r, w, up_host, upstream_port, args.port),
        args.bind,
        args.port,
        limit=1024 * 1024,
    )
    addrs = ", ".join(str(s.getsockname()[:2]) for s in server.sockets)
    log(f"Coopanion LAN proxy: {addrs} -> http://{up_host}:{upstream_port}")
    async with server:
        await server.serve_forever()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        pass