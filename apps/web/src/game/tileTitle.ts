import type { Tile } from '@money-tour/engine';

/** A visual rename also applies when displaying a preserved historical save. */
export function tileTitle(tile: Pick<Tile, 'type' | 'name'>) {
  return tile.type === 'championship' ? 'Festival' : tile.type === 'duel' ? 'Duel' : tile.name;
}

export function boardTileTitle(tile: Pick<Tile, 'type' | 'name'>) {
  const titles: Partial<Record<Tile['type'], string>> = {
    start: '',
    duel: 'Duel',
    travel: 'Voyage',
    casino: 'Casino',
    chance: 'Chance',
    tax: 'Taxe',
    insurance: 'Assurance',
    karma: 'Karma',
  };
  return titles[tile.type] ?? tileTitle(tile);
}

export function festivalText(text?: string) {
  return (text ?? '')
    .replaceAll('Championnat du monde', 'Festival')
    .replaceAll('Invitation sportive', 'Pass festival')
    .replaceAll('Mondial', 'Festival');
}

/** Keep explanations in saved cards consistent with property eligibility. */
export function propertyRulesText(text?: string) {
  return festivalText(text).replaceAll(
    'Choisissez une ville adverse',
    'Choisissez une ville ou une île adverse',
  );
}
