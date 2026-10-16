import english from './en.json';
import { getLanguage } from './language';

const dictionary: Readonly<Record<string, string>> = english;
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const exact = new Map(
  Object.entries(dictionary).map(([key, value]) => [normalize(key), value.trim()]),
);
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Saved games and network events retain canonical French text. These anchored
// templates translate that presentation without touching authoritative game data.
const patterns = Object.entries(dictionary)
  .filter(([key]) => /\{\d+\}/.test(key) && key.replace(/\{\d+\}/g, '').trim().length >= 3)
  .sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length)
  .map(([key, value]) => {
    const indices: number[] = [];
    const parts = normalize(key).split(/(\{\d+\})/g);
    const expression = parts
      .map((part) => {
        const parameter = /^\{(\d+)\}$/.exec(part);
        if (!parameter) return escape(part);
        indices.push(Number(parameter[1]));
        return '(.*?)';
      })
      .join('');
    return { key, value, indices, regex: new RegExp('^' + expression + '$', 'u') };
  });

// Only these slots contain localisable game copy. Player names, room codes and
// amounts in every other slot pass through unchanged, even if they match a key.
const messageSlots: Readonly<Record<string, readonly number[]>> = {
  'Nouveau voyage ! {0}': [0],
  'Bon voyage ! {0}': [0],
  '{0} Cette carte est consommée lors de son utilisation.': [0],
  '{0} doit régler {1} de {2}.': [2],
  '{0} au casino : {1}+{2}.': [1],
  '{0} arrive sur {1}.': [1],
  '{0} fait retirer une maison à {1}.': [1],
  '{0} est débarrassée des cafards : son loyer est rétabli.': [0],
  '{0} a été expropriée et redevient libre.': [0],
  '{0} : loyer divisé par deux pendant deux tours.': [0],
  '{0} assure {1}.': [1],
  '{0} achète {1} pour {2}.': [1],
  '{0} rachète {1} pour {2}.': [1],
  '{0} construit à {1} : {2} · {3}.': [1, 2],
  '{0} vend {1}.': [1],
  'Le Festival de {0} est terminé.': [0],
  '{0} organise un festival à {1}.': [1],
  '{0} s’envole vers {1}.': [1],
  'Assurance · {0}': [0],
  'Marché flottant · {0} {1}.': [0, 1],
  'Festivals : {0} · loyers ×2': [0],
  'Villes jumelles · {0} : loyers ×2 si vous possédez les deux.': [0],
  'Festivals · {0} : loyers ×2 pendant la partie.': [0],
  'La Capitale mystère était {0} ! {1}': [0, 1],
  'Tremblement de terre à {0} ! {1} : {2}': [0, 2],
  '{0} a accompli « {1} » et remporte {2} !': [1],
  '{0} : {1} est proposée à tous. Préparez votre offre secrète !': [0, 1],
  '{0} remporte {1}{2} ! Les montants des offres ne sont pas affichés.': [1, 2],
  'Festival · {0}': [0],
  'Cafards · {0}': [0],
  'Le loyer de {0} est doublé. Durée restante : {1} retours de votre tour. Un double aux dés ne réduit pas cette durée.':
    [0],
};
const cache = new Map<string, string>();

function translated(source: string, depth = 0): string {
  if (!/[A-Za-zÀ-ÿ]/.test(source)) return source;
  if (cache.has(source)) return cache.get(source)!;
  const trimmed = normalize(source);
  const direct = exact.get(trimmed);
  let result = direct;
  if (result === undefined) {
    const divider = trimmed.indexOf(' : ');
    const detail = divider >= 0 ? exact.get(trimmed.slice(divider + 3)) : undefined;
    if (detail !== undefined) result = trimmed.slice(0, divider) + ': ' + detail;
  }
  if (result === undefined && depth < 5) {
    for (const pattern of patterns) {
      const match = pattern.regex.exec(trimmed);
      if (!match) continue;
      const parameters = new Map(
        pattern.indices.map((index, position) => [index, match[position + 1]!]),
      );
      result = pattern.value.replace(/\{(\d+)\}/g, (_, index) => {
        const value = parameters.get(Number(index)) ?? '';
        // Player names and amounts remain opaque. Nested messages are localised
        // only in designated descriptive slots.
        const descriptive = messageSlots[pattern.key]?.includes(Number(index));
        if (!descriptive) return value;
        if (/^(?:Festivals|Villes jumelles)/.test(pattern.key)) {
          return value
            .split(/(, | \+ )/)
            .map((part) => translated(part, depth + 1))
            .join('');
        }
        return translated(value, depth + 1);
      });
      break;
    }
  }
  const output =
    result === undefined
      ? source
      : (source.match(/^\s*/)?.[0] ?? '') + result + (source.match(/\s*$/)?.[0] ?? '');
  if (cache.size >= 4000) cache.clear();
  cache.set(source, output);
  return output;
}

/** Localise display strings; other React values and game objects pass through. */
export function translate<T>(value: T): T {
  return (getLanguage() === 'en' && typeof value === 'string' ? translated(value) : value) as T;
}

/** Explicit interpolation preserves user names and allows English word order. */
export function formatText(source: string, ...values: unknown[]): string {
  const template = getLanguage() === 'en' ? (dictionary[source] ?? source) : source;
  return template.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? ''));
}
