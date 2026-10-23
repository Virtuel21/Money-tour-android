// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { config, createGame, type GameState } from '@money-tour/engine';
import type { Taunt } from '../src/game/taunts';
import type { Cue } from '../src/game/presentation';
import { DRAWN_CARD_EXIT_MS } from '../src/game/DrawnCard';
import App from '../src/App';
const scene = vi.hoisted(() => ({
  state: null as GameState | null,
  busy: false,
  cue: { kind: 'hop', duration: 0 } as Cue,
  dismiss: vi.fn(),
}));
vi.mock('../src/game/preview', () => ({
  previewScenario: () => ({ version: 1, seed: 'app-test', state: scene.state }),
}));
vi.mock('../src/game/usePresentation', () => ({
  usePresentation: () => ({
    frame: { state: scene.state, cue: scene.cue },
    busy: scene.busy,
    present: vi.fn(),
    reset: vi.fn(),
    dismiss: scene.dismiss,
  }),
}));
vi.mock('../src/board/Board3D', () => ({
  default: ({ onPlayer, taunt }: { onPlayer?: (id: string) => void; taunt?: Taunt }) =>
    createElement(
      'div',
      {},
      createElement('button', {
        'aria-label': 'Test pawn',
        disabled: !onPlayer,
        onClick: () => onPlayer?.('a'),
      }),
      taunt
        ? createElement('img', {
            className: 'pawn-taunt',
            alt: 'Taunt',
            src: taunt.playerId + '-' + taunt.kind,
          })
        : null,
    ),
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
  scene.cue = { kind: 'hop', duration: 0 };
  scene.dismiss.mockClear();
});
async function mount() {
  vi.useFakeTimers();
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(App));
    await vi.dynamicImportSettled();
  });
  return host;
}
const game = () =>
  createGame({
    config: { ...config, shuffleStreets: false, adventures: false },
    players: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ],
  });
it.each(['notice', 'card', 'tax', 'casino', 'money'] as const)(
  'lets a player dismiss %s feedback during a bot turn without changing game state',
  async (kind) => {
    scene.state = game();
    scene.state.currentPlayer = 1;
    scene.state.players[1]!.bot = true;
    scene.busy = true;
    scene.cue = {
      kind,
      duration: 5000,
      playerId: 'b',
      cardId: 'chance-01',
      amount: 100,
      message: 'Information',
    };
    const before = structuredClone(scene.state);
    const host = await mount();
    const close = host.querySelector<HTMLButtonElement>(
      kind === 'money'
        ? '.money-close'
        : kind === 'card' || kind === 'tax'
          ? '.drawn-card-continue'
          : '.action-card-close',
    );
    expect(close).not.toBeNull();
    await act(() => close!.click());
    if (kind !== 'money') {
      expect(scene.dismiss).not.toHaveBeenCalled();
      expect(close!.disabled).toBe(true);
      await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
    }
    expect(scene.dismiss).toHaveBeenCalledOnce();
    expect(scene.state).toEqual(before);
  },
);

it('lets Escape dismiss an announcement', async () => {
  scene.state = game();
  scene.busy = true;
  scene.cue = { kind: 'notice', duration: 5000, message: 'Information' };
  const host = await mount();
  await act(() =>
    host.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })),
  );
  expect(scene.dismiss).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
  expect(scene.dismiss).toHaveBeenCalledOnce();
});
it('cancels the old departure when a consecutive announcement replaces it', async () => {
  scene.state = game();
  scene.busy = true;
  scene.cue = {
    kind: 'notice',
    duration: 7600,
    reason: 'insurance',
    message: 'Première information',
  };
  const host = await mount();
  const first = host.querySelector('.action-card-dialog')!;
  await act(() => first.querySelector<HTMLButtonElement>('.action-card-close')!.click());
  await act(() => vi.advanceTimersByTime(100));
  scene.cue = {
    kind: 'notice',
    duration: 7600,
    reason: 'crisis',
    message: 'Deuxième information',
  };
  await act(() => root.render(createElement(App)));
  const second = host.querySelector('.action-card-dialog')!;
  expect(second).not.toBe(first);
  expect(second.classList.contains('is-leaving')).toBe(false);
  expect(second.textContent).toContain('Deuxième information');
  await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
  expect(scene.dismiss).not.toHaveBeenCalled();
  await act(() => second.querySelector<HTMLButtonElement>('.action-card-close')!.click());
  await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
  expect(scene.dismiss).toHaveBeenCalledOnce();
});
it('opens the buyout picker from the game CTA without transferring the property first', async () => {
  scene.state = game();
  scene.busy = false;
  scene.state.phase = 'property';
  scene.state.players[0]!.position = 5;
  scene.state.properties[5] = { ownerId: 'b', level: 0, championships: 0 };
  const host = await mount();
  await act(() =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent?.startsWith('Racheter'))!
      .click(),
  );
  expect(host.querySelector('.purchase-title')?.textContent).toContain('RACHETER CETTE VILLE');
  expect(scene.state.properties[5]!.ownerId).toBe('b');
  expect(host.querySelectorAll('.purchase-levels button')).toHaveLength(5);
});
it('opens while a bot animates, keeps the sender across turn changes and displays only the pawn image', async () => {
  scene.state = game();
  scene.state.players[1]!.bot = true;
  scene.state.currentPlayer = 1;
  scene.busy = true;
  const host = await mount();
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Test pawn"]')!.click());
  expect(host.querySelector('.taunt-picker')!.textContent).toContain('Alice');
  scene.state = { ...scene.state, turn: scene.state.turn + 1 };
  await act(() => root.render(createElement(App)));
  expect(host.querySelector('.taunt-picker')!.textContent).toContain('Alice');
  await act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="Merci pour le loyer !"]')!.click(),
  );
  await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
  expect(host.querySelector('.taunt-picker')).toBeNull();
  expect(host.querySelectorAll('.pawn-taunt')).toHaveLength(1);
  expect(host.querySelector('.taunt-toast')).toBeNull();
  expect(host.textContent).not.toContain('Merci pour le loyer !');
  expect(host.querySelector('.pawn-taunt')!.getAttribute('src')).toBe('a-cash');
});
it('collapses each desktop player independently, keeps the balance and restores the inventory after a turn change', async () => {
  scene.state = game();
  scene.busy = false;
  scene.state.properties[1] = { ownerId: 'a', level: 0, championships: 0 };
  const host = await mount();
  const player = host.querySelector('[data-bank="a"]')!;
  const other = host.querySelector('[data-bank="b"]')!;
  expect(player.querySelector('.mini-property')).not.toBeNull();
  await act(() => player.querySelector<HTMLButtonElement>('.player-collapse')!.click());
  expect(player.querySelector('.player-collapse')!.getAttribute('aria-expanded')).toBe('false');
  expect(player.querySelector('.player-inventory')).toBeNull();
  expect(player.querySelector('.property-count')).toBeNull();
  expect(player.querySelector('.player-summary')!.textContent).toContain('1 500');
  expect(other.querySelector('.player-inventory')).not.toBeNull();
  scene.state = { ...scene.state, currentPlayer: 1, turn: scene.state.turn + 1 };
  await act(() => root.render(createElement(App)));
  expect(player.querySelector('.player-inventory')).toBeNull();
  await act(() => player.querySelector<HTMLButtonElement>('.player-collapse')!.click());
  expect(player.querySelector('.mini-property')).not.toBeNull();
  expect(player.querySelector('.player-collapse')!.getAttribute('aria-expanded')).toBe('true');
});
