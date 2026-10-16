// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameState } from '@money-tour/engine';
import { loadLocal, newLocal, persistLocal } from '../src/game/local';
import { loadDebug } from '../src/game/debug';
import App from '../src/App';

const scene = vi.hoisted(() => ({ visible: null as GameState | null }));
vi.mock('../src/game/preview', () => ({ previewScenario: () => null }));
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
  localStorage.clear();
  vi.useRealTimers();
});
const button = (text: string) => {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(text),
  );
  expect(found, text).toBeDefined();
  return found!;
};
const click = async (text: string) =>
  act(async () => {
    button(text).click();
    await vi.dynamicImportSettled();
  });
async function mount() {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => {
    root.render(createElement(App));
    await vi.dynamicImportSettled();
  });
}
async function shortcut() {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
    await vi.dynamicImportSettled();
  });
}

it('launches, edits, undoes and resumes a debug scenario without overwriting normal progress', async () => {
  const normal = newLocal({
    players: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob', bot: true },
    ],
  });
  normal.state.players[0]!.cash = 1234;
  persistLocal(normal);
  await mount();
  await click('Mode debug · nouveau');
  expect(document.querySelector('.debug-panel')).not.toBeNull();
  await click('+1\u202f000');
  expect(loadDebug()!.state.players[0]!.cash).toBe(2500);
  await click('Annuler la dernière');
  expect(loadDebug()!.state.players[0]!.cash).toBe(1500);
  await click('+1\u202f000');
  await shortcut();
  expect(document.querySelector('.debug-panel')).toBeNull();
  const elapsed = scene.visible!.elapsedMs;
  await act(() => vi.advanceTimersByTime(60000));
  expect(scene.visible!.elapsedMs).toBe(elapsed);
  expect(loadLocal()).toEqual(normal);
  await act(() =>
    document.querySelector<HTMLButtonElement>('[aria-label="Money Tour, accueil"]')!.click(),
  );
  await click('Accueil et sauvegarde');
  await click('Reprendre mon scénario debug');
  expect(loadDebug()!.state.players[0]!.cash).toBe(2500);
  await shortcut();
  await act(() =>
    document.querySelector<HTMLButtonElement>('[aria-label="Money Tour, accueil"]')!.click(),
  );
  await click('Accueil et sauvegarde');
  await click('Reprendre ma partie');
  expect(scene.visible!.players[0]!.cash).toBe(1234);
  expect(document.querySelector('.debug-toolbar')).toBeNull();
});

it('opens debug from a property decision and keeps frozen bots from advancing after closing', async () => {
  await mount();
  await click('Mode debug · nouveau');
  await click('Cases et dés');
  const select = [...document.querySelectorAll<HTMLSelectElement>('select')].find((s) =>
    s.closest('label')?.textContent?.startsWith('Case'),
  )!;
  await act(() => {
    select.value = '5';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Aller et déclencher');
  expect(scene.visible!.phase).toBe('property');
  expect(document.querySelector('.purchase-offer')).not.toBeNull();
  await click('Debug');
  expect(document.querySelector('.debug-panel')).not.toBeNull();
  const checkbox = document.querySelector<HTMLInputElement>('input[name="bot"]')!;
  await act(() => checkbox.click());
  await click('Appliquer au joueur');
  const seq = loadDebug()!.state.seq;
  await shortcut();
  await act(() => vi.advanceTimersByTime(30000));
  expect(loadDebug()!.state.seq).toBe(seq);
});

it('keeps a saved game until replacing it is explicitly confirmed', async () => {
  const normal = newLocal({
    players: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob', bot: true },
    ],
  });
  normal.state.players[0]!.cash = 1234;
  persistLocal(normal);
  await mount();
  await click('Nouvelle partie sur cet appareil');
  expect(loadLocal()).toEqual(normal);
  await click('Annuler');
  expect(loadLocal()).toEqual(normal);
  await click('Nouvelle partie sur cet appareil');
  await click('Remplacer et commencer');
  expect(loadLocal()!.state.players[0]!.id).toBe('p1');
  expect(loadLocal()!.state.players[0]!.cash).not.toBe(1234);
});
