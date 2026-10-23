import { describe, it, expect } from 'vitest';
import {
  Ceremony,
  commitment,
  drawSeed,
  hash,
  identity,
  secret,
  sign,
  verify,
} from '../src/network/crypto';
import { MemoryNetwork, MemoryTransport } from '../src/network/transport';
import { execute, Session, type SavedSession } from '../src/network/session';
import { getDecisionPlayerId, getLegalActions } from '@money-tour/engine';
import { DISCONNECT_GRACE_MS } from '../src/network/policy';

describe('shared randomness', () => {
  it('requires identical commitments before reveal and verifies every secret', async () => {
    const context = {
      room: 'a'.repeat(64),
      epoch: 0,
      seq: 0,
      parent: '0'.repeat(64),
      command: 'b'.repeat(64),
      participants: ['a', 'b'],
      nonce: secret(),
    };
    const ceremony = new Ceremony(context);
    const a = secret(),
      b = secret();
    expect(() => ceremony.put('reveal', 'a', a)).toThrow('Early');
    ceremony.put('commit', 'a', await commitment(context, 'a', a));
    ceremony.put('commit', 'b', await commitment(context, 'b', b));
    const lock = await hash(ceremony.commitments);
    ceremony.put('lock', 'a', lock);
    ceremony.put('lock', 'b', lock);
    ceremony.put('reveal', 'a', a);
    expect(() => ceremony.proof()).toThrow('Incomplete');
    ceremony.put('reveal', 'b', b);
    const proof = ceremony.proof();
    expect(await drawSeed(proof)).toHaveLength(64);
    await expect(drawSeed({ ...proof, secrets: { a, b: secret() } })).rejects.toThrow(
      'Invalid reveal',
    );
    await expect(drawSeed({ ...proof, context: { ...context, seq: 1 } })).rejects.toThrow(
      'Invalid reveal',
    );
    expect(() => ceremony.put('commit', 'a', secret())).toThrow('Conflicting');
    expect(() => ceremony.put('commit', 'intruder', secret())).toThrow('Invalid');
  });
  it('rejects forged identity signatures', async () => {
    const user = await identity();
    const value = { action: 'buy', seq: 4 };
    const signature = await sign(user.privateKey, value);
    expect(await verify(user.publicKey, value, signature)).toBe(true);
    expect(await verify(user.publicKey, { ...value, seq: 5 }, signature)).toBe(false);
  });
});

