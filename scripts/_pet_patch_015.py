from pathlib import Path
import re

ROOT = Path('.')

def text(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, s):
    (ROOT / path).write_text(s, encoding='utf-8', newline='\n')

def rep(path, old, new, count=1):
    s = text(path)
    if s.count(old) < count:
        raise SystemExit(f'{path}: missing replacement:\n{old[:220]}')
    s = s.replace(old, new, count)
    write(path, s)

def sub(path, pattern, replacement, flags=re.S):
    s = text(path)
    s2, n = re.subn(pattern, replacement, s, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f'{path}: regex matched {n}: {pattern[:180]}')
    write(path, s2)

core = 'packages/cortico-world-desktop-pet/web/pet-core.js'
wrap = 'packages/cortico-world-desktop-pet/web/pet-core-platforms.js'
host = 'packages/cortico-world-desktop-pet/host/electron-main.cjs'
scan = 'packages/cortico-world-desktop-pet/host/windows-platforms.cjs'
pkg = 'package.json'

# Version.
rep(pkg, '"version": "0.1.14"', '"version": "0.1.15"')

# Faster global cursor reporting for visible tracking/chasing.
rep(host, 'const CURSOR_EVERY_MS = 100;', 'const CURSOR_EVERY_MS = 50;')

# Mark layered / mouse-transparent native windows so their invisible rectangle is not treated as solid.
rep(scan,
    "      GetWindowTextW: user32.func('int __stdcall GetWindowTextW(intptr_t hwnd, void *text, int maxCount)'),\n      DwmGetWindowAttribute,",
    "      GetWindowTextW: user32.func('int __stdcall GetWindowTextW(intptr_t hwnd, void *text, int maxCount)'),\n      GetWindowLongW: user32.func('int32_t __stdcall GetWindowLongW(intptr_t hwnd, int index)'),\n      DwmGetWindowAttribute,")
rep(scan,
    "          if (rect && width >= 24 && height >= 12) {\n            const title = wideText(native.GetWindowTextW, hwnd, 512);\n            const rainmeter = /rainmeter/i.test(className) || /rainmeter/i.test(title);\n            out.push({",
    "          if (rect && width >= 24 && height >= 12) {\n            const title = wideText(native.GetWindowTextW, hwnd, 512);\n            const rainmeter = /rainmeter/i.test(className) || /rainmeter/i.test(title);\n            const exStyle = native.GetWindowLongW(hwnd, -20) >>> 0; // GWL_EXSTYLE\n            const layered = !!(exStyle & 0x00080000); // WS_EX_LAYERED\n            const transparent = !!(exStyle & 0x00000020); // WS_EX_TRANSPARENT\n            out.push({")
rep(scan,
    "              kind: rainmeter ? 'rainmeter' : 'window',\n              className,\n              title,",
    "              kind: rainmeter ? 'rainmeter' : 'window',\n              className,\n              title,\n              layered,\n              transparent,")

# Screen capture can optionally include layered windows (Rainmeter/docks/widgets).
rep(host,
    'function grabScreen(x, y, w, h, ow, oh) {',
    'function grabScreen(x, y, w, h, ow, oh, captureLayered = false) {')
rep(host,
    "    const SRCCOPY = 0x00CC0020;\n    const ok = gdi.StretchBlt(memDc, 0, 0, ow, oh, screenDc, x, y, w, h, SRCCOPY);",
    "    const SRCCOPY = 0x00CC0020;\n    const CAPTUREBLT = 0x40000000;\n    const rop = captureLayered ? (SRCCOPY | CAPTUREBLT) : SRCCOPY;\n    const ok = gdi.StretchBlt(memDc, 0, 0, ow, oh, screenDc, x, y, w, h, rop);")

