/**
 * A picture of the body for the bot to look at (`pet_see_self`): the part of the pet window the page names, as
 * the window draws it, laid over a plain backdrop in place of the desktop, as a PNG.
 *
 * Every figure runs in the page's sandboxed frame (web/body-host.js), whose pixels the page cannot read, so the
 * picture is taken from the window's own drawing, the way the streaming layer's frames are (overlay.cjs).
 */

/** The backdrop's grey, 0–255: a light body and a dark one both show against it. */
const BACKDROP = 128;
/**
 * The longest side of the picture, in pixels; a larger capture is scaled down to it. The page's rect is about
 * 1.8 × 2.4 body boxes, and a box about 108 CSS pixels at size 1: at 200 % display scaling that is 390 × 520 pixels,
 * unscaled up to size 2. A figure enlarged further (the size goes to 10) still comes out at most a megapixel.
 */
const MAX_SIDE = 1024;

/**
 * Lays `pixels` (BGRA, alpha premultiplied, as Chromium paints a transparent window) over the backdrop, in place:
 * every pixel comes out opaque.
 */
function flatten(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    const rest = BACKDROP * (255 - pixels[i + 3]) / 255;
    pixels[i] = Math.min(255, Math.round(pixels[i] + rest));
    pixels[i + 1] = Math.min(255, Math.round(pixels[i + 1] + rest));
    pixels[i + 2] = Math.min(255, Math.round(pixels[i + 2] + rest));
    pixels[i + 3] = 255;
  }
  return pixels;
}

/**
 * The picture of `rect` (CSS pixels of the page) of window `win`: `{ png, width, height }`, the PNG in base64
 * and its size in pixels, or null when the rect is empty or the window gave no pixels. `nativeImage` is Electron's.
 */
async function capturePortrait(win, rect, nativeImage) {
  const r = rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    ? { x: Math.max(0, Math.floor(rect.x)), y: Math.max(0, Math.floor(rect.y)), width: Math.ceil(rect.width), height: Math.ceil(rect.height) }
    : null;
  if (!r || r.width < 1 || r.height < 1) return null;
  const shot = await win.webContents.capturePage(r);
  const { width, height } = shot.getSize();
  if (!width || !height) return null;
  let image = nativeImage.createFromBitmap(flatten(shot.toBitmap()), { width, height });
  const k = MAX_SIDE / Math.max(width, height);
  if (k < 1) image = image.resize({ width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), quality: 'best' });
  const size = image.getSize();
  return { png: image.toPNG().toString('base64'), width: size.width, height: size.height };
}

module.exports = { capturePortrait, flatten, BACKDROP, MAX_SIDE };
