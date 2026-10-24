import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chooseBotAction,
  legacyConfig,
  legacyConfigV6,
  legacyConfigV7,
  legacyConfigV8,
  legacyConfigV9,
  legacyConfigV10,
  legacyConfigV11,
  legacyConfigV12,
  legacyConfigV13,
  legacyConfigV14,
  legacyConfigV15,
  legacyConfigV16,
  legacyConfigV17,
  type GameConfig,
} from '@money-tour/engine';
import { applyLocal, loadLocal, newLocal, persistLocal } from '../src/game/local';

describe('local session', () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('resumes v17 with its original travel destinations and opens rival travel in a new game', () => {
    const players = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];
    const save = newLocal({ config: legacyConfigV17 as GameConfig, players });
    data.set('money-tour.local.v17', JSON.stringify(save));
    expect(loadLocal()).toEqual(save);
    expect(loadLocal()!.state.config.travelToRivals).toBeUndefined();
    expect(newLocal({ players }).state.config.travelToRivals).toBe(true);
  });
  it('keeps the five-lap hotel rule when resuming v16 but uses two laps in new games', () => {
    const players = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];
    const save = newLocal({ config: legacyConfigV16 as GameConfig, players });
    data.set('money-tour.local.v16', JSON.stringify(save));
    expect(loadLocal()).toEqual(save);
    expect(loadLocal()!.state.config.hotelUnlockLaps).toBe(5);
    const fresh = newLocal({ players });
    expect(fresh.state.config.hotelUnlockLaps).toBe(2);
    persistLocal(fresh);
    expect(data.has('money-tour.local.v17')).toBe(true);
    expect(loadLocal()).toEqual(fresh);
  });
  it('resumes a v15 save with its board, economy and random sequence intact', () => {
    const save = newLocal({
      config: legacyConfigV15 as GameConfig,
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    data.set('money-tour.local.v15', JSON.stringify(save));
    expect(loadLocal()).toEqual(save);
  });
  it('resumes v14 without changing the economy or random stream for Festival artwork', () => {
    const save = newLocal({
      config: legacyConfigV14 as GameConfig,
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    data.set('money-tour.local.v14', JSON.stringify(save));
    const restored = loadLocal()!;
    expect(restored).toEqual(save);
    const action = chooseBotAction(save.state);
    expect(applyLocal(restored, action)).toEqual(applyLocal(save, action));
  });
  it('resumes v13 with the same economy, properties and earthquake rules', () => {
    const save = newLocal({
      config: legacyConfigV13 as GameConfig,
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    data.set('money-tour.local.v13', JSON.stringify(save));
    expect(loadLocal()).toEqual(save);
  });
  it('resumes v12 without adding earthquakes or renaming its cities', () => {
    const save = newLocal({
      config: legacyConfigV12 as GameConfig,
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    data.set('money-tour.local.v12', JSON.stringify(save));
    expect(loadLocal()).toEqual(save);
    expect(loadLocal()!.state.config.earthquakeChance).toBeUndefined();
    expect(loadLocal()!.state.config.board.some((t) => t.name === 'Coimbra')).toBe(true);
  });
  it('resumes v11 without changing its two casinos, three Chance spaces or duel rules', () => {
    const save = newLocal({
      config: legacyConfigV11 as GameConfig,
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    data.set('money-tour.local.v11', JSON.stringify(save));
    expect(loadLocal()).toEqual(save);
    expect(loadLocal()!.state.config.duelReplayTies).toBeUndefined();
  });
  it('preserves v10 saves with land-only purchases', () => {
    const save = newLocal({
      config: legacyConfigV10 as GameConfig,
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    data.set('money-tour.local.v10', JSON.stringify(save));
    expect(loadLocal()).toEqual(save);
    expect(loadLocal()!.state.config.bundledPurchase).toBeUndefined();
  });
  it('preserves v9 prices and insurance rules when resuming an existing game', () => {
    const save = newLocal({
      config: legacyConfigV9 as GameConfig,
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    data.set('money-tour.local.v9', JSON.stringify(save));
    expect(loadLocal()).toEqual(save);
    expect(loadLocal()!.state.config.pricesFollowPosition).toBeUndefined();
  });
  it('resumes v8 saves with their original construction rules, Karma and Chance deck', () => {
    const save = newLocal({
      config: legacyConfigV8 as GameConfig,
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    data.set('money-tour.local.v8', JSON.stringify(save));
    const resumed = loadLocal()!;
    expect(resumed).toEqual(save);
    expect(resumed.state.config.hotelUnlockLaps).toBeUndefined();
    expect(resumed.state.config.board.some((tile) => tile.type === 'karma')).toBe(true);
    expect(resumed.state.config.cards.some((card) => card.effect === 'duel')).toBe(true);
    const action = chooseBotAction(save.state);
    expect(applyLocal(resumed, action)).toEqual(applyLocal(save, action));
  });
  it('preserves v7 saves without retroactively adding quests or a new party rule', () => {
    const save = newLocal({
      config: legacyConfigV7 as GameConfig,
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    data.set('money-tour.local.v7', JSON.stringify(save));
    expect(loadLocal()).toEqual(save);
    expect(loadLocal()!.state.adventure).toBeUndefined();
  });
  it('preserves the shuffled 26-cell edition and resumes it unchanged', () => {
    const save = newLocal({
      config: legacyConfigV6 as GameConfig,
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    data.set('money-tour.local.v6', JSON.stringify(save));
    expect(loadLocal()).toEqual(save);
    expect(loadLocal()!.state.config.board).toHaveLength(26);
  });
  it('migrates the previous edition without losing money, positions or the random stream', () => {
    const old = newLocal({
      config: legacyConfig as GameConfig,
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    old.state.config.version = 4;
    delete old.state.config.championshipDuration;
    old.state.players[0]!.cash = 876543;
    old.state.players[0]!.position = 12;
    old.state.seq = 23;
    old.state.properties[1] = { ownerId: 'a', level: 2, championships: 3 };
    const raw = JSON.stringify(old);
    data.set('money-tour.local.v4', raw);
    const resumed = loadLocal()!;
    expect(resumed.state.config.version).toBe(5);
    expect(resumed.seed).toBe(old.seed);
    expect(resumed.state.seq).toBe(23);
    expect(resumed.state.players).toEqual(old.state.players);
    expect(resumed.state.properties[1]).toEqual({
      ownerId: 'a',
      level: 2,
      championships: 1,
      championshipTurns: 4,
    });
    expect(data.get('money-tour.local.v4')).toBe(raw);
    old.state.properties[1]!.championships = -1;
    data.set('money-tour.local.v4', JSON.stringify(old));
    expect(loadLocal()).toBeNull();
  });
  it('resumes the exact same random stream after serialization', () => {
    let save = newLocal({
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    for (let i = 0; i < 80 && !save.state.winner; i++) {
      expect(persistLocal(save)).toBe(true);
      const action = chooseBotAction(save.state);
      const resumed = applyLocal(loadLocal()!, action);
      const uninterrupted = applyLocal(save, action);
      expect(resumed).toEqual(uninterrupted);
      save = uninterrupted.save;
    }
  });
  it('rejects corrupted or incompatible saves', () => {
    for (const value of [
      'bad',
      'null',
      '{}',
      '{"version":2}',
      '{"version":1,"seed":"x","state":{}}',
    ]) {
      data.set('money-tour.local.v7', value);
      expect(loadLocal()).toBeNull();
    }
  });
  it('preserves the previous board save and rejects old topology in the new slot', () => {
    const save = newLocal({
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    data.set('money-tour.local.v1', 'old game preserved');
    persistLocal(save);
    expect(data.get('money-tour.local.v1')).toBe('old game preserved');
    expect(loadLocal()).toEqual(save);
    save.state.config.version = 3;
    persistLocal(save);
    expect(loadLocal()).toBeNull();
  });
  it('handles denied storage without crashing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(loadLocal()).toBeNull();
    expect(
      persistLocal(
        newLocal({
          players: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
          ],
        }),
      ),
    ).toBe(false);
  });
});
