from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, s):
    (ROOT / path).write_text(s, encoding='utf-8', newline='\n')

def rep(path, old, new, count=1):
    s = read(path)
    if s.count(old) < count:
        raise SystemExit(f'{path}: missing replacement:\n{old[:240]}')
    write(path, s.replace(old, new, count))

def sub(path, pattern, repl):
    s = read(path)
    s2, n = re.subn(pattern, repl, s, count=1, flags=re.S)
    if n != 1:
        raise SystemExit(f'{path}: regex matched {n}: {pattern[:180]}')
    write(path, s2)

pkg = 'package.json'
win = 'packages/cortico-world-desktop-pet/host/windows-platforms.cjs'
main = 'packages/cortico-world-desktop-pet/host/electron-main.cjs'
core = 'packages/cortico-world-desktop-pet/web/pet-core.js'
wrap = 'packages/cortico-world-desktop-pet/web/pet-core-platforms.js'
app = 'packages/cortico-world-desktop-pet/web/pet-app.js'

# Version.
rep(pkg, '"version": "0.1.15"', '"version": "0.1.16"')

# Platform discovery: identify the owning process so wallpaper renderers are never physics,
# while Rainmeter and MyDockFinder can be admitted even though they use layered windows.
rep(win,
    "    const user32 = koffi.load('user32.dll');\n",
    "    const user32 = koffi.load('user32.dll'), kernel32 = koffi.load('kernel32.dll');\n")
rep(win,
    "      GetWindowLongW: user32.func('int32_t __stdcall GetWindowLongW(intptr_t hwnd, int index)'),\n      DwmGetWindowAttribute,\n",
    "      GetWindowLongW: user32.func('int32_t __stdcall GetWindowLongW(intptr_t hwnd, int index)'),\n      GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, void *pid)'),\n      OpenProcess: kernel32.func('void * __stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)'),\n      QueryFullProcessImageNameW: kernel32.func('int __stdcall QueryFullProcessImageNameW(void *process, uint32_t flags, void *name, void *size)'),\n      CloseHandle: kernel32.func('int __stdcall CloseHandle(void *handle)'),\n      DwmGetWindowAttribute,\n")

marker = """function isCloaked(hwnd) {
  if (!native.DwmGetWindowAttribute) return false;
  const value = Buffer.alloc(4);
  // DWMWA_CLOAKED: non-zero windows are logically present but not actually shown.
  return native.DwmGetWindowAttribute(hwnd, 14, value, value.length) === 0 && value.readUInt32LE(0) !== 0;
}
"""
insert = marker + """
function processName(hwnd) {
  const pidBuf = Buffer.alloc(4);
  native.GetWindowThreadProcessId(hwnd, pidBuf);
  const pid = pidBuf.readUInt32LE(0);
  if (!pid) return '';
  const process = native.OpenProcess(0x1000, 0, pid); // PROCESS_QUERY_LIMITED_INFORMATION
  if (!process) return '';
  try {
    const max = 1024, buf = Buffer.alloc(max * 2), size = Buffer.alloc(4);
    size.writeUInt32LE(max, 0);
    if (!native.QueryFullProcessImageNameW(process, 0, buf, size)) return '';
    const chars = Math.min(max, size.readUInt32LE(0));
    const full = buf.toString('utf16le', 0, chars * 2);
    return (full.split(/[\\\\/]/).pop() || '').toLowerCase();
  } catch {
    return '';
  } finally {
    native.CloseHandle(process);
  }
}
"""
rep(win, marker, insert)

old_class = """            const title = wideText(native.GetWindowTextW, hwnd, 512);
            const rainmeter = /rainmeter/i.test(className) || /rainmeter/i.test(title);
            const exStyle = native.GetWindowLongW(hwnd, -20) >>> 0; // GWL_EXSTYLE
            const layered = !!(exStyle & 0x00080000); // WS_EX_LAYERED
            const transparent = !!(exStyle & 0x00000020); // WS_EX_TRANSPARENT
            out.push({
              id: `hwnd:${id}`,
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              kind: rainmeter ? 'rainmeter' : 'window',
              className,
              title,
              layered,
              transparent,
            });
"""
new_class = """            const title = wideText(native.GetWindowTextW, hwnd, 512);
            const process = processName(hwnd);
            const signature = `${process} ${className} ${title}`;
            // Wallpaper Engine is rendered desktop background, never a physical platform.
            const wallpaper = /^(?:wallpaper|webwallpaper)(?:32|64)?\\.exe$/i.test(process)
              || /wallpaper engine/i.test(signature);
            if (wallpaper) { hwnd = native.GetWindow(hwnd, GW_HWNDNEXT); continue; }

            const rainmeter = process === 'rainmeter.exe' || /rainmeter/i.test(`${className} ${title}`);
            const mydockfinder = /^(?:dock(?:_64)?|mydockfinder)\\.exe$/i.test(process)
              || /mydockfinder|dock_64/i.test(`${className} ${title}`);
            const exStyle = native.GetWindowLongW(hwnd, -20) >>> 0; // GWL_EXSTYLE
            const layered = !!(exStyle & 0x00080000); // WS_EX_LAYERED
            const transparent = !!(exStyle & 0x00000020); // WS_EX_TRANSPARENT
            // Unknown transparent/layered render surfaces are far too likely to be wallpaper,
            // overlays or invisible hit-test windows. Only known desktop widgets are solid.
            if ((layered || transparent) && !rainmeter && !mydockfinder) {
              hwnd = native.GetWindow(hwnd, GW_HWNDNEXT); continue;
            }
            out.push({
              id: `hwnd:${id}`,
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              kind: rainmeter ? 'rainmeter' : mydockfinder ? 'mydockfinder' : 'window',
              className,
              title,
              processName: process,
              layered,
              transparent,
            });
"""
rep(win, old_class, new_class)