visual_fn = r'''
/**
 * Finds long, actually visible horizontal edges in the composed desktop image. This catches
 * controls and layered surfaces (Rainmeter, docks, wallpaper widgets, browser controls) that do
 * not have a useful top-level HWND rectangle. Short/text-like edges are rejected.
 */
function scanVisualSurfaces(win) {
  if (!gdi || !win) return [];
  const wb = win.getBounds();
  const phys = screen.dipToScreenRect(win, { x: wb.x, y: wb.y, width: wb.width, height: wb.height });
  const step = 4;
  const ow = Math.max(1, Math.ceil(phys.width / step));
  const oh = Math.max(1, Math.ceil(phys.height / step));
  if (ow < 8 || oh < 8) return [];
  const bits = grabScreen(phys.x, phys.y, phys.width, phys.height, ow, oh, true);
  if (!bits) return [];

  const sx = wb.width / ow, sy = wb.height / oh;
  const minWidth = 112;
  const edgeThreshold = 30;
  const densityMin = .72;
  const raw = [];
  const edge = (x, y) => {
    const a = ((y - 2) * ow + x) * 4, b = ((y + 2) * ow + x) * 4;
    const db = Math.abs(bits[a] - bits[b]);
    const dg = Math.abs(bits[a + 1] - bits[b + 1]);
    const dr = Math.abs(bits[a + 2] - bits[b + 2]);
    return Math.max(dr, dg, db);
  };
  const finish = (y, start, end, hits) => {
    if (start < 0 || end < start) return;
    const span = end - start + 1;
    const width = span * sx;
    if (width < minWidth || hits / span < densityMin) return;
    raw.push({
      id: `visual:${y}:${start}:${end}`,
      left: start * sx,
      right: Math.min(wb.width, (end + 1) * sx),
      top: y * sy,
      bottom: y * sy + Math.max(2, sy),
      kind: 'visual',
      className: '',
      title: '',
      layered: false,
      transparent: false,
    });
  };

  for (let y = 2; y < oh - 2; y++) {
    let start = -1, lastHit = -1, hits = 0;
    for (let x = 1; x < ow - 1; x++) {
      if (edge(x, y) >= edgeThreshold) {
        if (start < 0) start = x;
        lastHit = x;
        hits++;
      } else if (start >= 0 && x - lastHit > 1) {
        finish(y, start, lastHit, hits);
        start = -1; lastHit = -1; hits = 0;
      }
    }
    if (start >= 0) finish(y, start, lastHit, hits);
  }

  // Join neighbouring fragments of the same horizontal edge and cap the result to keep the
  // renderer-side collision loop cheap.
  raw.sort((a, b) => a.top - b.top || a.left - b.left);
  const merged = [];
  for (const p of raw) {
    const q = merged[merged.length - 1];
    if (q && Math.abs(q.top - p.top) <= Math.max(3, sy) && p.left <= q.right + 12) {
      q.right = Math.max(q.right, p.right);
      q.bottom = Math.max(q.bottom, p.bottom);
    } else merged.push({ ...p });
    if (merged.length >= 180) break;
  }
  return merged;
}
'''

# Insert visual scanner after grabScreen.
marker = "\n/**\n * Screen pixels under `rect`, leaving out those inside any of `skip`; both in page coordinates"
s = text(host)
pos = s.find(marker)
if pos < 0:
    raise SystemExit('electron-main: sampleBackdrop marker not found')
s = s[:pos] + '\n' + visual_fn + s[pos:]
write(host, s)

# Native normal windows keep their top edge. Layered/transparent/Rainmeter windows rely on visible
# pixels so transparent padding no longer creates an invisible full-width platform. Add global
# visual edges so browser controls, MyDockFinder and Wallpaper Engine widgets can also become surfaces.
rep(host,
    "    if (right - left < 16 || top < 0 || top >= wb.height || bottom <= 0) continue;\n    out.push({ ...p, left, right, top, bottom });\n  }\n  return out;",
    "    if (right - left < 16 || top < 0 || top >= wb.height || bottom <= 0) continue;\n    if (!p.layered && !p.transparent && p.kind !== 'rainmeter') out.push({ ...p, left, right, top, bottom });\n  }\n  out.push(...scanVisualSurfaces(win));\n  return out;")

# Stronger mouse tracking and more deterministic pursuit.
rep(core,
    "    mouseNext: 0, mouseAngle: null, mouseOrbit: 0, mouseDizzyUntil: 0, bonkDizzy: false,",
    "    mouseNext: 0, mouseAngle: null, mouseOrbit: 0, mouseDizzyUntil: 0, mouseChaseUntil: 0, bonkDizzy: false,")
rep(core,
    "      return [pdx * pet.facing / pm * 9 * k, pdy / pm * 7 * k];",
    "      return [pdx * pet.facing / pm * 14 * k, pdy / pm * 11 * k];")
rep(core,
    "        && pm >= 55 && pm <= 270 && pSpeed >= 300) {",
    "        && pm >= 45 && pm <= 320 && pSpeed >= 250) {")
rep(core,
    "        if (pointer.inside && !press && pdx * pet.facing < -35 && pm < 750) {\n          pet.turnAcc += dt;\n          if (pet.turnAcc > .35) { pet.facing *= -1; pet.turnAcc = 0; }",
    "        if (pointer.inside && !press && pdx * pet.facing < -24 && pm < 1000) {\n          pet.turnAcc += dt;\n          if (pet.turnAcc > .12) { pet.facing *= -1; pet.turnAcc = 0; }")

