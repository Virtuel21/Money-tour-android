export type Language = 'fr' | 'en';
export const LANGUAGE_KEY = 'money-tour.language.v1';
const COUNTRY_KEY = 'money-tour.country.v1';
export const COUNTRY_ENDPOINT = 'https://get.geojs.io/v1/ip/country.json';
let language: Language = 'fr';
let revision = 0;
const listeners = new Set<() => void>();

export function getLanguage() {
  return language;
}
export const numberLocale = () => (language === 'en' ? 'en-GB' : 'fr-FR');
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function readPreference(): Language | undefined {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    return value === 'en' || value === 'fr' ? value : undefined;
  } catch {
    return undefined;
  }
}
function applyLanguage(next: Language) {
  language = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}
/** Explicit choices win, even when storage is unavailable or detection is still pending. */
export function setLanguage(next: Language) {
  revision++;
  try {
    localStorage.setItem(LANGUAGE_KEY, next);
  } catch {
    /* Keep the choice for this visit. */
  }
  applyLanguage(next);
}
export function browserLanguage(locales: readonly string[]): Language {
  for (const locale of locales) {
    try {
      const value = new Intl.Locale(locale);
      return value.region
        ? value.region === 'FR'
          ? 'fr'
          : 'en'
        : value.language === 'fr'
          ? 'fr'
          : 'en';
    } catch {
      /* Ignore malformed browser locales. */
    }
  }
  return 'en';
}
/** IP country only. No location permission, coordinates or IP address is stored. */
export async function initializeLanguage(
  request: typeof fetch = fetch,
  locales: readonly string[] = navigator.languages,
) {
  const currentRevision = ++revision;
  const saved = readPreference();
  if (saved) {
    applyLanguage(saved);
    return;
  }
  applyLanguage(browserLanguage(locales));
  try {
    const cached = JSON.parse(sessionStorage.getItem(COUNTRY_KEY) ?? 'null');
    if (cached && /^[A-Z]{2}$/.test(cached.country) && Date.now() - cached.at < 3_600_000) {
      applyLanguage(cached.country === 'FR' ? 'fr' : 'en');
      return;
    }
  } catch {
    /* Detection also works without session storage. */
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await request(COUNTRY_ENDPOINT, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) return;
    const data: unknown = await response.json();
    const country =
      typeof data === 'object' && data !== null && 'country' in data ? data.country : undefined;
    if (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country)) return;
    try {
      sessionStorage.setItem(COUNTRY_KEY, JSON.stringify({ country, at: Date.now() }));
    } catch {
      /* Optional cache. */
    }
    if (revision === currentRevision && !readPreference())
      applyLanguage(country === 'FR' ? 'fr' : 'en');
  } catch {
    /* Keep the browser fallback when offline or blocked. */
  } finally {
    clearTimeout(timeout);
  }
}