# Remove the full-screen visual edge scanner. It cannot distinguish wallpaper art from UI objects.
rep(main,
    "    if (!p.layered && !p.transparent && p.kind !== 'rainmeter') out.push({ ...p, left, right, top, bottom });\n  }\n  out.push(...scanVisualSurfaces(win));\n  return out;\n",
    "    out.push({ ...p, left, right, top, bottom });\n  }\n  return out;\n")
sub(main,
    r"\n/\*\*\n \* Finds long, actually visible horizontal edges in the composed desktop image\..*?\nfunction scanVisualSurfaces\(win\) \{.*?\n\}\n\n(?=/\*\*\n \* Screen pixels under `rect`)",
    "\n")

# Preference updates should not resize the pet when the repeated prefs payload contains the
# same scale. This was the y-snap when changing only the roam/frequency mode.
rep(app,
    "  if (p.roam) { prefs.roam = p.roam; ctl.setRoam(p.roam); }",
    "  if (p.roam && p.roam !== prefs.roam) { prefs.roam = p.roam; ctl.setRoam(p.roam); }")
rep(app,
    "  if (typeof p.scale === 'number') { prefs.scale = p.scale; ctl.resize(); }",
    "  if (typeof p.scale === 'number' && p.scale !== prefs.scale) { prefs.scale = p.scale; ctl.resize(); }")

# Stable moving-platform following. A dock resizing/magnifying is not the whole platform moving.
old_move = """  function moveWithPlatform(next) {
    if (!supportId || airborne()) return;
    const before = surfaces.find((p) => p.id === supportId);
    const after = next.find((p) => p.id === supportId);
    if (!before || !after) return;
    const oldCenter = (before.left + before.right) / 2;
    const newCenter = (after.left + after.right) / 2;
    const dx = newCenter - oldCenter, dy = after.top - before.top;
    if (!dx && !dy) return;
    ctl.pet.x += dx;
    ctl.pet.target += dx;
    ctl.pet.fy += dy;
  }
"""
new_move = """  function moveWithPlatform(next) {
    if (!supportId || airborne()) return;
    const before = surfaces.find((p) => p.id === supportId);
    const after = next.find((p) => p.id === supportId);
    if (!before || !after) return;
    const bw = before.right - before.left, bh = before.bottom - before.top;
    const aw = after.right - after.left, ah = after.bottom - after.top;
    // MyDockFinder magnifies and reshapes itself on hover. Treat size changes as geometry changes,
    // not as a translation that should carry/teleport the pet.
    if (Math.abs(aw - bw) > 4 || Math.abs(ah - bh) > 4) return;
    const dx = after.left - before.left, dy = after.top - before.top;
    if (!dx && !dy) return;
    ctl.pet.x += dx;
    ctl.pet.target += dx;
    ctl.pet.fy += dy;
  }
"""
rep(wrap, old_move, new_move)

old_resize = """  ctl.resize = () => {
    dynamicFloor = null;
    rawResize();
  };
"""
new_resize = """  ctl.resize = () => {
    const p = ctl.pet;
    const floor = screenFloor();
    if (p.mode === 'drag') {
      dynamicFloor = floor;
      supportId = null;
    } else if (p.mode === 'air' || p.mode === 'crouch') {
      dynamicFloor = nextSurfaceBelow(p.x, p.fy).top;
    } else {
      const support = surfaceAt(p.x, p.fy, FOLLOW_EPS);
      if (support) {
        supportId = support.id;
        dynamicFloor = support.top;
      } else if (Math.abs(p.fy - floor) <= FOLLOW_EPS) {
        supportId = null;
        dynamicFloor = floor;
      } else {
        // Preserve the exact elevated height until the next platform snapshot. Never snap a
        // grounded pet to the desktop floor just because a preference/scale resize happened.
        dynamicFloor = p.fy;
      }
    }
    rawResize();
  };
"""
rep(wrap, old_resize, new_resize)

# Mouse interactions inherit the existing three roaming levels. Passive gaze/turning remains in
# all modes; active chase/jump is off at 'off', occasional at 'calm', and frequent at 'free'.
rep(core,
    "    const free = roam !== 'off' && T > hold && !opts.dialogOpen?.();",
    "    const free = roam !== 'off' && T > hold && !opts.dialogOpen?.();\n    const mouseLevel = roam === 'free' ? 2 : roam === 'calm' ? 1 : 0;")
