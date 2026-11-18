export async function playEgg(stage, getLayout, visible, action, expiresAt) {
  const win = stage.ownerDocument.defaultView;
  const image = stage.ownerDocument.createElement('img');
  image.className = 'pet-holiday-effect';
  image.alt = '';
  image.draggable = false;
  image.src = '/web/' + action.asset;
  await image.decode();
  const figure = getLayout();
  if (!figure?.box.h || !visible() || Date.now() >= expiresAt) return 'unavailable';
  const scale = Math.min(1, win.innerWidth / action.width, win.innerHeight / action.height);
  const width = action.width * scale, height = action.height * scale;
  image.style.width = width + 'px';
  image.style.left = Math.max(0, Math.min(win.innerWidth - width, figure.x - width / 2)) + 'px';
  image.style.top = Math.max(0, Math.min(win.innerHeight - height, figure.box.y + figure.box.h / 2 - height)) + 'px';
  stage.prepend(image);
  win.setTimeout(() => image.remove(), action.durationMs);
  return 'started';
}