async function setup(count = 3, names?: string[]) {
  const network = new MemoryNetwork();
  let time = 100000;
  const sessions: Session[] = [];
  for (let i = 0; i < count; i++) {
    const session = new Session(
      new MemoryTransport(`peer-${i}`, network),
      await identity(),
      names?.[i] ?? `Joueur ${i}`,
      i === 0,
      () => time,
    );
    sessions.push(session);
    await session.join('test-code', undefined, false);
  }
  async function flush() {
    for (let n = 0; n < 8; n++) {
      await network.flush();
      await Promise.all(sessions.map((s) => s.idle()));
    }
  }
  await flush();
  return {
    network,
    sessions,
    flush,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
describe('network sessions', () => {
  it('still accepts a new guest after the host has waited alone for thirty minutes', async () => {
    const { network, sessions, flush, advance } = await setup(1);
    const host = sessions[0]!;
    for (let minute = 0; minute < 30; minute++) {
      advance(60000);
      await host.pulse();
      await flush();
    }
    const guest = new Session(
      new MemoryTransport('late-guest', network),
      await identity(),
      'Invité tardif',
    );
    sessions.push(guest);
    await guest.join('test-code', undefined, false);
    await flush();
    expect(host.members.map((member) => member.name)).toEqual(['Joueur 0', 'Invité tardif']);
    expect(guest.members).toEqual(host.members);
    expect(guest.host).toBe(host.user.id);
    await host.start(2, false, 60000);
    await host.idle();
    await flush();
    expect(host.state).not.toBeNull();
    expect(guest.head).toBe(host.head);
    sessions.forEach((session) => session.close());
  });
  it('stores distinct public names even when clients arrive with the old Vous default', async () => {
    const { sessions, flush } = await setup(2, ['Vous', 'Vous']);
    await sessions[0]!.start(2, false, 60000);
    await sessions[0]!.idle();
    await flush();
    for (const s of sessions)
      expect(s.state!.players.map((p) => p.name)).toEqual(['Joueur 1', 'Joueur 2']);
    sessions.forEach((s) => s.close());
  });
  it('lets the former host return after a completed migration', async () => {
    const { network, sessions, flush, advance } = await setup(2);
    const host = sessions[0]!,
      next = sessions[1]!;
    let saved: SavedSession | undefined;
    host.onPersist = (value) => {
      saved = structuredClone(value);
    };
    await host.start(2, false, 60000);
    await host.idle();
    await flush();
    host.close();
    advance(15001);
    await next.pulse();
    await flush();
    await next.pulse();
    await flush();
    const returned = new Session(
      new MemoryTransport('old-host-return', network),
      host.user,
      host.name,
      false,
    );
    sessions.push(returned);
    await returned.join('test-code', saved, false);
    await flush();
    expect(returned.host).toBe(next.user.id);
    expect(returned.epoch).toBe(1);
    expect(returned.head).toBe(next.head);
    expect(returned.status).toBe('Partie synchronisée.');
    sessions.forEach((s) => s.close());
  });
  it('refuses incomplete rounds and retries without accepting the missing contribution', async () => {
    const { network, sessions, flush, advance } = await setup(2);
    const host = sessions[0]!;
    network.drop = (from, _to, message) => {
      const body = (message as { body: { type: string; kind?: string } }).body;
      return from === 'peer-1' && body.type === 'contribution' && body.kind === 'reveal';
    };
    await host.start(2, false, 60000);
    await host.idle();
    await flush();
    expect(host.state).toBeNull();
    advance(17000);
    await host.pulse();
    await flush();
    expect(host.state).toBeNull();
    expect(host.incidents.join(' ')).toContain('Tirage annulé');
    network.drop = () => false;
    await host.start(2, false, 60000);
    await host.idle();
    await flush();
    expect(host.state).not.toBeNull();
    expect(host.frames[0]?.proof?.context.participants).toHaveLength(1);
    expect(sessions[1]!.head).toBe(host.head);
    sessions.forEach((s) => s.close());
  });
  it('rejects a tampered saved history', async () => {
    const { sessions, network, flush } = await setup(2);
    const host = sessions[0]!;
    let saved: SavedSession | undefined;
    host.onPersist = (value) => {
      saved = structuredClone(value);
    };
    await host.start(2, false, 60000);
    await host.idle();
    await flush();
    saved!.frames[0]!.result = 'f'.repeat(64);
    const restored = new Session(new MemoryTransport('tampered', network), host.user, host.name);
    await expect(restored.join('test-code', saved, false)).rejects.toThrow('Signature');
    sessions.forEach((s) => s.close());
  });
  it('converges with delayed, duplicated and reordered deliveries', async () => {
    const { sessions, network } = await setup(3);
    await sessions[0]!.start(3, false, 60000);
    await sessions[0]!.idle();
    for (let i = 0; i < 20; i++) {
      await network.flush(true, true);
      await Promise.all(sessions.map((s) => s.idle()));
    }
    expect(sessions[0]!.state).not.toBeNull();
    expect(new Set(sessions.map((s) => s.head)).size).toBe(1);
    sessions.forEach((s) => s.close());
  });
  it('starts with four contributors, verifies an action and rejects another seat intention', async () => {
    const { sessions, flush } = await setup(4);
    const host = sessions[0]!;
    expect(host.members).toHaveLength(4);
    await host.start(4, false, 60000);
    await host.idle();
    await flush();
    expect(host.state).not.toBeNull();
    expect(host.frames[0]?.proof?.context.participants).toHaveLength(4);
    const frame = host.frames[0]!;
    expect(host.state!.firstPlayer).toBe(host.state!.currentPlayer);
    expect(execute(null, frame.command, await drawSeed(frame.proof!)).state).toEqual(host.state);
    for (const peer of sessions) expect(peer.head).toBe(host.head);
    const active = sessions.find((s) => s.user.id === getDecisionPlayerId(host.state!))!;
    const waiting = sessions.find((s) => s !== active)!;
    const initial = host.head;
    await waiting.intent({ type: 'roll', playerId: active.user.id });
    await flush();
    expect(host.head).toBe(initial);
    // Even a correctly signed request from the waiting player's own seat is out of turn.
    await waiting.intent({ type: 'roll', playerId: waiting.user.id });
    await waiting.intent({ type: 'finish', playerId: waiting.user.id });
    await waiting.intent({ type: 'sell', playerId: waiting.user.id, tile: 1 });
    await flush();
    expect(host.head).toBe(initial);
    expect(sessions.every((s) => !s.blocked)).toBe(true);
    await active.intent({ type: 'roll', playerId: active.user.id });
    await active.idle();
    await flush();
    expect(host.head).not.toBe(initial);
    for (const peer of sessions) expect(peer.head).toBe(host.head);
    sessions.forEach((s) => s.close());
  });
  it('recovers dropped frames through authenticated history and ignores duplicates', async () => {
    const { network, sessions, flush, advance } = await setup(2);
    const host = sessions[0]!,
      client = sessions[1]!;
    await host.start(2, false, 60000);
    await host.idle();
    await flush();
    network.drop = (_from, to, message) =>
      to === 'peer-1' && (message as { body: { type: string } }).body.type === 'frame';
    advance(1000);
    await host.pulse();
    await flush();
    expect(client.head).not.toBe(host.head);
    network.drop = () => false;
    advance(3000);
    await host.pulse();
    await flush();
    expect(client.head).toBe(host.head);
    await network.flush(true, true);
    await flush();
    expect(client.head).toBe(host.head);
    sessions.forEach((s) => s.close());
  });
  it('migrates after 15 seconds but waits 90 seconds before replacing the absent seat', async () => {
    const { sessions, flush, advance } = await setup(3);
    const host = sessions[0]!,
      next = sessions[1]!;
    await host.start(3, false, 60000);
    await host.idle();
    await flush();
    const head = host.head;
    host.close();
    advance(14999);
    await next.pulse();
    await flush();
    expect(next.host).toBe(host.user.id);
    advance(2);
    await next.pulse();
    await flush();
    expect(next.isHost).toBe(true);
    expect(next.head).toBe(head);
    await next.pulse();
    await flush();
    expect(next.state!.players[0]!.bot).toBe(false);
    const elapsed = next.state!.decisionElapsedMs;
    for (let seconds = 0; seconds < 70; seconds += 5) {
      advance(5000);
      await next.pulse();
      await flush();
      await sessions[2]!.pulse();
      await flush();
    }
    advance(DISCONNECT_GRACE_MS - 85002);
    await next.pulse();
    await flush();
    await sessions[2]!.pulse();
    await flush();
    await next.pulse();
    await flush();
    expect(next.state!.players[0]!.bot).toBe(false);
    expect(next.state!.decisionElapsedMs).toBe(elapsed);
    advance(1);
    await next.pulse();
    await flush();
    expect(next.state!.players[0]!.bot).toBe(true);
    expect(sessions[2]!.head).toBe(next.head);
    sessions.forEach((s) => s.close());
  });
  it('reserves a disconnected guest seat and pauses the clock until it reconnects', async () => {
    const { network, sessions, flush, advance } = await setup(2);
    const host = sessions[0]!,
      client = sessions[1]!;
    let saved: SavedSession | undefined;
    client.onPersist = (value) => {
      saved = structuredClone(value);
    };
    await host.start(2, false, 1200000);
    await host.idle();
    await flush();
    client.close();
    const elapsed = host.state!.decisionElapsedMs;
    for (let n = 0; n < 8; n++) {
      advance(10000);
      await host.pulse();
      await flush();
      expect(host.state!.players[1]!.bot).toBe(false);
      expect(host.state!.decisionElapsedMs).toBe(elapsed);
    }
    const returned = new Session(
      new MemoryTransport('guest-reopened', network),
      client.user,
      client.name,
      false,
    );
    sessions.push(returned);
    await returned.join('test-code', saved, false);
    await flush();
    advance(1000);
    await host.pulse();
    await flush();
    expect(returned.head).toBe(host.head);
    expect(host.state!.players[1]!.bot).toBe(false);
    expect(host.state!.decisionElapsedMs).toBe(elapsed + 1000);
    sessions.forEach((s) => s.close());
  });
  it('treats a failed draw as a temporary connection problem and allows a healthy retry', async () => {
    const { network, sessions, flush, advance } = await setup(2);
    const host = sessions[0]!,
      client = sessions[1]!;
    await host.start(2, false, 1200000);
    await host.idle();
    await flush();
    const active = sessions.find((s) => s.user.id === getDecisionPlayerId(host.state!))!;
    network.drop = (from, _to, message) =>
      from === 'peer-1' && (message as { body: { type: string } }).body.type === 'contribution';
    await active.intent({ type: 'roll', playerId: active.user.id });
    await flush();
    advance(17000);
    await host.pulse();
    await flush();
    await host.pulse();
    await flush();
    expect(host.state!.players[1]!.bot).toBe(false);
    expect(host.state!.decisionElapsedMs).toBe(0);
    network.drop = () => false;
    await client.pulse();
    await flush();
    await active.intent({ type: 'roll', playerId: active.user.id });
    await flush();
    expect(host.state!.dice).toHaveLength(2);
    expect(host.state!.players[1]!.bot).toBe(false);
    expect(client.head).toBe(host.head);
    expect(host.frames.at(-1)?.proof?.context.participants).toHaveLength(2);
    sessions.forEach((s) => s.close());
  });
  it('reconnects with the same key and replays the snapshot before reclaiming a seat', async () => {
    const { network, sessions, flush, advance } = await setup(2);
    const host = sessions[0]!,
      client = sessions[1]!;
    let saved: SavedSession | undefined;
    client.onPersist = (value) => {
      saved = structuredClone(value);
    };
    await host.start(2, false, 60000);
    await host.idle();
    await flush();
    client.close();
    advance(DISCONNECT_GRACE_MS + 1);
    await host.pulse();
    await flush();
    expect(host.state!.players[1]!.bot).toBe(true);
    const returned = new Session(
      new MemoryTransport('peer-returned', network),
      client.user,
      client.name,
      false,
    );
    sessions.push(returned);
    await returned.join('test-code', saved, false);
    await flush();
    expect(returned.head).toBe(host.head);
    // The authenticated snapshot restores human control automatically.
    expect(host.state!.players[1]!.bot).toBe(false);
    sessions.forEach((s) => s.close());
  });
  it('plays a full deterministic two-browser game to the timer', async () => {
    const { sessions, flush, advance } = await setup(2);
    const host = sessions[0]!;
    await host.start(2, false, 60000);
    await host.idle();
    await flush();
    for (let turn = 0; turn < 75 && !host.state?.winner; turn++) {
      const state = host.state!;
      const elapsedBefore = state.elapsedMs;
      const active = sessions.find((s) => s.user.id === getDecisionPlayerId(state))!;
      const action = getLegalActions(state).find((a) => a.type !== 'quit');
      if (action) await active.intent(action);
      await flush();
      // A tick can itself announce a crisis or a timeout and queue another
      // presentation. Wait for an authoritative clock tick, not just the
      // duration of the last action's events, while keeping both peers alive.
      for (
        let seconds = 0;
        seconds < 120 && !host.state?.winner && host.state!.elapsedMs === elapsedBefore;
        seconds++
      ) {
        advance(1000);
        for (const session of sessions) await session.pulse();
        await flush();
      }
      expect(host.state!.elapsedMs > elapsedBefore || Boolean(host.state!.winner)).toBe(true);
    }
    expect(host.state?.winner).not.toBeNull();
    expect(sessions[1]!.head).toBe(host.head);
    sessions.forEach((s) => s.close());
  });
});

it('renames host and guest before the game and freezes names after starting', async () => {
  const { sessions, flush } = await setup(2);
  await sessions[0]!.rename('Alice');
  await flush();
  await sessions[1]!.rename('Julien');
  await flush();
  for (const s of sessions) expect(s.members.map((m) => m.name)).toEqual(['Alice', 'Julien']);
  await sessions[0]!.start(2, false, 60000);
  await sessions[0]!.idle();
  await flush();
  await sessions[1]!.rename('Changed');
  await flush();
  for (const s of sessions)
    expect(s.state!.players.map((p) => p.name)).toEqual(['Alice', 'Julien']);
  sessions.forEach((s) => s.close());
});
