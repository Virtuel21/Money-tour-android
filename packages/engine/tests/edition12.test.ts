import { expect, it } from 'vitest';
import {
  config,
  createGame,
  reduceGame,
  getLegalActions,
  duelCommitment,
  validateState,
  sameRules,
  legacyConfigV17,
  type GameConfig,
} from '../src/index';
import { sequence } from './helpers';
const game = (rules: GameConfig = config) =>
  createGame({
    config: {
      ...rules,
      shuffleStreets: false,
      adventures: false,
      festivalCount: 0,
      crisisChance: 0,
    },
    players: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
  });
it('offers travel on the extra action after landing with a double, and consumes it exactly once', () => {
  const s = game();
  s.players[0]!.position = 20;
  let r = reduceGame(s, { type: 'roll', playerId: 'a' }, sequence(0.2, 0.2));
  expect(r.state.players[0]!.position).toBe(24);
  expect(r.state.players[0]!.travelPending).toBe(true);
  r = reduceGame(r.state, { type: 'finish', playerId: 'a' });
  expect(r.state.phase).toBe('travel');
  expect(r.state.currentPlayer).toBe(0);
  expect(getLegalActions(r.state).some((a) => a.type === 'travel' && a.tile === 25)).toBe(true);
  const declined = reduceGame(r.state, { type: 'decline_travel', playerId: 'a' }).state;
  expect(declined.phase).toBe('roll');
  expect(declined.players[0]!.travelPending).toBe(false);
  r = reduceGame(r.state, { type: 'travel', playerId: 'a', tile: 25 });
  expect(r.state.players[0]!.cash).toBe(1450);
  expect(r.state.players[0]!.position).toBe(25);
  expect(r.state.players[0]!.travelPending).toBe(false);
  expect(r.state.extraRoll).toBe(false);
  r = reduceGame(r.state, { type: 'finish', playerId: 'a' });
  expect(r.state.currentPlayer).toBe(1);
  expect(validateState(r.state)).toEqual([]);
});
it('preserves the previous edition’s next-turn travel and its rival destination restriction', () => {
  const s = game(legacyConfigV17 as GameConfig);
  s.players[0]!.position = 19;
  s.properties[25]!.ownerId = 'b';
  let r = reduceGame(s, { type: 'roll', playerId: 'a' }, sequence(0.2, 0.4));
  r = reduceGame(r.state, { type: 'finish', playerId: 'a' });
  expect(r.state.currentPlayer).toBe(1);
  r.state.phase = 'end';
  r = reduceGame(r.state, { type: 'finish', playerId: 'b' });
  expect(r.state.phase).toBe('travel');
  expect(reduceGame(r.state, { type: 'travel', playerId: 'a', tile: 25 }).error).toBeTruthy();
});
it('keeps one escrow through repeated ties, rejects the old reveal and pays only the eventual winner', () => {
  let s = game();
  s.phase = 'duel';
  s.duel = {
    id: 'test',
    challengerId: 'a',
    amount: 0,
    stage: 'offer',
    escrow: false,
    commitments: {},
    reveals: {},
  };
  s = reduceGame(s, { type: 'duel_offer', playerId: 'a', targetId: 'b', amount: 50 }).state;
  s = reduceGame(s, { type: 'duel_accept', playerId: 'b' }).state;
  const salt = 'a'.repeat(32);
  for (let round = 1; round <= 3; round++) {
    const id = s.duel!.id;
    for (const playerId of ['a', 'b'])
      s = reduceGame(s, {
        type: 'duel_commit',
        playerId,
        hash: duelCommitment(
          id,
          playerId,
          playerId === 'b' && round === 3 ? 'scissors' : 'rock',
          salt,
        ),
      }).state;
    s = reduceGame(s, { type: 'duel_reveal', playerId: 'a', choice: 'rock', salt }).state;
    const result = reduceGame(s, {
      type: 'duel_reveal',
      playerId: 'b',
      choice: round === 3 ? 'scissors' : 'rock',
      salt,
    });
    s = result.state;
    expect(result.error).toBeUndefined();
    expect(validateState(s)).toEqual([]);
    if (round < 3) {
      expect(s.duel).toMatchObject({
        stage: 'commit',
        escrow: true,
        round: round + 1,
        commitments: {},
        reveals: {},
      });
      expect(s.duel!.id).not.toBe(id);
      expect(s.players.map((p) => p.cash)).toEqual([1450, 1450]);
      expect(result.events.some((e) => e.type === 'income' || e.type === 'payment')).toBe(false);
      expect(
        reduceGame(s, { type: 'duel_reveal', playerId: 'a', choice: 'rock', salt }).error,
      ).toBeTruthy();
      const forfeited = reduceGame(s, { type: 'duel_cancel', playerId: 'a' }).state;
      expect(forfeited.players.map((p) => p.cash)).toEqual([1450, 1550]);
    }
  }
  expect(s.duel).toBeUndefined();
  expect(s.players.map((p) => p.cash)).toEqual([1550, 1450]);
});
it.each([0, 10, 1500])(
  'floors each casino win at 50k with cash %i, but never pays a loss',
  (cash) => {
    const s = game();
    s.players[0]!.cash = cash;
    s.players[0]!.position = 7;
    s.phase = 'casino';
    s.casino = { tile: 7, game: 'roulette', chance: 2 };
    s.casinoVisits = { 7: 1 };
    for (const [values, won] of [
      [[0.99, 0.99, 0, 0.3, 0.6], true],
      [[0.99, 0, 0, 0.3, 0.6], false],
      [[0, 0, 0, 0.3, 0.6], true],
    ] as const) {
      const r = reduceGame(s, { type: 'casino_red', playerId: 'a' }, sequence(...values));
      const amount = r.events.find((e) => e.type === 'casino_result')!.amount!;
      expect(won ? amount >= 50 : amount === 0).toBe(true);
      expect(r.state.players[0]!.cash).toBe(cash + amount);
    }
    s.casino.game = 'slots';
    for (const values of [
      [0.99, 0, 0.1, 0.1, 0.6],
      [0.99, 0, 0.1, 0.1, 0.1],
    ])
      expect(
        reduceGame(s, { type: 'casino_spin', playerId: 'a' }, sequence(...values)).events.find(
          (e) => e.type === 'casino_result',
        )!.amount,
      ).toBeGreaterThanOrEqual(50);
  },
);
it('keeps both triples whole and their prices ascending over 100 seeds; rejects a split third city', () => {
  for (let seed = 0; seed < 100; seed++) {
    const s = createGame({
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      seed,
    });
    expect(sameRules(s.config, config)).toBe(true);
    expect(validateState(s)).toEqual([]);
    for (const ids of [
      [1, 2, 3],
      [17, 18, 19],
    ])
      expect(new Set(ids.map((id) => s.config.board[id]!.group)).size).toBe(1);
    expect(s.config.board.filter((t) => t.type === 'casino').map((t) => t.id)).toEqual([7]);
    const bad = structuredClone(s.config);
    [bad.board[3]!.group, bad.board[19]!.group] = [bad.board[19]!.group, bad.board[3]!.group];
    expect(sameRules(bad, config)).toBe(false);
  }
});
