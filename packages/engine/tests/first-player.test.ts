import { expect, it } from 'vitest';
import { config, createGame, createRng, reduceGame, validateState } from '../src/index';
import { sequence } from './helpers';

const players = Array.from({ length: 4 }, (_, index) => ({
  id: `p${index}`,
  name: `Player ${index}`,
  bot: index > 1,
}));
const rules = { ...config, shuffleStreets: false, festivalCount: 0, adventures: false };

it.each([2, 3, 4])(
  'can select every seat among %s players without changing their order',
  (count) => {
    for (let index = 0; index < count; index++) {
      const state = createGame(
        { players: players.slice(0, count), config: rules, randomFirstPlayer: true },
        sequence((index + 0.5) / count),
      );
      expect(state.currentPlayer).toBe(index);
      expect(state.firstPlayer).toBe(index);
      expect(state.players.map((p) => p.id)).toEqual(players.slice(0, count).map((p) => p.id));
      expect(validateState(state)).toEqual([]);
    }
  },
);

it('preserves teams and bot seats when a guest starts', () => {
  const state = createGame(
    { players, config: rules, mode: 'teams', randomFirstPlayer: true },
    sequence(0.375),
  );
  expect(state.currentPlayer).toBe(1);
  expect(state.players.map((p) => [p.id, p.team, p.bot])).toEqual(
    players.map((p, i) => [p.id, i % 2, p.bot]),
  );
  expect(validateState(state)).toEqual([]);
});

it('reproduces the first player from a seed and varies the opening seat across games', () => {
  const starts = new Set<number>();
  for (let seed = 0; seed < 40; seed++) {
    const options = { players, seed, randomFirstPlayer: true };
    const state = createGame(options);
    expect(createGame(options)).toEqual(state);
    starts.add(state.currentPlayer);
    // Drawing the starter does not alter the board, quests or initial properties.
    const { firstPlayer: _first, ...withoutStart } = state;
    expect({ ...withoutStart, currentPlayer: 0 }).toEqual(createGame({ players, seed }));
  }
  expect(starts).toEqual(new Set([0, 1, 2, 3]));
});

it('retains historical starts and their random stream when the option is absent', () => {
  const rng = createRng('historical'),
    reference = createRng('historical');
  const state = createGame({ players, config: rules }, rng);
  expect(state.currentPlayer).toBe(0);
  expect(state.firstPlayer).toBeUndefined();
  expect(rng()).toBe(reference());
});

it.each([0, 1, 2, 3])('waits for a complete table round when seat %s starts', (first) => {
  let state = createGame(
    {
      players,
      randomFirstPlayer: true,
      config: { ...config, crisisChance: 0, earthquakeChance: 0 },
    },
    () => (first + 0.5) / players.length,
  );
  expect(state.currentPlayer).toBe(first);
  for (let turn = 0; turn < players.length; turn++) {
    expect(state.currentPlayer).toBe((first + turn) % players.length);
    expect(state.adventure!.round).toBe(1);
    state.phase = 'end';
    const result = reduceGame(state, {
      type: 'finish',
      playerId: state.players[state.currentPlayer]!.id,
    });
    expect(result.error).toBeUndefined();
    state = result.state;
  }
  expect(state.currentPlayer).toBe(first);
  expect(state.adventure!.round).toBe(2);
  expect(validateState(state)).toEqual([]);
});

it('keeps a complete round boundary when the opening player is eliminated', () => {
  let state = createGame(
    {
      players,
      randomFirstPlayer: true,
      config: { ...config, crisisChance: 0, earthquakeChance: 0 },
    },
    () => 0.6,
  );
  for (const seat of [2, 3, 0, 1]) {
    expect(state.currentPlayer).toBe(seat);
    expect(state.adventure!.round).toBe(1);
    state.phase = 'end';
    const result = reduceGame(state, { type: 'finish', playerId: state.players[seat]!.id });
    expect(result.error).toBeUndefined();
    state = result.state;
    state.players[2]!.eliminated = true;
    state.players[2]!.cash = 0;
  }
  expect(state.currentPlayer).toBe(3);
  expect(state.adventure!.round).toBe(2);
  expect(validateState(state)).toEqual([]);
});

it.each([-1, 1.5, 4, NaN])('rejects a malformed stored opening seat %s', (firstPlayer) => {
  const state = createGame({ players, config: rules });
  state.firstPlayer = firstPlayer;
  expect(validateState(state)).toContain('Invalid first player index.');
});
