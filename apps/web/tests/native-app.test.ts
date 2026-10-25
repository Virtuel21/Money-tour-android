// @vitest-environment happy-dom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { loadLocal, newLocal, persistLocal } from '../src/game/local';
import { setLanguage } from '../src/i18n/language';
import type { NativeRuntimeCallbacks } from '../src/native/runtime';

const native = vi.hoisted(() => ({
  callbacks: null as NativeRuntimeCallbacks | null,
  lobby: null as Record<string, unknown> | null,
  setAppActive: vi.fn(),
  autoReady: true,
  boardReady: null as (() => void) | null,
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));
vi.mock('../src/native/useNativeRuntime', () => ({
  useNativeRuntime: (callbacks: NativeRuntimeCallbacks) => {
    native.callbacks = callbacks;
  },
}));
vi.mock('../src/game/preview', () => ({ previewScenario: () => null }));
vi.mock('../src/board/Board3D', () => ({
  default: ({ onReady }: { onReady?: () => void }) => {
    native.boardReady = onReady ?? null;
    useEffect(() => {
      if (native.autoReady) onReady?.();
    }, [onReady]);
    return null;
  },
}));
vi.mock('../src/network/OnlineLobby', () => ({
  default: (props: Record<string, unknown>) => {
    native.lobby = props;
    useEffect(
      () => () => {
        native.lobby = null;
      },
      [],
    );
    return null;
  },
}));
vi.mock('../src/audio/synth', () => ({
  loadAudio: () => ({ music: false, effects: false, volume: 0 }),
  Soundscape: class {
    setAppActive = native.setAppActive;
    configure() {}
    setScene() {}
    close() {}
    stopEffects() {}
    effect() {}
    async unlock() {}
  },
}));

let root: Root | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  sessionStorage.clear();
  setLanguage('fr');
  history.replaceState(null, '', '/');
  native.callbacks = null;
  native.lobby = null;
  native.setAppActive.mockClear();
  native.autoReady = true;
  native.boardReady = null;
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  localStorage.clear();
  history.replaceState(null, '', '/');
});

async function mount() {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => {
    root!.render(createElement(App));
    await vi.dynamicImportSettled();
  });
}
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((element) =>
    element.textContent?.includes(text),
  )!;
const saveGame = (bots = false) => {
  const save = newLocal({
    players: [
      { id: 'a', name: 'Alice', bot: bots },
      { id: 'b', name: 'Bob', bot: bots },
    ],
  });
  persistLocal(save);
  return save;
};
async function resume() {
  await act(async () => {
    button('Reprendre ma partie').click();
    await vi.dynamicImportSettled();
  });
}

it('keeps the Android home lightweight and routes Back through the leave dialog before minimizing', async () => {
  saveGame();
  await mount();
  expect(document.querySelector('.hero-map')).toBeNull();
  expect(native.callbacks!.onBack()).toBe(false);
  await resume();
  await act(() => expect(native.callbacks!.onBack()).toBe(true));
  expect(document.querySelector('dialog[open]')?.textContent).toContain(
    'Voulez-vous quitter la partie ?',
  );
  await act(() => expect(native.callbacks!.onBack()).toBe(true));
  expect(document.querySelector('dialog[open]')).toBeNull();
  expect(document.querySelector('.game-layout')).not.toBeNull();
});

it('closes the local setup with Android Back without starting or replacing a saved game', async () => {
  const saved = saveGame();
  await mount();
  await act(() => button('Nouvelle partie sur cet appareil').click());
  expect(document.querySelector('dialog[open]')?.textContent).toContain('Jouer sur cet appareil');
  expect(document.querySelector('[aria-label="Nom du joueur 1"]')).not.toBeNull();
  await act(() => expect(native.callbacks!.onBack()).toBe(true));
  expect(document.querySelector('dialog[open]')).toBeNull();
  expect(document.querySelector('.game-layout')).toBeNull();
  expect(loadLocal()?.seed).toBe(saved.seed);
  expect(native.callbacks!.onBack()).toBe(false);
});

it('opens public matchmaking from Android home without replacing the local save', async () => {
  const saved = saveGame();
  await mount();
  const modes = document.querySelector('[aria-label="Mode de jeu"]')!;
  const online = [...modes.querySelectorAll('button')].find((element) =>
    element.textContent?.includes('En ligne'),
  )!;
  await act(() => online.click());
  await act(async () => {
    button('Trouver une partie').click();
    await vi.dynamicImportSettled();
  });
  expect(native.lobby?.open).toBe(true);
  expect(native.lobby?.publicMode).toBe('find');
  expect(loadLocal()?.seed).toBe(saved.seed);
  await act(() => expect(native.callbacks!.onBack()).toBe(true));
  expect(native.lobby).toBeNull();
  expect(native.callbacks!.onBack()).toBe(false);
});

