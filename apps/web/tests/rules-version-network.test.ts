import { expect, it } from 'vitest';
import {
  config,
  createGame,
  createRng,
  legacyConfigV17,
  reduceGame,
  type GameConfig,
  type GameState,
} from '@money-tour/engine';
import {
  commitment,
  drawSeed,
  hash,
  identity,
  secret,
  sign,
  type Identity,
} from '../src/network/crypto';
import { commandSchema, type Command, type Frame } from '../src/network/schema';
import { execute, Session, type SavedSession } from '../src/network/session';
import { MemoryNetwork, MemoryTransport } from '../src/network/transport';
import { rematchOptions } from '../src/game/gameStats';

/** An authenticated v17 cache built with historical rules, not with today's execute(). */
async function historicalCache(users: Identity[]) {
  const room = await hash({ code: 'versioned-history', protocol: 1 });
  const frames: Frame[] = [];
  let state: GameState | null = null;
  const options = {
    players: users.map((user, index) => ({ id: user.id, name: `Player ${index}`, bot: false })),
    mode: 'free-for-all' as const,
    durationMs: 1200000,
  };
  const append = async (command: Command, deadline?: number) => {
    const parent = frames.at(-1)?.result ?? '0'.repeat(64);
    let proof: Frame['proof'] = null;
    if (command.type === 'start' || command.type === 'rematch') {
      const context = {
        room,
        epoch: 0,
        seq: frames.length,
        parent,
        command: await hash(command),
        participants: users.map((user) => user.id),
        nonce: secret(),
      };
      const secrets = Object.fromEntries(users.map((user) => [user.id, secret()]));
      const commitments = Object.fromEntries(
        await Promise.all(
          users.map(async (user) => [
            user.id,
            await commitment(context, user.id, secrets[user.id]!),
          ]),
        ),
      );
      const attested = { context, commitments, secrets };
      proof = {
        ...attested,
        attestations: Object.fromEntries(
          await Promise.all(
            users.map(async (user) => [
              user.id,
              await sign(user.privateKey, { domain: 'money-tour-draw-proof-v1', ...attested }),
            ]),
          ),
        ),
      };
      state = createGame(
        { ...command.options, config: legacyConfigV17 as GameConfig },
        createRng(await drawSeed(proof)),
      );
    } else if (command.type === 'action') {
      state = reduceGame(state!, command.action).state;
    }
    const unsigned = {
      room,
      epoch: 0,
      index: frames.length,
      parent,
      command,
      proof,
      result: await hash(state),
      signer: users[0]!.id,
      ...(deadline === undefined ? {} : { adventureDeadline: deadline }),
    };
    const frame = { ...unsigned, signature: await sign(users[0]!.privateKey, unsigned) };
    frames.push(frame);
    return frame;
  };
  const start = await append({ type: 'start', options, adventureStart: true }, 90000);
  await append({ type: 'adventure_release', gate: await hash(start), at: 90000, ready: {} });
  const action = { type: 'quit', playerId: users[0]!.id } as const;
  const auth = { playerId: users[0]!.id, parent: frames.at(-1)!.result, action };
  await append({
    type: 'action',
    action,
    auth: { ...auth, signature: await sign(users[0]!.privateKey, { room, ...auth }) },
  });
  expect(state!.winner).toBeTruthy();
  await append(
    commandSchema.parse({
      type: 'rematch',
      options: rematchOptions(state!, false),
      adventureStart: true,
    }),
    120000,
  );
  const saved: SavedSession = {
    room,
    epoch: 0,
    host: users[0]!.id,
    frames,
    members: users.map((user, order) => ({
      id: user.id,
      name: `Player ${order}`,
      key: { ...user.publicKey },
      order,
    })),
  };
  return { saved, expected: state! };
}

