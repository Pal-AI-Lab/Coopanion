/** The bot's name (`displayName` in Core's config) saved on a page: the rail shows it at once. */

const SAVED = 'companion-name-saved';

export function announceName(name: string): void {
  window.dispatchEvent(new CustomEvent<string>(SAVED, { detail: name }));
}

export function onNameSaved(cb: (name: string) => void, signal: AbortSignal): void {
  window.addEventListener(SAVED, (e) => cb((e as CustomEvent<string>).detail), { signal });
}
