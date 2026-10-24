import { afterEach, expect, it } from 'vitest';
import { getDecisionPlayerId } from '@money-tour/engine';
import { identity, sign } from '../src/network/crypto';
import { Session, type SavedSession } from '../src/network/session';
import { MemoryNetwork, MemoryTransport } from '../src/network/transport';

const opened: Session[] = [];
afterEach(() => opened.splice(0).forEach((session) => session.close()));

async function table(humans = 2, players = 4) {
  let now = 100000;
  const network = new MemoryNetwork();
  const sessions: Session[] = [];
  for (let i = 0; i < humans; i++) {
    const session = new Session(
      new MemoryTransport(`player-${i}`, network),
      await identity(),
      `Player ${i}`,
      i === 0,
      () => now,
    );
    sessions.push(session);
    opened.push(session);
    await session.join('adventure-start', undefined, false);
  }
  const flush = async () => {
    for (let i = 0; i < 10; i++) {
      await network.flush();
      await Promise.all(sessions.map((session) => session.idle()));
    }
  };
  await flush();
  const host = sessions[0]!;
  await host.start(players, false, 1200000);
  await host.idle();
  await flush();
  return {
    host,
    sessions,
    network,
    flush,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}

it('holds human actions, bot actions and both clocks until all human seats are ready', async () => {
  const { host, sessions, flush, advance } = await table();
  expect(host.view.startGate).toMatchObject({
    deadline: 120000,
    participants: sessions.map((session) => session.user.id),
    ready: [],
  });
  expect(sessions[1]!.view.startGate).toEqual(host.view.startGate);
  const initial = structuredClone(host.state);
  const active = sessions.find((session) => session.user.id === getDecisionPlayerId(host.state!));
  if (active) await active.intent({ type: 'roll', playerId: active.user.id });
  await host.idle();
  advance(10000);
  for (const session of sessions) await session.pulse();
  await flush();
  expect(host.state).toEqual(initial);
  expect(host.frames).toHaveLength(1);
  await sessions[1]!.readyAdventure();
  await flush();
  expect(host.view.startGate?.ready).toEqual([sessions[1]!.user.id]);
  expect(host.state).toEqual(initial);
  const stats = structuredClone(host.stats);
  await host.readyAdventure();
  await flush();
  for (const session of sessions) {
    expect(session.view.startGate).toBeNull();
    expect(session.state).toEqual(initial);
    expect(session.stats).toEqual(stats);
    expect(session.frames.at(-1)?.command.type).toBe('adventure_release');
  }
  advance(1000);
  for (const session of sessions) await session.pulse();
  await flush();
  expect(host.state!.elapsedMs).toBe(1000);
  expect(host.state!.decisionElapsedMs).toBe(1000);
});

it('releases every peer after twenty seconds with a missing click and does not charge that wait to the game', async () => {
  const { host, sessions, flush, advance } = await table(2, 2);
  await host.readyAdventure();
  await flush();
  advance(10000);
  for (const session of sessions) await session.pulse();
  await flush();
  advance(9999);
  for (const session of sessions) await session.pulse();
  await flush();
  expect(host.view.startGate).not.toBeNull();
  expect(host.state!.elapsedMs).toBe(0);
  advance(1);
  await host.pulse();
  await flush();
  expect(sessions.every((session) => session.view.startGate === null)).toBe(true);
  expect(host.state!.elapsedMs).toBe(0);
  expect(host.state!.decisionElapsedMs).toBe(0);
  const count = host.frames.length;
  await sessions[1]!.readyAdventure();
  await flush();
  expect(host.frames).toHaveLength(count);
  advance(1000);
  for (const session of sessions) await session.pulse();
  await flush();
  expect(host.state!.elapsedMs).toBe(1000);
});

it('preserves authenticated readiness and the original deadline when a player reloads', async () => {
  const { host, sessions, network, flush, advance, now } = await table(2, 2);
  const guest = sessions[1]!;
  let saved: SavedSession | undefined;
  guest.onPersist = (value) => {
    saved = structuredClone(value);
  };
  await guest.readyAdventure();
  await flush();
  const initialGate = structuredClone(host.view.startGate);
  guest.close();
  advance(5000);
  const returned = new Session(
    new MemoryTransport('returned', network),
    guest.user,
    guest.name,
    false,
    now,
  );
  sessions.push(returned);
  opened.push(returned);
  await returned.join('adventure-start', saved, false);
  await flush();
  expect(returned.view.startGate).toEqual(initialGate);
  returned.onPersist = (value) => {
    saved = structuredClone(value);
  };
  await host.readyAdventure();
  await flush();
  expect(host.view.startGate).toBeNull();
  expect(returned.view.startGate).toBeNull();
  await returned.pulse();
  await flush();
  const released = new Session(
    new MemoryTransport('released-reload', network),
    returned.user,
    returned.name,
    false,
    now,
  );
  opened.push(released);
  await released.join('adventure-start', saved, false);
  expect(released.view.startGate).toBeNull();
});

it('starts the twenty second window after the opening entropy ceremony completes', async () => {
  let now = 100000;
  const network = new MemoryNetwork();
  const host = new Session(
    new MemoryTransport('slow-host', network),
    await identity(),
    'Host',
    true,
    () => now,
  );
  const guest = new Session(
    new MemoryTransport('slow-guest', network),
    await identity(),
    'Guest',
    false,
    () => now,
  );
  opened.push(host, guest);
  await host.join('slow-start', undefined, false);
  await guest.join('slow-start', undefined, false);
  for (let i = 0; i < 8; i++) {
    await network.flush();
    await Promise.all([host.idle(), guest.idle()]);
  }
  await host.start(2, false, 1200000);
  await host.idle();
  now += 12000;
  for (let i = 0; i < 10; i++) {
    await network.flush();
    await Promise.all([host.idle(), guest.idle()]);
  }
  expect(host.view.startGate?.deadline).toBe(132000);
  expect(guest.view.startGate).toEqual(host.view.startGate);
});

it('rejects forged readiness and signatures from an unrelated adventure gate', async () => {
  const { host, sessions, network, flush } = await table(2, 2);
  const guest = sessions[1]!;
  const gate = host.view.startGate!;
  const room = host.frames[0]!.room;
  const send = async (gateId: string, signature: string) => {
    const unsigned = {
      room,
      from: guest.user.id,
      peer: guest.transport.peerId,
      serial: 900,
      key: guest.user.publicKey,
      body: { type: 'adventure_ready', gate: gateId, signature },
    };
    guest.transport.send({ ...unsigned, signature: await sign(guest.user.privateKey, unsigned) });
    await network.flush();
    await host.idle();
  };
  const unrelated = 'f'.repeat(64);
  await send(
    gate.id,
    await sign(guest.user.privateKey, {
      domain: 'money-tour-adventure-ready-v1',
      room,
      gate: unrelated,
      playerId: guest.user.id,
    }),
  );
  expect(host.view.startGate?.ready).toEqual([]);
  await host.readyAdventure();
  await flush();
  expect(host.view.startGate?.ready).toEqual([host.user.id]);
});

it('creates a fresh barrier for a rematch and does not reuse the previous game readiness', async () => {
  const { host, sessions, flush } = await table(2, 2);
  const firstGate = host.view.startGate!.id;
  await Promise.all(sessions.map((session) => session.readyAdventure()));
  await flush();
  await host.intent({ type: 'quit', playerId: host.user.id });
  await host.idle();
  await flush();
  expect(host.state!.winner).toBeTruthy();
  await host.rematch();
  await host.idle();
  await flush();
  expect(host.view.startGate?.id).not.toBe(firstGate);
  expect(host.view.startGate?.ready).toEqual([]);
  expect(host.state!.seq).toBe(0);
  await host.readyAdventure();
  await flush();
  expect(host.view.startGate).not.toBeNull();
});

it('keeps the original deadline through a host migration and releases without the absent host click', async () => {
  const { host, sessions, flush, advance } = await table(3, 3);
  const next = sessions[1]!;
  const guest = sessions[2]!;
  const deadline = host.view.startGate!.deadline;
  await next.readyAdventure();
  await guest.readyAdventure();
  await flush();
  host.close();
  advance(15001);
  await next.pulse();
  await flush();
  await guest.pulse();
  await flush();
  expect(next.isHost).toBe(true);
  expect(guest.host).toBe(next.user.id);
  expect(next.view.startGate?.deadline).toBe(deadline);
  advance(4999);
  await next.pulse();
  await flush();
  expect(next.view.startGate).toBeNull();
  expect(guest.view.startGate).toBeNull();
  expect(next.state!.elapsedMs).toBe(0);
});

it('times out with a disconnected guest without converting its reserved seat to a bot', async () => {
  const { host, sessions, flush, advance } = await table(2, 2);
  const guest = sessions[1]!;
  await host.readyAdventure();
  await flush();
  guest.close();
  advance(20000);
  await host.pulse();
  await flush();
  expect(host.view.startGate).toBeNull();
  expect(host.state!.players.find((player) => player.id === guest.user.id)?.bot).toBe(false);
  expect(host.state!.elapsedMs).toBe(0);
});

it('rejects a legacy live client with a clear refresh message', async () => {
  const { host, sessions, flush } = await table(2, 2);
  const guest = sessions[1]!;
  const unsigned = {
    room: host.frames[0]!.room,
    from: guest.user.id,
    peer: guest.transport.peerId,
    serial: 901,
    key: guest.user.publicKey,
    body: {
      type: 'hello',
      name: guest.name,
      creator: false,
      epoch: guest.epoch,
      index: guest.frames.length,
      head: guest.head,
    },
  };
  guest.transport.send({ ...unsigned, signature: await sign(guest.user.privateKey, unsigned) });
  await flush();
  expect(host.incidents.join(' ')).toContain('actualisez la page sur tous les appareils');
  expect(host.view.startGate).not.toBeNull();
});