it('saves immediately and freezes the local clock across background and foreground transitions', async () => {
  const save = saveGame();
  await mount();
  await resume();
  vi.useFakeTimers();
  localStorage.removeItem('money-tour.local.v17');
  await act(() => native.callbacks!.onActiveChange(false));
  expect(native.setAppActive).toHaveBeenLastCalledWith(false);
  expect(loadLocal()?.seed).toBe(save.seed);
  await act(() => vi.advanceTimersByTime(60_000));
  expect(loadLocal()?.state.elapsedMs).toBe(save.state.elapsedMs);
  await act(() => native.callbacks!.onActiveChange(true));
  await act(() => vi.advanceTimersByTime(60_000));
  expect(native.setAppActive).toHaveBeenLastCalledWith(true);
  expect(loadLocal()?.state.elapsedMs).toBe(save.state.elapsedMs);
  expect(button('Reprendre').getAttribute('aria-pressed')).toBe('true');
  await act(() => button('Reprendre').click());
  await act(() => vi.advanceTimersByTime(1000));
  expect(loadLocal()!.state.elapsedMs).toBeGreaterThan(save.state.elapsedMs);
});

it('opens a cold invitation without replacing the saved local game', async () => {
  const save = saveGame();
  await mount();
  const hash = `#room=${'a'.repeat(32)}&turn=manual&relay=1`;
  await act(async () => {
    native.callbacks!.onInvitation(hash);
    await vi.dynamicImportSettled();
  });
  expect(location.hash).toBe(hash);
  expect(native.lobby?.open).toBe(true);
  expect(native.lobby?.autoCreate).toBe(false);
  expect(loadLocal()?.seed).toBe(save.seed);
});

it('requires an explicit choice before switching an active game to an incoming room', async () => {
  const save = saveGame();
  await mount();
  await resume();
  const hash = `#room=${'a'.repeat(32)}`;
  await act(() => native.callbacks!.onInvitation(hash));
  expect(location.hash).not.toBe(hash);
  expect(document.querySelector('dialog[open]')?.textContent).toContain(
    'Une invitation vous attend',
  );
  await act(() => button('Continuer la partie').click());
  expect(document.querySelector('.game-layout')).not.toBeNull();
  expect(native.lobby).toBeNull();
  await act(() => native.callbacks!.onInvitation(hash));
  await act(async () => {
    button('Ouvrir l’invitation').click();
    await vi.dynamicImportSettled();
  });
  expect(native.lobby?.open).toBe(true);
  expect(location.hash).toBe(hash);
  expect(loadLocal()?.seed).toBe(save.seed);
});

it('does not spend a human decision or game time while the board is still loading', async () => {
  vi.useFakeTimers();
  native.autoReady = false;
  const initial = saveGame();
  await mount();
  await resume();
  await act(() => vi.advanceTimersByTime(60_000));
  expect(loadLocal()?.state).toEqual(initial.state);
  await act(() => native.boardReady!());
  await act(() => vi.advanceTimersByTime(1000));
  expect(loadLocal()?.state.elapsedMs).toBe(1000);
  expect(loadLocal()?.state.phase).toBe(initial.state.phase);
});

it('does not run bots behind the board loader and starts them when the renderer becomes usable', async () => {
  vi.useFakeTimers();
  native.autoReady = false;
  const initial = saveGame(true);
  await mount();
  await resume();
  await act(() => vi.advanceTimersByTime(60_000));
  expect(loadLocal()?.state).toEqual(initial.state);
  await act(() => native.boardReady!());
  await act(() => vi.advanceTimersByTime(650));
  expect(loadLocal()!.state.seq).toBeGreaterThan(initial.state.seq);
  expect(loadLocal()?.state.dice).toHaveLength(2);
});

it('waits for the newly mounted board after returning home and resuming the same game', async () => {
  vi.useFakeTimers();
  native.autoReady = false;
  saveGame();
  await mount();
  await resume();
  await act(() => native.boardReady!());
  await act(() => vi.advanceTimersByTime(1000));
  const before = loadLocal()!.state;
  expect(before.elapsedMs).toBe(1000);
  await act(() => native.callbacks!.onBack());
  await act(() => button('Accueil et sauvegarde').click());
  await resume();
  await act(() => vi.advanceTimersByTime(60_000));
  expect(loadLocal()?.state).toEqual(before);
  await act(() => native.boardReady!());
  await act(() => vi.advanceTimersByTime(1000));
  expect(loadLocal()?.state.elapsedMs).toBe(before.elapsedMs + 1000);
});
