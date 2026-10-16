import { monopolyGroups, type GameEvent, type GameState } from '@money-tour/engine';

export interface Celebration {
  id: string;
  kind: 'hotel' | 'collection' | 'insurance';
  title: string;
  detail: string;
  playerId?: string;
  tile?: number;
  eventIndex: number;
}

/** Only fresh events and ownership changes produce feedback; loading a snapshot does not. */
export function eventCelebrations(
  before: GameState,
  after: GameState,
  events: GameEvent[],
): Celebration[] {
  const result: Celebration[] = [];
  events.forEach((event, eventIndex) => {
    const tile = event.tile === undefined ? undefined : after.config.board[event.tile];
    if (!tile) return;
    const name = after.players.find((p) => p.id === event.playerId)?.name;
    if (
      event.type === 'build' &&
      event.level === after.config.hotelLevel &&
      (before.properties[tile.id]?.level ?? 0) < after.config.hotelLevel
    )
      result.push({
        id: `${after.seq}:hotel:${tile.id}`,
        kind: 'hotel',
        title: 'Hôtel inauguré !',
        detail: `${tile.name}${name ? ` · ${name}` : ''}`,
        tile: tile.id,
        playerId: event.playerId,
        eventIndex,
      });
    if (event.type === 'insured')
      result.push({
        id: `${after.seq}:insurance:${tile.id}`,
        kind: 'insurance',
        title: 'Propriété protégée',
        detail: `${tile.name} · assurance consommée`,
        tile: tile.id,
        playerId: event.playerId,
        eventIndex,
      });
  });
  const living = after.players.filter((p) => !p.eliminated);
  const sides =
    after.mode === 'teams'
      ? [...new Set(living.map((p) => p.team))].map((team) => living.filter((p) => p.team === team))
      : living.map((p) => [p]);
  for (const players of sides) {
    const ids = players.map((p) => p.id);
    for (const group of monopolyGroups(after.config)) {
      const complete = (state: GameState) =>
        group.every((tile) => ids.includes(state.properties[tile.id]?.ownerId ?? ''));
      if (!complete(after) || complete(before)) continue;
      const matchingEvents = events
        .map((event, index) => ({ event, index }))
        .filter(
          ({ event }) =>
            ['purchase', 'buyout', 'auction_result'].includes(event.type) &&
            ids.includes(event.playerId ?? '') &&
            group.some((tile) => tile.id === event.tile),
        );
      const eventIndex = matchingEvents.at(-1)?.index ?? -1;
      if (eventIndex < 0) continue;
      result.push({
        id: `${after.seq}:collection:${group[0]!.id}:${ids.join(',')}`,
        kind: 'collection',
        title: group[0]!.type === 'resort' ? 'Archipel complet !' : 'Rue complète !',
        detail: `${players.map((p) => p.name).join(' & ')} · ${group.length} propriétés réunies`,
        playerId: events[eventIndex]!.playerId,
        tile: events[eventIndex]!.tile,
        eventIndex,
      });
    }
  }
  return result;
}
