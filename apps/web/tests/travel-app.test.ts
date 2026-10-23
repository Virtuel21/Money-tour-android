// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { config, createGame, reduceGame, type GameState } from '@money-tour/engine';
import { DRAWN_CARD_EXIT_MS } from '../src/game/DrawnCard';
import App from '../src/App';

const scene = vi.hoisted(() => ({
  initial: null as GameState | null,
  visible: null as GameState | null,
}));
vi.mock('../src/game/preview', () => ({
  previewScenario: () => ({ version: 1, seed: 'travel-app', state: scene.initial }),
}));
vi.mock('../src/board/Board3D', () => ({
  default: ({ state }: { state: GameState }) => {
    scene.visible = state;
    return null;
  },
}));
vi.mock('../src/audio/synth', () => ({
  loadAudio: () => ({ music: false, effects: false, volume: 0 }),
  Soundscape: class {
    configure() {}
    setScene() {}
    effect() {}
    close() {}
    stopEffects() {}
    async unlock() {}
  },
}));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root: Root;
afterEach(async () => {
  await act(() => root?.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});
async function mount(mobile: boolean, cash = 1500) {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width') ? mobile : false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const initial = createGame({
    config: { ...config, shuffleStreets: false, adventures: false },
    players: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ],
  });
  initial.players[0]!.position = 20;
  initial.players[0]!.cash = cash;
  initial.properties[1]!.ownerId = 'b';
  scene.initial = reduceGame(initial, { type: 'roll', playerId: 'a' }, () => 0.2).state;
  expect(scene.initial.players[0]!.position).toBe(24);
  expect(scene.initial.extraRoll).toBe(true);
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => {
    root.render(createElement(App));
    await vi.dynamicImportSettled();
  });
}
function button(text: string) {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(text),
  );
  expect(b, text).toBeDefined();
  return b!;
}
async function click(text: string) {
  await act(() => button(text).click());
}
async function settle() {
  await act(() => vi.advanceTimersByTime(20000));
}

it.each([false, true])(
  'offers and completes travel instead of the extra dice roll (mobile=%s)',
  async (mobile) => {
    await mount(mobile);
    await click('Continuer · Voyage disponible');
    await settle();
    expect(scene.visible!.phase).toBe('travel');
    const cash = scene.visible!.players[0]!.cash;
    await click('Choisir ma destination');
    expect(document.querySelector('dialog')!.textContent).toContain('Choisir ma destination');
    expect(document.querySelector('.tile-list')!.textContent).not.toContain('Lisbonne');
    expect(document.querySelector('.tile-list small')!.textContent).toContain('Voyage · 50');
    // Closing the picker must not consume the right or force the extra roll.
    await act(() => document.querySelector<HTMLButtonElement>('[aria-label="Fermer"]')!.click());
    await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
    expect(scene.visible!.phase).toBe('travel');
    expect(scene.visible!.players[0]!.cash).toBe(cash);
    await click('Choisir ma destination');
    await click('Départ');
    await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
    await settle();
    expect(document.querySelector('dialog')).toBeNull();
    expect(scene.visible!.players[0]!.position).toBe(0);
    expect(scene.visible!.players[0]!.cash).toBe(cash - config.travelFee + config.startBonus);
    expect(scene.visible!.players[0]!.travelPending).toBe(false);
    expect(scene.visible!.extraRoll).toBe(false);
    expect(scene.visible!.phase).toBe('end');
    await click('Fin du tour');
    await settle();
    expect(scene.visible!.currentPlayer).toBe(1);
  },
);

it('only switches to dice when the mobile player explicitly declines travel', async () => {
  await mount(true);
  await click('Continuer · Voyage disponible');
  await settle();
  await click('Rester et lancer les dés');
  expect(scene.visible!.phase).toBe('roll');
  expect(scene.visible!.players[0]!.travelPending).toBe(false);
  expect(button('Lancer les dés').disabled).toBe(false);
});

it('explains why travel is unavailable when the player cannot pay', async () => {
  await mount(true, config.travelFee - 1);
  await click('Continuer · Voyage disponible');
  await settle();
  expect(button('fonds insuffisants').disabled).toBe(true);
  expect(button('Rester et lancer les dés').disabled).toBe(false);
});
