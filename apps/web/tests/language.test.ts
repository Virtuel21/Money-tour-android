// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { config, createGame } from '@money-tour/engine';
import {
  browserLanguage,
  getLanguage,
  initializeLanguage,
  LANGUAGE_KEY,
  setLanguage,
} from '../src/i18n/language';
import { translate, formatText } from '../src/i18n/translate';
import { LanguagePicker, useLanguage } from '../src/i18n/LanguagePicker';
import { SettingsPanel } from '../src/game/SettingsPanel';
import { loadComfort } from '../src/game/comfort';
import { loadAudio } from '../src/audio/synth';
import { PurchaseDetails } from '../src/game/PurchaseOffer';
import { money } from '../src/game/local';
import { lessons } from '../src/game/tutorial';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root: Root | undefined;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setLanguage('fr');
  localStorage.clear();
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.useRealTimers();
  setLanguage('fr');
});
const country = (value: string) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ country: value })));

it.each(['FR', 'US', 'BE', 'CA', 'CH', 'GB'])(
  'uses French only for country %s = FR',
  async (code) => {
    await initializeLanguage(country(code), ['fr-FR']);
    expect(getLanguage()).toBe(code === 'FR' ? 'fr' : 'en');
    expect(document.documentElement.lang).toBe(getLanguage());
  },
);
it.each([
  ['fr-FR', 'fr'],
  ['fr-CA', 'en'],
  ['fr-BE', 'en'],
  ['en-US', 'en'],
  ['fr', 'fr'],
  ['en', 'en'],
])('fallback locale %s -> %s', (locale, expected) => {
  expect(browserLanguage([locale])).toBe(expected);
});
it('keeps a saved manual choice without contacting a country service', async () => {
  setLanguage('en');
  const request = country('FR');
  await initializeLanguage(request, ['fr-FR']);
  expect(getLanguage()).toBe('en');
  expect(request).not.toHaveBeenCalled();
  expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
});
it('never overwrites a manual choice made during country detection', async () => {
  let resolve!: (value: Response) => void;
  const pending = initializeLanguage(
    vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    ),
    ['en-US'],
  );
  setLanguage('fr');
  resolve(new Response(JSON.stringify({ country: 'US' })));
  await pending;
  expect(getLanguage()).toBe('fr');
});
it('keeps the browser fallback on failure or malformed responses', async () => {
  await initializeLanguage(vi.fn().mockRejectedValue(new Error('offline')), ['fr-CA']);
  expect(getLanguage()).toBe('en');
  await initializeLanguage(country('unexpected'), ['fr-FR']);
  expect(getLanguage()).toBe('fr');
});
it('times out a slow country request without blocking the game', async () => {
  vi.useFakeTimers();
  const request = vi.fn<typeof fetch>(
    (_, options) =>
      new Promise((_resolve, reject) =>
        options?.signal?.addEventListener('abort', () => reject(new Error('timeout'))),
      ),
  );
  const pending = initializeLanguage(request, ['en-US']);
  await vi.advanceTimersByTimeAsync(2500);
  await pending;
  expect(getLanguage()).toBe('en');
});
it('uses a short country cache but never saves an IP address', async () => {
  const request = country('FR');
  await initializeLanguage(request, ['en-US']);
  await initializeLanguage(request, ['en-US']);
  expect(request).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem('money-tour.country.v1')).not.toContain('ip');
});
it('translates the complete current Chance deck and all tutorial prose', () => {
  setLanguage('en');
  for (const card of config.cards) {
    if (!['Squatteur', 'Expropriation'].includes(card.title))
      expect(translate(card.title)).not.toBe(card.title);
    expect(translate(card.description)).not.toBe(card.description);
  }
  for (const lesson of lessons)
    for (const text of [lesson.title, lesson.text, lesson.task])
      expect(translate(text)).not.toBe(text);
});
it('preserves names and authoritative data across live switches', () => {
  const state = createGame({
    players: [
      { id: 'a', name: 'Fermer' },
      { id: 'b', name: 'Vous' },
    ],
  });
  const original = JSON.stringify(state);
  setLanguage('en');
  expect(formatText('Au tour de {0}', state.players[0]!.name)).toBe("Fermer's turn");
  expect(translate('Fermer lance les dés.')).toBe('Fermer rolls the dice.');
  expect(translate('Rue 1')).toBe('Street 1');
  expect(translate('Fermer achète Lisbonne pour 150 💵.')).toBe('Fermer buys Lisbon for 150 💵.');
  expect(translate('Loyer payé : Fermer → Vous · 15 💵.')).toBe(
    'Rent paid: Fermer → Vous · 15 💵.',
  );
  expect(translate('Fermer : Recevez 200.')).toBe('Fermer: Receive 200.');
  expect(JSON.stringify(state)).toBe(original);
  expect(money(1500, true)).toBe('1,500 💵');
  setLanguage('fr');
  expect(translate('Fermer lance les dés.')).toBe('Fermer lance les dés.');
});
it('switches settings and purchase text live while retaining the decision', async () => {
  const state = createGame({
    config: { ...config, shuffleStreets: false },
    players: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
  });
  state.phase = 'property';
  state.players[0]!.position = 5;
  state.players[0]!.laps = 2;
  function View() {
    useLanguage();
    return createElement(
      'div',
      null,
      createElement(LanguagePicker),
      createElement(SettingsPanel, {
        comfort: loadComfort(),
        setComfort: vi.fn(),
        audio: loadAudio(),
        setAudio: vi.fn(),
        reduced: false,
        setReduced: vi.fn(),
        onPreview: vi.fn(),
      }),
      createElement(PurchaseDetails, { state, onBuy: vi.fn(), onPass: vi.fn() }),
    );
  }
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(() => root!.render(createElement(View)));
  const level = host.querySelectorAll<HTMLButtonElement>('.purchase-levels button')[3]!;
  await act(() => level.click());
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="English"]')!.click());
  expect(host.textContent).toContain('Board and readability');
  expect(host.textContent).toContain('Buy with 3 houses');
  expect(level.getAttribute('aria-pressed')).toBe('true');
  expect(host.textContent).not.toContain('Réglages');
});
