import type { ExtensionView } from '../extensions/index.ts';
import type { WorldView } from './index.ts';

export interface WorldLibraryItem {
  key: string;
  label: string;
  world?: WorldView;
  extension?: ExtensionView;
}

/** Pending downloads lead the list; every other item retains the server's assembly order. */
export function worldLibrary(worlds: readonly WorldView[], extensions: readonly ExtensionView[], recent: readonly string[] = []): WorldLibraryItem[] {
  const available = extensions.filter(item => item.kind === 'world' || !item.kind);
  const used = new Set<string>();
  const items: WorldLibraryItem[] = worlds.map(world => {
    const extension = available.find(item => item.worldId === world.id);
    if (extension) used.add(extension.name);
    return { key: extension?.name ?? `world:${world.id}`, label: world.label || extension?.metadata?.displayName || world.id, world, extension };
  });
  for (const extension of available) if (!used.has(extension.name)) {
    items.push({ key: extension.name, label: extension.metadata?.displayName || extension.label || extension.worldId || extension.name, extension });
  }
  const rank = (item: WorldLibraryItem) => {
    if (item.extension?.state !== 'pending-restart') return recent.length + 1;
    const index = recent.indexOf(item.extension.name);
    return index < 0 ? recent.length : index;
  };
  return items.sort((a, b) => rank(a) - rank(b));
}
