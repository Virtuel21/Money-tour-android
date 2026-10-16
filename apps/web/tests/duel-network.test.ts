import { expect, it } from 'vitest';
import { duelCommitment, type GameAction } from '@money-tour/engine';
import { MemoryNetwork, MemoryTransport } from '../src/network/transport';
import { Session } from '../src/network/session';
import { identity } from '../src/network/crypto';
it('accepts the invited seat, keeps choices concealed in signed frames, and agrees on the winner', async () => {
  const network = new MemoryNetwork(),
    sessions: Session[] = [];
  const flush = async () => {
    for (let i = 0; i < 8; i++) {
      await network.flush();
      await Promise.all(sessions.map((s) => s.idle()));
    }
  };
  try {
    for (let i = 0; i < 2; i++) {
      const s = new Session(
        new MemoryTransport(`duel-${i}`, network),
        await identity(),
        `Joueur ${i}`,
        i === 0,
        () => 100000,
      );
      sessions.push(s);
      await s.join('duel-test-code', undefined, false);
    }
    await flush();
    const [host, guest] = sessions as [Session, Session];
    await host.start(2, false, 1200000);
    await host.idle();
    await flush();
    for (const s of sessions) {
      // This fixture places the host on the duel tile independently of the opening draw.
      s.state!.currentPlayer = 0;
      s.state!.phase = 'duel';
      s.state!.duel = {
        id: 'network-duel',
        challengerId: host.user.id,
        amount: 0,
        stage: 'offer',
        commitments: {},
        reveals: {},
        escrow: false,
      };
    }
    const send = async (s: Session, action: GameAction) => {
      await s.intent(action);
      await s.idle();
      await flush();
      expect(host.head).toBe(guest.head);
      expect(host.state).toEqual(guest.state);
    };
    await send(host, {
      type: 'duel_offer',
      playerId: host.user.id,
      targetId: guest.user.id,
      amount: 234,
    });
    const seq = host.state!.seq;
    await send(host, { type: 'duel_accept', playerId: host.user.id });
    expect(host.state!.seq).toBe(seq);
    await send(guest, { type: 'duel_accept', playerId: guest.user.id });
    expect(host.state!.duel!.stage).toBe('commit');
    const saltA = 'a'.repeat(32),
      saltB = 'b'.repeat(32);
    for (const s of [host, guest])
      await send(s, {
        type: 'duel_commit',
        playerId: s.user.id,
        hash: duelCommitment('network-duel', s.user.id, 'rock', saltA),
      });
    for (const s of [host, guest])
      await send(s, { type: 'duel_reveal', playerId: s.user.id, choice: 'rock', salt: saltA });
    expect(host.state!.duel!.round).toBe(2);
    expect(host.state!.players.map((p) => p.cash)).toEqual([1266, 1266]);
    const rematchId = host.state!.duel!.id;
    expect(rematchId).not.toBe('network-duel');
    await send(host, {
      type: 'duel_commit',
      playerId: host.user.id,
      hash: duelCommitment(rematchId, host.user.id, 'rock', saltA),
    });
    const frame = host.frames.at(-1)!;
    expect(JSON.stringify(frame.command)).not.toContain(saltA);
    expect(JSON.stringify(frame.command)).not.toContain('rock');
    await send(guest, {
      type: 'duel_commit',
      playerId: guest.user.id,
      hash: duelCommitment(rematchId, guest.user.id, 'scissors', saltB),
    });
    await send(host, { type: 'duel_reveal', playerId: host.user.id, choice: 'rock', salt: saltA });
    await send(guest, {
      type: 'duel_reveal',
      playerId: guest.user.id,
      choice: 'scissors',
      salt: saltB,
    });
    expect(host.state!.duel).toBeUndefined();
    expect(host.state!.players.map((p) => p.cash)).toEqual([1734, 1266]);
  } finally {
    sessions.forEach((s) => s.close());
  }
});