rep(core,
    "      if (Math.abs(pet.mouseOrbit) >= Math.PI * 3 && T >= pet.mouseDizzyUntil) {",
    "      const orbitNeed = mouseLevel === 2 ? Math.PI * 2.5 : mouseLevel === 1 ? Math.PI * 3 : Math.PI * 3.5;\n      if (Math.abs(pet.mouseOrbit) >= orbitNeed && T >= pet.mouseDizzyUntil) {")
rep(core,
    "          if (pet.turnAcc > .12) { pet.facing *= -1; pet.turnAcc = 0; }",
    "          const turnDelay = mouseLevel === 2 ? .12 : mouseLevel === 1 ? .24 : .45;\n          if (pet.turnAcc > turnDelay) { pet.facing *= -1; pet.turnAcc = 0; }")

old_mouse = """        let mouseReacted = false;
        if (free && !pet.listening && pointer.inside && !press && T >= pet.mouseNext && !(pet.expr && T < pet.exprUntil)) {
          const ax = Math.abs(pdx);
          // Cursor over/near the head: jump toward it. This is intentionally frequent enough to
          // be obvious rather than a rare easter egg.
          if (pdy < -25 && pdy > -360 && ax < 220 && pm < 390) {
            setMode('crouch', {
              jumpV: clamp(650 + (-pdy) * 1.15, 700, 980),
              jumpVx: clamp(pdx * 1.9, -320, 320),
            });
            pet.mouseNext = T + rnd(1.4, 2.2);
            mouseReacted = true;
          } else if (pm < 260 && pSpeed > 750) {
            setExpr('surprised', .8);
            pet.mouseNext = T + rnd(1.0, 1.8);
            mouseReacted = true;
          } else if (pm < 800 && ax > 90 && Math.abs(pdy) < 340) {
            const run = ax > 300 || pSpeed > 700;
            const side = pdx >= 0 ? 1 : -1;
            setMode(run ? 'run' : 'walk', { target: clamp(pointer.x - side * 36, minX(), maxX()) });
            pet.mouseChaseUntil = T + rnd(1.8, 2.8);
            pet.mouseNext = T + rnd(1.0, 1.7);
            mouseReacted = true;
          }
        }
        if (!mouseReacted && free && !pet.listening && T > pet.nextAt && !(pet.expr && T < pet.exprUntil)) decide();
"""
new_mouse = """        let mouseReacted = false;
        if (mouseLevel > 0 && free && !pet.listening && pointer.inside && !press && T >= pet.mouseNext && !(pet.expr && T < pet.exprUntil)) {
          const ax = Math.abs(pdx), eager = mouseLevel === 2;
          if (pdy < -25 && pdy > -360 && ax < 220 && pm < 390) {
            setMode('crouch', {
              jumpV: clamp(650 + (-pdy) * 1.15, 700, 980),
              jumpVx: clamp(pdx * 1.9, -320, 320),
            });
            pet.mouseNext = T + (eager ? rnd(1.2, 2.0) : rnd(4.5, 6.5));
            mouseReacted = true;
          } else if (pm < 260 && pSpeed > 750) {
            setExpr('surprised', .8);
            pet.mouseNext = T + (eager ? rnd(.9, 1.5) : rnd(3.5, 5.5));
            mouseReacted = true;
          } else if (pm < 800 && ax > 90 && Math.abs(pdy) < 340) {
            const run = eager && (ax > 300 || pSpeed > 700);
            const side = pdx >= 0 ? 1 : -1;
            setMode(run ? 'run' : 'walk', { target: clamp(pointer.x - side * 36, minX(), maxX()) });
            pet.mouseChaseUntil = T + (eager ? rnd(2.8, 4.0) : rnd(1.2, 1.9));
            pet.mouseNext = T + (eager ? rnd(1.4, 2.4) : rnd(5.0, 7.5));
            mouseReacted = true;
          }
        }
        if (!mouseReacted && free && !pet.listening && T > pet.nextAt && !(pet.expr && T < pet.exprUntil)) decide();
"""
rep(core, old_mouse, new_mouse)
rep(core,
    "        if (!pet.walkId && pointer.inside && free && T < pet.mouseChaseUntil && Math.abs(pdy) < 380) {",
    "        if (mouseLevel > 0 && !pet.walkId && pointer.inside && free && T < pet.mouseChaseUntil && Math.abs(pdy) < 380) {")
rep(core,
    "    setRoam(r) { roam = r; if (r !== 'off') pet.nextAt = T + 1; },",
    "    setRoam(r) {\n      roam = r;\n      if (r === 'off') {\n        pet.mouseChaseUntil = 0; pet.mouseNext = T + 1;\n        if (!pet.walkId && (pet.mode === 'walk' || pet.mode === 'run')) setMode('idle');\n      } else {\n        pet.nextAt = T + 1;\n        pet.mouseNext = T + (r === 'free' ? .4 : 2.2);\n      }\n    },")

# Delivery helpers delete themselves from the final tree.
Path('scripts/_pet_patch_016.py').unlink()
Path('.github/workflows/_pet-build-016.yml').unlink()
