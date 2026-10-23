import { accumulateStats, newGameStats, validGameStats, type GameStats } from './gameStats';
import { numberLocale } from '../i18n/language';
import {
  config,
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
  sameRules,
  type GameConfig,
  createGame,
  createRng,
  reduceGame,
  validateState,
  type GameAction,
  type GameOptions,
  type GameResult,
  type GameState,
} from '@money-tour/engine';

export interface LocalSave {
  stats?: GameStats;
  history?: string[];
  version: 1;
  seed: string;
  state: GameState;
}
const key = 'money-tour.local.v17';
export function newLocal(options: GameOptions): LocalSave {
  const seed = crypto.randomUUID();
  const state = createGame({ ...options, seed }, createRng(seed));
  return { version: 1, seed, state, stats: newGameStats(state) };
}
export function applyLocal(
  save: LocalSave,
  action: GameAction,
): { save: LocalSave; result: GameResult } {
  const result = reduceGame(save.state, action, createRng(`${save.seed}:${save.state.seq}`));
  return {
    save: {
      ...save,
      state: result.state,
      stats: accumulateStats(save.stats, save.state, result.state, result.events),
    },
    result,
  };
}
export function loadLocal(): LocalSave | null {
  try {
    const raw =
      localStorage.getItem(key) ??
      localStorage.getItem('money-tour.local.v16') ??
      localStorage.getItem('money-tour.local.v15') ??
      localStorage.getItem('money-tour.local.v14') ??
      localStorage.getItem('money-tour.local.v13') ??
      localStorage.getItem('money-tour.local.v12') ??
      localStorage.getItem('money-tour.local.v11') ??
      localStorage.getItem('money-tour.local.v10') ??
      localStorage.getItem('money-tour.local.v9') ??
      localStorage.getItem('money-tour.local.v8') ??
      localStorage.getItem('money-tour.local.v7') ??
      localStorage.getItem('money-tour.local.v6') ??
      localStorage.getItem('money-tour.local.v5') ??
      localStorage.getItem('money-tour.local.v4');
    if (!raw) return null;
    const save = JSON.parse(raw) as LocalSave;
    if (!validGameStats(save.stats) || save.stats.lastSeq !== save.state?.seq) delete save.stats;
    if (save?.version === 1 && save.state?.config?.version === 4) {
      const oldConfig: GameConfig = { ...legacyConfig, version: 4 } as GameConfig;
      delete oldConfig.championshipDuration;
      if (
        JSON.stringify(save.state.config) === JSON.stringify(oldConfig) &&
        validateState(save.state).length === 0
      ) {
        save.state.config = structuredClone(legacyConfig) as GameConfig;
        for (const property of Object.values(save.state.properties))
          if (property.championships) {
            property.championships = 1;
            property.championshipTurns = config.championshipDuration;
          }
      }
    }
    if (
      save.version !== 1 ||
      (save.history !== undefined &&
        (!Array.isArray(save.history) ||
          save.history.some((entry) => typeof entry !== 'string'))) ||
      typeof save.seed !== 'string' ||
      !(
        sameRules(save.state.config, config) ||
        sameRules(save.state.config, legacyConfigV16 as GameConfig) ||
        sameRules(save.state.config, legacyConfigV15 as GameConfig) ||
        sameRules(save.state.config, legacyConfigV14 as GameConfig) ||
        sameRules(save.state.config, legacyConfigV13 as GameConfig) ||
        sameRules(save.state.config, legacyConfigV12 as GameConfig) ||
        sameRules(save.state.config, legacyConfigV11 as GameConfig) ||
        sameRules(save.state.config, legacyConfigV10 as GameConfig) ||
        sameRules(save.state.config, legacyConfigV9 as GameConfig) ||
        sameRules(save.state.config, legacyConfigV8 as GameConfig) ||
        sameRules(save.state.config, legacyConfigV7 as GameConfig) ||
        sameRules(save.state.config, legacyConfigV6 as GameConfig) ||
        sameRules(save.state.config, legacyConfig as GameConfig)
      ) ||
      validateState(save.state).length
    )
      return null;
    return save;
  } catch {
    return null;
  }
}
export function persistLocal(save: LocalSave): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export const money = (value: number, compact = false): string =>
  new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: compact ? 0 : 2 }).format(value) +
  ' 💵';
export const duration = (ms: number): string =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, '0')}:${Math.floor((ms % 60000) / 1000)
    .toString()
    .padStart(2, '0')}`;
export const colors = ['#087BEE', '#EE2758', '#7E36DF', '#F3B600'];
export const pawnNames = ['Léa', 'Max', 'Lou', 'Noa'];
export const phaseText: Record<GameState['phase'], string> = {
  auction: 'Une ville aux enchères !',
  duel: 'Pierre, feuille, ciseaux !',
  alliance: 'Une alliance à conclure',
  casino: 'La chance vous sourit ?',
  attack: 'Choisissez votre cible',
  rent: 'Un loyer vous attend',
  roll: 'À vous de lancer !',
  island: 'Une escale sur l’île',
  travel: 'Le monde vous attend',
  property: 'À vous de décider',
  championship: 'Accueillez le festival',
  debt: 'Un paiement à régler',
  end: 'Une nouvelle escale ?',
  finished: 'La fortune a choisi',
};
export const victoryText: Record<string, string> = {
  line: 'Monopole de ligne',
  triple_monopoly: 'Triple monopole',
  resort_monopoly: 'Monopole balnéaire',
  bankruptcy: 'Dernier empire debout',
  timeout: 'Le plus beau patrimoine',
  abandoned: 'Partie terminée',
};
