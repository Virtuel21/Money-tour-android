import type { LocalSave } from './local';

export const ADVENTURE_START_MS = 20_000;

/** Only fresh journeys opt in; existing saves resume without another introduction. */
export function prepareLocalAdventure(save: LocalSave, now = Date.now()): LocalSave {
  return { ...save, adventureStartDeadline: now + ADVENTURE_START_MS };
}

export function releaseLocalAdventure(save: LocalSave): LocalSave {
  const next = { ...save };
  delete next.adventureStartDeadline;
  return next;
}
