import { expect, it } from 'vitest';
import {
  config,
  legacyConfigV16,
  legacyConfigV17,
  createGame,
  getLegalActions,
  reduceGame,
  validateState,
  type GameEvent,
} from '../src/index';
import { maybeCrisis, endWorldTurn } from '../src/world-events';
const game = () =>
  createGame({
    config: { ...config, shuffleStreets: false },
    players: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    seed: 'pacing',
  });
it('changes only the hotel threshold and rules version from v16', () => {
  expect(legacyConfigV17).toEqual({ ...legacyConfigV16, version: 17, hotelUnlockLaps: 2 });
});
it('opens rival travel destinations in new games while preserving all other v17 rules', () => {
  expect(config).toEqual({ ...legacyConfigV17, version: 18, travelToRivals: true });
});
it('builds three houses without the matching city, but never on another player’s property', () => {
  let state = game();
  state.phase = 'property';
  state.players[0]!.position = 1;
  state.properties[1]!.ownerId = 'a';
  state.properties[2]!.ownerId = 'b';
  for (let level = 1; level <= 3; level++) {
    state.phase = 'property'; // Separate visits.
    const result = reduceGame(state, { type: 'upgrade', playerId: 'a' });
    expect(result.error).toBeUndefined();
    state = result.state;
    expect(state.properties[1]!.level).toBe(level);
  }
  expect(getLegalActions(state).some((a) => a.type === 'upgrade')).toBe(false);
  state.players[0]!.position = 2;
  expect(getLegalActions(state).some((a) => a.type === 'upgrade')).toBe(false);
});
it.each([0, 1, 2, 3, 5])('unlocks a hotel only after two complete laps (laps=%i)', (laps) => {
  const state = game();
  state.phase = 'property';
  state.players[0]!.position = 1;
  state.players[0]!.laps = laps;
  state.properties[1]!.ownerId = 'a';
  state.properties[1]!.level = 3;
  expect(getLegalActions(state).some((a) => a.type === 'upgrade')).toBe(laps >= 2);
  const result = reduceGame(state, { type: 'upgrade', playerId: 'a' });
  expect(result.state.properties[1]!.level).toBe(laps >= 2 ? 4 : 3);
});
it('opens the duel on its board tile and removes it from the current Chance deck', () => {
  const state = game();
  state.players[0]!.position = 20;
  const rolls = [0, 0.2];
  const result = reduceGame(state, { type: 'roll', playerId: 'a' }, () => rolls.shift() ?? 0.99);
  expect(result.state.players[0]!.position).toBe(23);
  expect(result.state.phase).toBe('duel');
  expect(result.state.duel?.challengerId).toBe('a');
  expect(result.state.config.board[23]!.type).toBe('duel');
  expect(config.cards.some((c) => c.effect === 'duel')).toBe(false);
  expect(validateState(result.state)).toEqual([]);
});
it('protects early rounds, spaces crises by eight rounds and caps them at two after serialization', () => {
  let state = game();
  state.config.crisisChance = 100;
  const events: GameEvent[] = [];
  for (const round of [1, 5, 6, 7, 13, 14, 22, 50]) {
    state.adventure!.round = round;
    maybeCrisis(state, () => 0, events);
    expect(Boolean(state.crisis)).toBe([6, 14].includes(round));
    endWorldTurn(state, 'a', events);
    endWorldTurn(state, 'b', events);
    state = JSON.parse(JSON.stringify(state));
  }
  expect(state.crisisHistory).toEqual({ count: 2, lastRound: 14 });
  expect(events.filter((e) => e.type === 'crisis')).toHaveLength(2);
  expect(validateState(state)).toEqual([]);
});
