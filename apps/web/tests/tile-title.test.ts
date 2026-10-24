import { expect, it } from 'vitest';
import { boardTileTitle, tileTitle } from '../src/game/tileTitle';

it('leaves the start tile unlabelled while keeping its accessible and detail title', () => {
  const tile = { type: 'start', name: 'Départ' } as const;
  expect(boardTileTitle(tile)).toBe('');
  expect(tileTitle(tile)).toBe('Départ');
});

it('uses the short Duel title on the board and in details, including historical saves', () => {
  const tile = { type: 'duel', name: 'Le grand duel' } as const;
  expect(boardTileTitle(tile)).toBe('Duel');
  expect(tileTitle(tile)).toBe('Duel');
});
