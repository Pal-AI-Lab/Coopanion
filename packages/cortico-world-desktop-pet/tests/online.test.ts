import { afterEach, describe, expect, it } from 'vitest';
import { DESKTOP_PET_DEFAULTS, type PetSkin } from '../src/config.ts';
import {
  ONLINE_DEFAULT_PORT, ONLINE_TICK_MS, OnlineRoom,
  type OnlineBehavior, type OnlinePlayer, type OnlineSnapshot,
} from '../src/online.ts';

const rooms: OnlineRoom[] = [];
afterEach(async () => {
  await Promise.all(rooms.splice(0).map((room) => room.stop()));
});

function room(snapshot: OnlineSnapshot) {
  const peers: OnlinePlayer[] = [];
  const pages: Array<{ active: boolean; players: OnlinePlayer[] }> = [];
  const removed: string[] = [];
  const behaviors: Array<{ id: string; behavior: OnlineBehavior }> = [];
  const online = new OnlineRoom({
    snapshot: () => snapshot,
    onPageState: (state) => pages.push(state),
    onPeer: (player) => {
      const at = peers.findIndex((p) => p.id === player.id);
      if (at < 0) peers.push(player);
      else peers[at] = player;
    },
    onRemove: (id) => {
      removed.push(id);
      const at = peers.findIndex((p) => p.id === id);
      if (at >= 0) peers.splice(at, 1);
    },
    onBehavior: (id, behavior) => behaviors.push({ id, behavior }),
  });
  rooms.push(online);
  return { online, peers, pages, removed, behaviors };
}

const skin = (palette: string): PetSkin => ({ ...structuredClone(DESKTOP_PET_DEFAULTS.skin), palette });

describe('LAN rooms', () => {
  it('uses port 11451 and a 20 Hz position tick by default', () => {
    expect(ONLINE_DEFAULT_PORT).toBe(11451);
    expect(ONLINE_TICK_MS).toBe(50);
  });

  it('exchanges normalized x and y at the room tick and keeps creating and joining exclusive', async () => {
    const hostState: OnlineSnapshot = { x: .2, y: -.02, dragging: false, facing: 1, skin: skin('mint') };
    const guestState: OnlineSnapshot = { x: .8, y: -.04, dragging: false, facing: -1, skin: skin('violet') };
    const host = room(hostState);
    const guest = room(guestState);

    const hosted = await host.online.create('Host', '127.0.0.1', 0);
    expect(hosted).toMatchObject({ mode: 'host', phase: 'connected' });
    const joined = await guest.online.join('Guest', '127.0.0.1', hosted.port);
    expect(joined).toMatchObject({ mode: 'guest', phase: 'connected' });
    expect(guest.pages.at(-1)).toMatchObject({ active: true, players: [expect.objectContaining({ name: 'Host' })] });
    expect((await host.online.join('Host', '127.0.0.1', hosted.port)).error?.code).toBe('busy');
    expect((await guest.online.create('Guest', '127.0.0.1', 0)).error?.code).toBe('busy');

    await expect.poll(() => guest.peers.find((p) => p.name === 'Host')).toMatchObject({ x: .2, y: -.02, facing: 1 });
    await expect.poll(() => host.peers.find((p) => p.name === 'Guest')).toMatchObject({ x: .8, y: -.04, facing: -1 });

    hostState.x = .55;
    hostState.y = -.12;
    hostState.dragging = true;
    hostState.facing = -1;
    await expect.poll(() => guest.peers.find((p) => p.name === 'Host')).toMatchObject({ x: .55, y: -.12, dragging: true, facing: -1 });
  });

  it('relays visual actions in both directions', async () => {
    const host = room({ x: .5, y: 0, dragging: false, facing: 1, skin: skin('mint') });
    const guest = room({ x: .5, y: 0, dragging: false, facing: 1, skin: skin('mint') });
    const hosted = await host.online.create('Host', '127.0.0.1', 0);
    await guest.online.join('Guest', '127.0.0.1', hosted.port);

    host.online.sendBehavior({ kind: 'action', action: 'wave' });
    guest.online.sendBehavior({ kind: 'action', action: 'love' });
    guest.online.sendBehavior({ kind: 'interrupt' });
    await expect.poll(() => guest.behaviors.some((entry) => entry.behavior.kind === 'action')).toBe(true);
    await expect.poll(() => host.behaviors.some((entry) => entry.behavior.kind === 'action')).toBe(true);
    await expect.poll(() => host.behaviors.some((entry) => entry.behavior.kind === 'interrupt')).toBe(true);
  });

  it('includes each player current visual state when another player joins', async () => {
    const host = room({ x: .5, y: 0, dragging: false, facing: 1, skin: skin('mint') });
    const first = room({ x: .5, y: 0, dragging: false, facing: 1, skin: skin('mint') });
    const late = room({ x: .5, y: 0, dragging: false, facing: 1, skin: skin('mint') });
    const hosted = await host.online.create('Host', '127.0.0.1', 0);
    host.online.sendBehavior({ kind: 'state', action: 'sleep' });
    await first.online.join('First', '127.0.0.1', hosted.port);
    first.online.sendBehavior({ kind: 'state', action: 'sit' });
    await expect.poll(() => host.peers.find((p) => p.name === 'First')?.action).toBe('sit');

    await late.online.join('Late', '127.0.0.1', hosted.port);
    expect(late.peers.find((p) => p.name === 'Host')?.action).toBe('sleep');
    expect(late.peers.find((p) => p.name === 'First')?.action).toBe('sit');
  });

  it('removes the guest from the host page when the guest leaves', async () => {
    const host = room({ x: .5, y: 0, dragging: false, facing: 1, skin: skin('mint') });
    const guest = room({ x: .5, y: 0, dragging: false, facing: 1, skin: skin('mint') });
    const hosted = await host.online.create('Host', '127.0.0.1', 0);
    await guest.online.join('Guest', '127.0.0.1', hosted.port);
    await expect.poll(() => host.peers.length).toBe(1);
    const id = host.peers[0]!.id;
    await guest.online.leave();
    await expect.poll(() => host.removed).toContain(id);
    expect(host.peers).toEqual([]);
  });
});
