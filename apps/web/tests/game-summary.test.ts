import { describe, expect, it } from 'vitest';
import {
  createGame,
  createRng,
  reduceGame,
  validateState,
  type GameState,
} from '@money-tour/engine';
import {
  accumulateStats,
  newGameStats,
  rematchOptions,
  validGameStats,
} from '../src/game/gameStats';
import { newLocal, applyLocal } from '../src/game/local';
import { contextualTip } from '../src/game/ContextTip';
import { quickLessons, tutorialScene } from '../src/game/tutorial';
import { execute } from '../src/network/session';
import { commandSchema } from '../src/network/schema';

describe('truthful endgame statistics', () => {
  it('counts rental receipts once without counting announcements or unrelated bankruptcy', () => {
    const before = tutorialScene('rent');
    const result = reduceGame(before, { type: 'roll', playerId: 'p2' }, createRng('lesson-roll'));
    const paid = result.events.filter((e) => e.type === 'payment' && e.reason === 'rent');
    expect(paid.length).toBeGreaterThan(0);
    const stats = accumulateStats(newGameStats(before), before, result.state, result.events);
    expect(stats.rent.p1).toBe(paid.reduce((sum, e) => sum + e.amount!, 0));
    expect(accumulateStats(stats, before, result.state, result.events)).toEqual(stats);
    const next = { ...result.state, seq: result.state.seq + 1 };
    expect(
      accumulateStats(stats, result.state, next, [
        { type: 'rent_notice', playerId: 'p1', amount: 900 },
        { type: 'payment', reason: 'bankruptcy', playerId: 'p1', amount: 500 },
        {
          type: 'payment',
          reason: 'bankruptcy',
          debtReason: 'attack',
          playerId: 'p1',
          amount: 300,
        },
      ]).rent,
    ).toEqual(stats.rent);
  });
  it('includes the partial rent actually recovered when a tenant goes bankrupt', () => {
    const before = tutorialScene('squatter');
    before.players[0]!.cash = 1;
    for (const property of Object.values(before.properties))
      if (property.ownerId === 'p1') property.ownerId = null;
    const result = reduceGame(
      before,
      { type: 'pay_rent', playerId: 'p1' },
      createRng('lesson-roll'),
    );
    expect(result.error).toBeUndefined();
    const payment = result.events.find(
      (event) => event.type === 'payment' && event.reason === 'bankruptcy',
    );
    expect(payment).toMatchObject({ playerId: 'p2', amount: 1, debtReason: 'rent' });
    expect(result.state.players[0]!.eliminated).toBe(true);
    const stats = accumulateStats(newGameStats(before), before, result.state, result.events);
    expect(stats.rent.p2).toBe(1);
    expect(stats.rentByTile.p2?.[payment!.tile!]).toBe(1);
  });
  it('does not invent complete history for an older saved game', () => {
    const before = tutorialScene('rent');
    before.seq = 40;
    const stats = accumulateStats(undefined, before, { ...before, seq: 41 }, []);
    expect(stats.complete).toBe(false);
    expect(validGameStats({ ...stats, rent: { p1: -1 } })).toBe(false);
    expect(validGameStats(stats)).toBe(true);
  });
  it('persists local statistics and resets them for a fresh rematch', () => {
    const local = newLocal({
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', bot: true },
      ],
      durationMs: 120000,
      presentationPace: 'fast',
    });
    const changed = applyLocal(local, { type: 'roll', playerId: 'a' }).save;
    expect(changed.stats?.lastSeq).toBe(changed.state.seq);
    const next = newLocal(rematchOptions(changed.state));
    expect(next.seed).not.toBe(local.seed);
    expect(next.state.players.map((p) => [p.id, p.name, p.bot])).toEqual(
      local.state.players.map((p) => [p.id, p.name, p.bot]),
    );
    expect(next.state.durationMs).toBe(120000);
    expect(next.state.presentationPace).toBe('fast');
    expect(next.stats?.rent).toEqual({});
  });
});

describe('guided entry and coherent rules', () => {
  it('only tells the deciding human to place their own insurance', () => {
    const state = tutorialScene('insurance');
    state.turn = 10;
    expect(contextualTip(state, 'p1')?.id).toBe('insurance');
    expect(contextualTip(state, 'p2')).toBeUndefined();
    state.currentPlayer = 1;
    expect(contextualTip(state, 'p2')).toBeUndefined();
    state.players[1]!.insurance = { tile: null };
    expect(contextualTip(state, 'p2')?.id).toBe('insurance');
    state.players[1]!.bot = true;
    expect(contextualTip(state, 'p2')).toBeUndefined();
  });
  it('offers five real practice steps including building and victory', () => {
    expect(quickLessons.map((lesson) => lesson.id)).toEqual([
      'roll',
      'buy',
      'build',
      'rent',
      'victory',
    ]);
    for (const lesson of quickLessons) expect(validateState(tutorialScene(lesson.id))).toEqual([]);
  });
  it('uses the current hotel threshold without exposing private goals in hints', () => {
    const state = tutorialScene('build');
    state.config.hotelUnlockLaps = 7;
    expect(contextualTip(state)?.text).toContain('7 tours complets');
    expect(contextualTip(state)?.text).not.toContain('objectif secret');
  });
  it('validates shared pace and forbids rematch before completion or with changed settings', () => {
    const state = createGame({
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      durationMs: 60000,
    });
    const command = commandSchema.parse({ type: 'rematch', options: rematchOptions(state) });
    expect(() => execute(state, command, 'fresh')).toThrow('Game not finished');
    const finished = reduceGame(state, { type: 'quit', playerId: 'a' }).state;
    expect(finished.winner).toBeTruthy();
    const legacyCommand = commandSchema.parse({
      type: 'rematch',
      options: rematchOptions(finished, false),
    });
    const legacyRematch = execute(finished, legacyCommand, 'historical').state;
    expect(legacyRematch.firstPlayer).toBeUndefined();
    expect(legacyRematch.currentPlayer).toBe(0);
    const fresh = execute(finished, command, 'fresh').state;
    expect(fresh.firstPlayer).toBe(fresh.currentPlayer);
    const malicious = commandSchema.parse({
      type: 'rematch',
      options: { ...rematchOptions(finished), durationMs: 120000 },
    });
    expect(() => execute(finished, malicious, 'fresh')).toThrow('Rematch settings changed');
    expect(
      validateState({ ...state, presentationPace: 'invalid' } as unknown as GameState),
    ).toContain('Invalid presentation pace.');
    expect(() =>
      createGame({ ...rematchOptions(state), presentationPace: 'invalid' } as never),
    ).toThrow('Invalid presentation pace.');
  });
});
