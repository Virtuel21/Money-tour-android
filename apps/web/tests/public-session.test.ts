import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '@money-tour/engine';
import { hash, identity, sign } from '../src/network/crypto';
import {
  execute,
  Session,
  type SavedSession,
  type PublicJoinAuthorization,
} from '../src/network/session';
import { MemoryNetwork, MemoryTransport } from '../src/network/transport';
import { publicBotNames } from '../src/network/publicNames';

const opened: Session[] = [];
afterEach(() => opened.splice(0).forEach((session) => session.close()));

async function setup(
  publicGame = true,
  count = 4,
  authorize = async (_request: PublicJoinAuthorization) => true,
) {
  const network = new MemoryNetwork();
  let time = 100000;
  const sessions: Session[] = [];
  const saves = new Map<string, SavedSession>();
  const authorization = vi.fn(authorize);
  const add = async (
    name: string,
    creator = false,
    existingUser?: Awaited<ReturnType<typeof identity>>,
  ) => {
    const user = existingUser ?? (await identity());
    const session = new Session(
      new MemoryTransport(`peer-${opened.length}`, network),
      user,
      name,
      creator,
      () => time,
      {
        publicGame,
        authorizePublicJoin: authorization,
      },
    );
    session.onPersist = (save) => saves.set(user.id, structuredClone(save));
    opened.push(session);
    sessions.push(session);
    return session;
  };
  const flush = async (ready = true) => {
    for (let pass = 0; pass < 8; pass++) {
      await network.flush();
      await Promise.all(sessions.map((session) => session.idle()));
      if (ready) await Promise.all(sessions.map((session) => session.readyAdventure()));
    }
  };
  const host = await add('AlexR', true);
  await host.join('public-test', undefined, false);
  await flush();
  const start = async () => {
    await host.start(count, false, 60000);
    await host.idle();
    await flush();
  };
  const join = async (name: string, seatId = 'bot-1', reservationId = name) => {
    const guest = await add(name);
    await guest.requestPublicSeat({
      seatId,
      reservationId,
      reservationToken: `token-${reservationId}`,
    });
    await guest.join('public-test', undefined, false);
    return guest;
  };
  return {
    network,
    sessions,
    host,
    saves,
    authorization,
    add,
    flush,
    start,
    join,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('public room seat admissions', () => {
  it('preserves an established seat with owned buildings, debt and personal progress during the pure control transition', async () => {
    const state = createGame({
      seed: 'established-public-seat',
      players: [
        { id: 'host', name: 'AlexR' },
        { id: 'bot-1', name: 'MilaVoyage', bot: true },
      ],
    });
    state.publicGame = true;
    const [owned, creditor] = state.config.board.filter((tile) => tile.type === 'city');
    state.properties[owned!.id] = {
      ownerId: 'bot-1',
      level: 2,
      championships: 1,
      championshipTurns: 3,
    };
    state.properties[creditor!.id] = { ownerId: 'host', level: 1, championships: 0 };
    Object.assign(state.players[1]!, {
      cash: 43,
      position: creditor!.id,
      laps: 3,
      heldCards: ['squatter'],
      insurance: { tile: owned!.id },
    });
    state.quests = { ...state.quests, 'bot-1': { kind: 'doubles', progress: 1, completed: false } };
    state.currentPlayer = 1;
    state.phase = 'debt';
    state.elapsedMs = 157000;
    state.decisionElapsedMs = 11000;
    state.turn = 12;
    state.debt = {
      playerId: 'bot-1',
      creditorId: 'host',
      amount: 175,
      reason: 'rent',
      continuation: 'property',
    };
    state.pendingRent = { tile: creditor!.id, amount: 175, creditorId: 'host' };
    const before = structuredClone(state);
    const user = await identity();
    // Network admission separately enforces the safe roll phase and signed consent.
    // This pure transition exercises even the references that can exist between turns.
    const result = execute(state, {
      type: 'join_seat',
      member: {
        id: user.id,
        key: { ...user.publicKey },
        name: 'Camille',
        order: 1,
        seatId: 'bot-1',
      },
      reservationId: 'established-seat',
      consent: '0'.repeat(128),
    });
    expect(state).toEqual(before);
    expect(result.state).toEqual({
      ...before,
      seq: before.seq + 1,
      players: before.players.map((player) =>
        player.id === 'bot-1' ? { ...player, name: 'Camille', bot: false } : player,
      ),
      publicSeats: { 'bot-1': user.id },
    });
    expect(result.events).toEqual([{ type: 'control', playerId: 'bot-1', bot: false }]);
  });

  it('validates a lobby reservation before including its human in the signed start', async () => {
    const { host, start, join, flush, authorization } = await setup();
    expect(host.availablePublicSeats()).toEqual(['lobby', 'lobby', 'lobby']);
    const guest = await join('Camille', 'lobby');
    await flush();
    expect(guest.view.publicJoinStatus).toBe('joined');
    expect(host.members.map((member) => member.id)).toContain(guest.user.id);
    expect(authorization).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: guest.user.id, seatId: 'lobby' }),
    );
    await start();
    expect(host.state?.publicGame).toBe(true);
    expect(host.state).toEqual(guest.state);
    expect(host.state?.players.find((player) => player.id === guest.user.id)?.bot).toBe(false);
  });

  it('takes an original AI seat with its exact assets and binds ownership into the verified state', async () => {
    const { host, start, join, flush } = await setup();
    await start();
    const before = structuredClone(host.state!);
    const guest = await join('Mila_75');
    await flush();
    expect(guest.view.publicJoinStatus).toBe('joined');
    expect(guest.view.self).toBe('bot-1');
    expect(guest.view.selfIdentity).toBe(guest.user.id);
    expect(host.state?.publicSeats).toEqual({ 'bot-1': guest.user.id });
    expect(host.state?.players.find((player) => player.id === 'bot-1')).toEqual({
      ...before.players.find((player) => player.id === 'bot-1'),
      name: 'Mila_75',
      bot: false,
    });
    expect(host.state?.properties).toEqual(before.properties);
    expect(host.state).toEqual(guest.state);
    expect(host.head).toBe(guest.head);
    expect(host.availablePublicSeats()).not.toContain('bot-1');
    expect(JSON.stringify(host.frames)).not.toContain('token-');
    expect(host.frames.at(-1)?.command.type).toBe('join_seat');
    const bound = structuredClone(host.state!);
    bound.publicSeats!['bot-1'] = host.user.id;
    expect(await hash(bound)).not.toBe(host.head);
  });

  it('allows the assigned identity to act for its seat and rejects a correctly signed attempt to control another human', async () => {
    const { host, start, join, flush } = await setup();
    await start();
    const guest = await join('Robin');
    await flush();
    const previous = host.frames.length;
    await guest.intent({ type: 'set_control', playerId: 'bot-1', bot: false });
    await flush();
    expect(host.frames.length).toBe(previous + 1);
    expect(host.head).toBe(guest.head);
    const action = { type: 'set_control' as const, playerId: host.user.id, bot: false };
    const intent = { playerId: guest.user.id, parent: host.head, action };
    const signed = {
      ...intent,
      signature: await sign(guest.user.privateKey, {
        room: await hash({ code: 'public-test', protocol: 1 }),
        ...intent,
      }),
    };
    const envelope = {
      room: await hash({ code: 'public-test', protocol: 1 }),
      from: guest.user.id,
      peer: guest.transport.peerId,
      serial: 50000,
      key: guest.user.publicKey,
      body: { type: 'intent', intent: signed },
    };
    const count = host.frames.length;
    guest.transport.send({ ...envelope, signature: await sign(guest.user.privateKey, envelope) });
    await flush();
    expect(host.frames.length).toBe(count);
  });

  it('admits at most one of two simultaneous requests for the same AI seat', async () => {
    const { host, start, join, flush } = await setup();
    await start();
    const first = await join('Alice');
    const second = await join('Marine');
    await flush();
    expect(host.members).toHaveLength(2);
    expect([first.view.publicJoinStatus, second.view.publicJoinStatus].sort()).toEqual([
      'joined',
      'rejected',
    ]);
    expect(Object.keys(host.state!.publicSeats!)).toEqual(['bot-1']);
  });

  it('sends the reservation capability only to the discovered host, never to another guest', async () => {
    const { host, start, join, add, flush, advance } = await setup();
    await start();
    const existingGuest = await join('Alice');
    await flush();
    advance(1000);
    await host.pulse();
    await flush();
    const guest = await add('Marine');
    const outgoing = vi.spyOn(guest.transport, 'send');
    await guest.requestPublicSeat({
      seatId: 'bot-2',
      reservationId: 'host-only-reservation',
      reservationToken: 'host-only-token',
    });
    await guest.join('public-test', undefined, false);
    await flush();
    const requests = outgoing.mock.calls.filter(
      ([raw]) => (raw as { body: { type: string } }).body.type === 'public_join',
    );
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(([, target]) => target === host.transport.peerId)).toBe(true);
    expect(
      requests.some(([, target]) => !target || target === existingGuest.transport.peerId),
    ).toBe(false);
    expect(guest.view.publicJoinStatus).toBe('joined');
  });

  it('pins the directory host before receiving an earlier malicious creator announcement', async () => {
    const { host, start, add, flush, advance } = await setup();
    await start();
    const attacker = await add('Fake host', true);
    await attacker.join('public-test', undefined, false);
    const attackerIncoming = vi.spyOn(attacker.transport, 'onMessage');
    const guest = await add('Camille');
    const outgoing = vi.spyOn(guest.transport, 'send');
    await guest.requestPublicSeat({
      seatId: 'bot-1',
      reservationId: 'pinned-reservation',
      reservationToken: 'pinned-secret',
      expectedHostId: host.user.id,
    });
    expect(guest.host).toBe(host.user.id);
    await guest.join('public-test', undefined, false);
    const fakeHello = {
      room: await hash({ code: 'public-test', protocol: 1 }),
      from: attacker.user.id,
      peer: attacker.transport.peerId,
      serial: 100000,
      key: attacker.user.publicKey,
      body: {
        type: 'hello',
        protocol: 4,
        name: 'Fake host',
        creator: true,
        epoch: 0,
        index: 0,
        head: '0'.repeat(64),
      },
    };
    // Deliver this announcement before the real host's queued status and hello.
    guest.transport.onMessage(
      { ...fakeHello, signature: await sign(attacker.user.privateKey, fakeHello) },
      attacker.transport.peerId,
    );
    await guest.idle();
    expect(guest.host).toBe(host.user.id);
    expect(
      outgoing.mock.calls.filter(
        ([raw]) => (raw as { body: { type: string } }).body.type === 'public_join',
      ),
    ).toHaveLength(0);
    await flush();
    const requests = outgoing.mock.calls.filter(
      ([raw]) => (raw as { body: { type: string } }).body.type === 'public_join',
    );
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(([, target]) => target === host.transport.peerId)).toBe(true);
    expect(
      attackerIncoming.mock.calls.some(
        ([raw]) => (raw as { body: { type: string } }).body.type === 'public_join',
      ),
    ).toBe(false);
    expect(guest.host).toBe(host.user.id);
    expect(guest.view.publicJoinStatus).toBe('joined');
    expect(host.members).toHaveLength(2);
    host.close();
    advance(15001);
    await guest.pulse();
    await flush();
    expect(guest.isHost).toBe(true);
  });

  it('fails closed when the directory denies the reservation and never opens a private room through public matchmaking', async () => {
    const denied = await setup(true, 4, async () => false);
    await denied.start();
    const guest = await denied.join('Denied');
    await denied.flush();
    expect(guest.view.publicJoinStatus).toBe('rejected');
    expect(denied.host.members).toHaveLength(1);
    expect(denied.host.state?.publicSeats).toBeUndefined();
    const privateRoom = await setup(false);
    const visitor = await privateRoom.join('Not invited', 'lobby');
    await privateRoom.flush();
    expect(visitor.view.publicJoinStatus).toBe('rejected');
    expect(privateRoom.host.members).toHaveLength(1);
  });

  it('rechecks directory authorization at the actual safe transfer boundary', async () => {
    let allowed = true;
    const { host, start, join, flush, authorization } = await setup(true, 4, async () => {
      const result = allowed;
      allowed = false;
      return result;
    });
    await start();
    const guest = await join('Expired');
    await flush();
    expect(authorization.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(guest.view.publicJoinStatus).toBe('rejected');
    expect(host.members).toHaveLength(1);
  });

  it('expires an admission waiting behind the introduction instead of granting an old reservation', async () => {
    const { host, join, flush, advance } = await setup();
    await host.start(4, false, 60000);
    await host.idle();
    await flush(false);
    expect(host.view.startGate).toBeTruthy();
    const guest = await join('Late reservation');
    await flush(false);
    expect(guest.view.publicJoinStatus).toBe('waiting');
    advance(46000);
    await host.pulse();
    await flush(false);
    await host.pulse();
    await flush(false);
    expect(guest.view.publicJoinStatus).toBe('rejected');
    expect(host.members).toHaveLength(1);
  });

  it('rejects a replay whose host signature is valid but whose guest consent was altered', async () => {
    const { host, start, join, flush, saves, add } = await setup();
    await start();
    const guest = await join('Lina');
    await flush();
    const saved = structuredClone(saves.get(guest.user.id)!);
    const frame = saved.frames.find((candidate) => candidate.command.type === 'join_seat')!;
    if (frame.command.type !== 'join_seat') throw new Error('Missing admission');
    frame.command.consent = `${frame.command.consent[0] === 'a' ? 'b' : 'a'}${frame.command.consent.slice(1)}`;
    const { signature: _signature, ...unsigned } = frame;
    frame.signature = await sign(host.user.privateKey, unsigned);
    guest.close();
    const restored = await add('Lina', false, guest.user);
    await expect(restored.join('public-test', saved, false)).rejects.toThrow(
      'Auteur de l’intention invalide',
    );
  });

  it('preserves a claimed human seat through disconnect, signed replay and reclaim', async () => {
    const { host, start, join, flush, add, advance, saves } = await setup();
    await start();
    const guest = await join('Lea');
    await flush();
    const saved = saves.get(guest.user.id)!;
    guest.close();
    advance(95000);
    await host.pulse();
    await flush();
    expect(host.state?.players.find((player) => player.id === 'bot-1')?.bot).toBe(true);
    expect(host.availablePublicSeats()).not.toContain('bot-1');
    const returned = await add('Lea', false, guest.user);
    await returned.join('public-test', saved, false);
    await flush();
    expect(returned.view.self).toBe('bot-1');
    expect(returned.state).toEqual(host.state);
    expect(host.state?.players.find((player) => player.id === 'bot-1')?.bot).toBe(false);
    expect(host.members).toHaveLength(2);
    expect(returned.incidents).toEqual([]);
  });

  it('keeps admission, authority, AI disclosure and start readiness after host migration and rematch', async () => {
    const { host, start, join, flush, advance } = await setup(true, 2);
    await start();
    const guest = await join('Theo');
    await flush();
    await host.intent({ type: 'quit', playerId: host.user.id });
    await host.idle();
    await flush();
    expect(host.state?.winner).toBeTruthy();
    await host.rematch();
    await host.idle();
    await flush();
    expect(host.state?.winner).toBeNull();
    expect(host.state?.publicGame).toBe(true);
    expect(host.state?.publicSeats?.['bot-1']).toBe(guest.user.id);
    expect(host.view.startGate).toBeNull();
    expect(host.state?.players.find((player) => player.id === 'bot-1')?.bot).toBe(false);
    host.close();
    advance(15001);
    await guest.pulse();
    await flush();
    expect(guest.isHost).toBe(true);
    expect(guest.publicGame).toBe(true);
    expect(guest.view.selfIdentity).toBe(guest.host);
    expect(guest.view.self).toBe('bot-1');
  });
});

it('chooses unique natural AI names without colliding with human names', () => {
  const names = publicBotNames('room', ['AlexR', 'Camille_92'], 4);
  expect(new Set(names).size).toBe(4);
  expect(names.every((name) => name.length <= 20 && !/bot/i.test(name))).toBe(true);
  expect(names).not.toContain('AlexR');
  expect(names).not.toContain('Camille_92');
});