it('restores signed v17 start/rematch hashes, synchronizes old rules, then signs v18 rules for a new rematch', async () => {
  const users = await Promise.all([identity(), identity()]);
  const { saved, expected } = await historicalCache(users);
  const network = new MemoryNetwork();
  const sessions = users.map(
    (user, index) =>
      new Session(
        new MemoryTransport(`version-peer-${index}`, network),
        user,
        `Player ${index}`,
        index === 0,
        () => 100000,
      ),
  );
  const flush = async () => {
    for (let i = 0; i < 8; i++) {
      await network.flush();
      await Promise.all(sessions.map((session) => session.idle()));
    }
  };
  try {
    for (const session of sessions)
      await session.join('versioned-history', structuredClone(saved), false);
    await flush();
    for (const session of sessions) {
      expect(session.state).toEqual(expected);
      expect(session.state!.config).toEqual(expected.config);
      expect(session.state!.config.version).toBe(17);
      expect(session.state!.config.travelToRivals).toBeUndefined();
      expect(session.head).toBe(saved.frames.at(-1)!.result);
      expect(session.view.startGate?.deadline).toBe(120000);
      expect(session.blocked).toBe(false);
    }
    await Promise.all(sessions.map((session) => session.readyAdventure()));
    await flush();
    await sessions[0]!.intent({ type: 'quit', playerId: users[0]!.id });
    await flush();
    expect(sessions[0]!.state!.winner).toBeTruthy();
    const beforeRematch = structuredClone(sessions[0]!.state!);
    await sessions[0]!.rematch();
    await flush();
    const frame = sessions[0]!.frames.at(-1)!;
    expect(frame.command).toMatchObject({ type: 'rematch', rulesVersion: 18 });
    expect(sessions[0]!.state!.config.version).toBe(18);
    expect(sessions[0]!.state!.config.travelToRivals).toBe(true);
    expect(sessions[0]!.head).toBe(sessions[1]!.head);
    expect(sessions[0]!.state).toEqual(sessions[1]!.state);
    expect(execute(beforeRematch, frame.command, await drawSeed(frame.proof!)).state).toEqual(
      sessions[0]!.state,
    );
  } finally {
    sessions.forEach((session) => session.close());
  }
});

it('signs the v18 rules version into a fresh start and reproduces its hash on recovery', async () => {
  const network = new MemoryNetwork(),
    user = await identity();
  const session = new Session(
    new MemoryTransport('fresh-rules', network),
    user,
    'Player',
    true,
    () => 100000,
  );
  let persisted: SavedSession | undefined;
  session.onPersist = (save) => {
    persisted = structuredClone(save);
  };
  await session.join('fresh-rules', undefined, false);
  await session.start(2, false, 1200000);
  await session.idle();
  const frame = session.frames[0]!;
  expect(frame.command).toMatchObject({ type: 'start', rulesVersion: 18 });
  expect(session.state!.config.version).toBe(config.version);
  expect(frame.result).toBe(await hash(session.state));
  const recovered = new Session(
    new MemoryTransport('fresh-rules-recovered', new MemoryNetwork()),
    user,
    'Player',
    true,
    () => 100000,
  );
  try {
    await recovered.join('fresh-rules', persisted, false);
    expect(recovered.state).toEqual(session.state);
    expect(recovered.head).toBe(session.head);
  } finally {
    session.close();
    recovered.close();
  }
});

it('rejects unsigned rules/config injection and unsupported versions in start and rematch commands', () => {
  const options = {
    players: [
      { id: 'a', name: 'A', bot: false },
      { id: 'b', name: 'B', bot: false },
    ],
    mode: 'free-for-all',
    durationMs: 1200000,
  };
  for (const type of ['start', 'rematch']) {
    expect(commandSchema.safeParse({ type, options, rulesVersion: 18 }).success).toBe(true);
    expect(commandSchema.safeParse({ type, options, rulesVersion: 19 }).success).toBe(false);
    expect(commandSchema.safeParse({ type, options: { ...options, config } }).success).toBe(false);
  }
});

it('rejects a still-open protocol v2 client with the refresh message', async () => {
  const network = new MemoryNetwork(),
    users = await Promise.all([identity(), identity()]);
  const host = new Session(
    new MemoryTransport('host-v3', network),
    users[0]!,
    'Host',
    true,
    () => 100000,
  );
  const guest = new Session(
    new MemoryTransport('guest-v2', network),
    users[1]!,
    'Guest',
    false,
    () => 100000,
  );
  const flush = async () => {
    for (let i = 0; i < 8; i++) {
      await network.flush();
      await host.idle();
      await guest.idle();
    }
  };
  try {
    await host.join('protocol-compat', undefined, false);
    await guest.join('protocol-compat', undefined, false);
    await flush();
    const unsigned = {
      room: await hash({ code: 'protocol-compat', protocol: 1 }),
      from: guest.user.id,
      peer: guest.transport.peerId,
      serial: 901,
      key: guest.user.publicKey,
      body: {
        type: 'hello',
        protocol: 2,
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
    expect(host.frames).toHaveLength(0);
  } finally {
    host.close();
    guest.close();
  }
});
