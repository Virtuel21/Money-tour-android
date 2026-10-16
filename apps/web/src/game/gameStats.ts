import type { GameEvent, GameOptions, GameState } from '@money-tour/engine';

export interface GameStats {
  complete: boolean;
  lastSeq: number;
  rent: Record<string, number>;
  rentByTile: Record<string, Record<number, number>>;
}

export function newGameStats(state: GameState): GameStats {
  return { complete: state.seq === 0, lastSeq: state.seq, rent: {}, rentByTile: {} };
}

/** Count money actually paid for rent, including a bankrupt tenant's partial repayment. */
export function accumulateStats(
  previous: GameStats | undefined,
  before: GameState,
  after: GameState,
  events: GameEvent[],
): GameStats {
  const stats = structuredClone(previous ?? newGameStats(before));
  if (after.seq <= stats.lastSeq) return stats;
  if (before.seq !== stats.lastSeq) stats.complete = false;
  for (const event of events) {
    if (
      event.type !== 'payment' ||
      (event.reason !== 'rent' &&
        !(event.reason === 'bankruptcy' && event.debtReason === 'rent')) ||
      !event.playerId ||
      !after.players.some((player) => player.id === event.playerId) ||
      !Number.isSafeInteger(event.amount) ||
      event.amount! <= 0
    )
      continue;
    stats.rent[event.playerId] = (stats.rent[event.playerId] ?? 0) + event.amount!;
    if (typeof event.tile === 'number' && after.properties[event.tile]) {
      const tiles = (stats.rentByTile[event.playerId] ??= {});
      tiles[event.tile] = (tiles[event.tile] ?? 0) + event.amount!;
    }
  }
  stats.lastSeq = after.seq;
  return stats;
}

/** A fresh journey preserves the table, never the previous debts or possessions. */
export function rematchOptions(state: GameState, randomFirstPlayer = true): GameOptions {
  return {
    ...(randomFirstPlayer ? { randomFirstPlayer: true } : {}),
    players: state.players.map(({ id, name, bot, team }) => ({
      id,
      name,
      bot,
      ...(team !== undefined ? { team } : {}),
    })),
    mode: state.mode,
    durationMs: state.durationMs,
    ...(state.presentationPace ? { presentationPace: state.presentationPace } : {}),
  };
}

export function validGameStats(value: unknown): value is GameStats {
  if (!value || typeof value !== 'object') return false;
  const stats = value as GameStats;
  const amounts = (v: unknown): boolean =>
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.values(v).every((n) => Number.isSafeInteger(n) && (n as number) >= 0);
  return (
    typeof stats.complete === 'boolean' &&
    Number.isSafeInteger(stats.lastSeq) &&
    stats.lastSeq >= 0 &&
    amounts(stats.rent) &&
    !!stats.rentByTile &&
    typeof stats.rentByTile === 'object' &&
    !Array.isArray(stats.rentByTile) &&
    Object.values(stats.rentByTile).every(amounts)
  );
}