idle_old = """        let mouseReacted = false;
        if (free && !pet.listening && pointer.inside && !press && T >= pet.mouseNext && !(pet.expr && T < pet.exprUntil)) {
          const ax = Math.abs(pdx);
          if (pdy < -45 && pdy > -280 && ax < 170 && pm < 300) {
            setMode('crouch', {
              jumpV: clamp(610 + (-pdy) * 1.05, 650, 900),
              jumpVx: clamp(pdx * 1.6, -260, 260),
            });
            pet.mouseNext = T + rnd(3, 5);
            mouseReacted = true;
          } else if (pm < 220 && pSpeed > 1000) {
            setExpr('surprised', .8);
            pet.mouseNext = T + rnd(2, 3.5);
            mouseReacted = true;
          } else if (pm < 600 && ax > 150 && Math.abs(pdy) < 280 && Math.random() < .7) {
            const run = ax > 320 && Math.random() < .45;
            const side = pdx >= 0 ? 1 : -1;
            setMode(run ? 'run' : 'walk', { target: clamp(pointer.x - side * 55, minX(), maxX()) });
            pet.mouseNext = T + rnd(2.5, 4.8);
            mouseReacted = true;
          }
        }
"""
idle_new = """        let mouseReacted = false;
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
"""
rep(core, idle_old, idle_new)

# A mouse-started walk keeps steering toward the moving cursor. Explicit external walks (walkId)
# are not hijacked.
rep(core,
    "      case 'walk': case 'run': {\n        const run = m === 'run', d = pet.target - pet.x, dist = Math.abs(d), dir = Math.sign(d) || pet.facing;",
    "      case 'walk': case 'run': {\n        if (!pet.walkId && pointer.inside && free && T < pet.mouseChaseUntil && Math.abs(pdy) < 380) {\n          const side = pdx >= 0 ? 1 : -1;\n          pet.target = clamp(pointer.x - side * 30, minX(), maxX());\n        }\n        const run = m === 'run', d = pet.target - pet.x, dist = Math.abs(d), dir = Math.sign(d) || pet.facing;")

# Scripted look/sit gives way quickly when the mouse is actively nearby, making interaction visible.
rep(core,
    "      case 'look': {\n        if (!pet.cue) { pet.cue = 1; sfx.hmm(); }",
    "      case 'look': {\n        if (free && pointer.inside && pm < 520 && pSpeed > 120) { setMode('idle'); pet.nextAt = T; break; }\n        if (!pet.cue) { pet.cue = 1; sfx.hmm(); }")
rep(core,
    "      case 'sit': {\n        sitT = 1;",
    "      case 'sit': {\n        if (free && pointer.inside && pm < 420 && pSpeed > 180) { setMode('idle'); pet.nextAt = T; break; }\n        sitT = 1;")

# A hard head bonk shows dizzy eyes immediately while airborne.
rep(core,
    "    if (m === 'air' && pet.airKind === 'throw') return pet.vy < 0 ? 'dragged' : 'surprised';\n    if (m === 'air' && ['drop', 'ledge', 'bonk'].includes(pet.airKind)) return 'surprised';",
    "    if (m === 'air' && pet.airKind === 'throw') return pet.vy < 0 ? 'dragged' : 'surprised';\n    if (m === 'air' && pet.airKind === 'bonk' && pet.bonkDizzy) return 'dizzy';\n    if (m === 'air' && ['drop', 'ledge', 'bonk'].includes(pet.airKind)) return 'surprised';")

# Ceiling sweep is wider and tolerant; the previous exact line crossing missed normal jumps.
old_ceiling = """  function ceilingCrossing(x, fromY, toY) {
    if (toY >= fromY) return null;
    let hit = null;
    for (const p of surfaces) {
      if (x < p.left || x > p.right || p.bottom <= p.top) continue;
      if (fromY >= p.bottom - 2 && toY <= p.bottom + 2 && (!hit || p.bottom > hit.bottom)) hit = p;
    }
    return hit;
  }
"""
new_ceiling = """  function ceilingCrossing(x, fromY, toY, halfWidth) {
    if (toY >= fromY) return null;
    let hit = null;
    const sweepTop = Math.min(fromY, toY), sweepBottom = Math.max(fromY, toY);
    for (const p of surfaces) {
      if (x + halfWidth < p.left || x - halfWidth > p.right || p.bottom <= p.top) continue;
      const y = p.bottom;
      // A few pixels of tolerance account for 4 px visual sampling, DPI rounding and one-frame
      // motion. The old exact crossing test commonly stepped past this line without matching.
      if (sweepTop <= y + 10 && sweepBottom >= y - 14 && (!hit || y > hit.bottom)) hit = p;
    }
    return hit;
  }
"""
rep(wrap, old_ceiling, new_ceiling)
rep(wrap,
    "    const headH = 250 * rawBounds().S;",
    "    const headH = 262 * rawBounds().S;")
rep(wrap,
    "      const ceiling = ceilingCrossing(ctl.pet.x, beforeHead, afterHead);",
    "      const ceiling = ceilingCrossing(ctl.pet.x, beforeHead, afterHead, 42 * rawBounds().S);")
rep(wrap,
    "        ctl.pet.bonkDizzy ||= impact >= 620;",
    "        ctl.pet.bonkDizzy ||= impact >= 380;")

# Temporary delivery files remove themselves from final main.
Path('scripts/_pet_patch_015.py').unlink(missing_ok=True)
Path('.github/workflows/_pet-build-015.yml').unlink(missing_ok=True)
