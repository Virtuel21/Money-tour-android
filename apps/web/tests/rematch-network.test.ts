import { expect, it } from 'vitest';
import { identity } from '../src/network/crypto';
import { Session, type SavedSession } from '../src/network/session';
import { MemoryNetwork, MemoryTransport } from '../src/network/transport';

it('replays a signed rematch in the same salon and preserves seats, settings and convergence', async () => {
  const network = new MemoryNetwork();
  const host = new Session(new MemoryTransport('host', network), await identity(), 'Léa', true);
  const guest = new Session(new MemoryTransport('guest', network), await identity(), 'Max');
  const sessions = [host, guest];
  const flush = async () => {
    for (let i = 0; i < 10; i++) {
      await network.flush();
      await Promise.all(sessions.map((s) => s.idle()));
    }
  };
  let saved: SavedSession | undefined;
  guest.onPersist = (save) => {
    saved = structuredClone(save);
  };
  try {
    await host.join('rematch', undefined, false);
    await guest.join('rematch', undefined, false);
    await flush();
    await host.start(2, false, 120000, 'fast');
    await host.idle();
    await flush();
    await Promise.all(sessions.map((s) => s.readyAdventure()));
    await flush();
    const table = host.state!.players.map((p) => [p.id, p.name, p.bot]);
    const initialFrames = host.frames.length;
    await host.rematch();
    await host.idle();
    await flush();
    expect(host.frames).toHaveLength(initialFrames);
    await host.intent({ type: 'quit', playerId: host.user.id });
    await host.idle();
    await flush();
    expect(host.state?.winner).toBeTruthy();
    await guest.rematch();
    await guest.idle();
    await flush();
    expect(host.state?.winner).toBeTruthy();
    await host.rematch();
    await host.idle();
    await flush();
    expect(host.state?.winner).toBeNull();
    expect(host.state?.seq).toBe(0);
    expect(host.state?.firstPlayer).toBe(host.state?.currentPlayer);
    expect(host.state?.players.map((p) => [p.id, p.name, p.bot])).toEqual(table);
    expect(host.state?.durationMs).toBe(120000);
    expect(host.state?.presentationPace).toBe('fast');
    expect(host.state).toEqual(guest.state);
    expect(host.stats).toEqual(guest.stats);
    expect(host.stats?.rent).toEqual({});
    expect(host.frames.at(-1)?.command.type).toBe('rematch');
    expect(host.frames.at(-1)?.proof).toBeTruthy();
    expect(saved).toBeDefined();
    guest.close();
    const resumed = new Session(new MemoryTransport('returned', network), guest.user, 'Max');
    sessions.push(resumed);
    await resumed.join('rematch', saved, false);
    await flush();
    expect(resumed.state).toEqual(host.state);
    expect(resumed.stats).toEqual(host.stats);
  } finally {
    sessions.forEach((s) => s.close());
  }
});
