import { expect, it } from 'vitest';
import { auctionCommitment, type GameAction } from '@money-tour/engine';
import { MemoryNetwork, MemoryTransport } from '../src/network/transport';
import { Session } from '../src/network/session';
import { identity } from '../src/network/crypto';
it('keeps signed bids sealed until everyone commits and resolves the same winning city on both peers', async () => {
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
        new MemoryTransport('auction-' + i, network),
        await identity(),
        'Player ' + i,
        i === 0,
        () => 100000,
      );
      sessions.push(s);
      await s.join('auction-session-test', undefined, false);
    }
    await flush();
    const [host, guest] = sessions as [Session, Session];
    await host.start(2, false, 1200000);
    await host.idle();
    await flush();
    await Promise.all(sessions.map((s) => s.readyAdventure()));
    await flush();
    for (const s of sessions) {
      s.state!.phase = 'auction';
      s.state!.properties[5]!.ownerId = null;
      s.state!.auction = {
        id: 'network-auction',
        tile: 5,
        kind: 'tender',
        resume: 'roll',
        participants: [host.user.id, guest.user.id],
        stage: 'commit',
        commitments: {},
        bids: {},
        passed: [],
      };
    }
    const send = async (s: Session, a: GameAction) => {
      await s.intent(a);
      await s.idle();
      await flush();
      expect(host.head).toBe(guest.head);
      expect(host.state).toEqual(guest.state);
    };
    const a = 'a'.repeat(32),
      b = 'b'.repeat(32),
      before = host.state!.players.map((p) => p.cash);
    const seq = host.state!.seq;
    await send(guest, { type: 'auction_pass', playerId: guest.user.id });
    expect(host.state!.seq).toBe(seq);
    await send(host, {
      type: 'auction_commit',
      playerId: host.user.id,
      hash: auctionCommitment('network-auction', host.user.id, 234, a),
    });
    // Random hashes/signatures can contain the digits of the bid; only payload fields matter.
    const commitment = host.frames.at(-1)!.command;
    expect(commitment.type).toBe('action');
    if (commitment.type !== 'action') throw new Error('Expected sealed auction command');
    expect(commitment.action).toEqual({
      type: 'auction_commit',
      playerId: host.user.id,
      hash: auctionCommitment('network-auction', host.user.id, 234, a),
    });
    expect(commitment.auth?.action).toEqual(commitment.action);
    expect(host.state!.auction!.bids).toEqual({});
    await send(guest, {
      type: 'auction_commit',
      playerId: guest.user.id,
      hash: auctionCommitment('network-auction', guest.user.id, 345, b),
    });
    await send(host, { type: 'auction_reveal', playerId: host.user.id, amount: 234, salt: a });
    await send(guest, { type: 'auction_reveal', playerId: guest.user.id, amount: 345, salt: b });
    expect(host.state!.properties[5]!.ownerId).toBe(guest.user.id);
    expect(host.state!.players.map((p) => p.cash)).toEqual([before[0], before[1]! - 345]);
    expect(host.events.find((e) => e.type === 'auction_result')!.message).not.toContain('345');
  } finally {
    sessions.forEach((s) => s.close());
  }
});
