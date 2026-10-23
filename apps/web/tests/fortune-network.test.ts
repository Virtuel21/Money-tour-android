import { expect, it } from 'vitest';
import { config, createGame } from '@money-tour/engine';
import { execute, needsRandom } from '../src/network/session';
import { actionSchema } from '../src/network/schema';
import { presentation, presentationMs } from '../src/game/presentation';
it('requires shared random proof for casino spins and replays exactly the same reward', () => {
  const state = createGame({
    config: { ...config, shuffleStreets: false },
    players: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    seed: 'network',
  });
  state.phase = 'casino';
  state.casino = { tile: 19, game: 'slots', chance: 20 };
  state.casinoVisits = { 19: 10 };
  const command = { type: 'action', action: { type: 'casino_spin', playerId: 'a' } } as const;
  expect(actionSchema.safeParse(command.action).success).toBe(true);
  expect(needsRandom(state, command)).toBe(true);
  expect(execute(state, command, 'both-peers')).toEqual(execute(state, command, 'both-peers'));
  expect(() =>
    execute(state, { type: 'action', action: { type: 'casino_spin', playerId: 'b' } }, 'seed'),
  ).toThrow();
  expect(needsRandom(state, { type: 'action', action: { type: 'finish', playerId: 'a' } })).toBe(
    false,
  );
  const result = execute(state, command, 'both-peers');
  const frames = presentation(state, result.state, result.events);
  expect(frames[0]!.cue.kind).toBe('casino');
  expect(frames[0]!.cue.duration).toBe(5500);
  expect(presentationMs(result.events)).toBeGreaterThanOrEqual(5500);
});
it('validates expanded board targets while refusing unknown properties and forged actions', () => {
  expect(actionSchema.safeParse({ type: 'sell', playerId: 'a', tile: 31 }).success).toBe(true);
  expect(actionSchema.safeParse({ type: 'sell', playerId: 'a', tile: 32 }).success).toBe(false);
  expect(
    actionSchema.safeParse({ type: 'casino_spin', playerId: 'a', jackpot: true }).success,
  ).toBe(false);
});
