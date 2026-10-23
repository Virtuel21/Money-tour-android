// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { loadLocal, newLocal, persistLocal } from '../src/game/local';
import App from '../src/App';

const lobby = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock('../src/game/preview', () => ({ previewScenario: () => null }));
vi.mock('../src/board/Board3D', () => ({ default: () => null }));
vi.mock('../src/network/OnlineLobby', () => ({
  default: (props: Record<string, unknown>) => {
    lobby.props = props;
    return null;
  },
}));
vi.mock('../src/audio/synth', () => ({
  loadAudio: () => ({ music: false, effects: false, volume: 0 }),
  Soundscape: class {
    configure() {}
    setScene() {}
    close() {}
    stopEffects() {}
    effect() {}
    async unlock() {}
  },
}));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root: Root;
afterEach(async () => {
  await act(() => root?.unmount());
  document.body.innerHTML = '';
  localStorage.clear();
  lobby.props = null;
});
async function mount() {
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
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((element) =>
    element.textContent?.trim().startsWith(text),
  )!;
async function click(text: string) {
  await act(async () => {
    button(text).click();
    await vi.dynamicImportSettled();
  });
}

it('opens a free-for-all room from the default friends CTA without overwriting a local game', async () => {
  const previous = newLocal({
    players: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ],
  });
  persistLocal(previous);
  await mount();
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.mode-tabs button')];
  expect(tabs.map((tab) => tab.textContent)).toEqual(['Entre amis', '2v2', 'Solo & bots']);
  expect(tabs[0]!.getAttribute('aria-pressed')).toBe('true');
  expect(button('Créer un salon en ligne').classList.contains('primary')).toBe(true);
  await click('Créer un salon en ligne');
  expect(lobby.props).toMatchObject({ autoCreate: true, defaults: { teams: false, count: 4 } });
  expect(loadLocal()?.seed).toBe(previous.seed);
});

it('creates an online team room from the main CTA and keeps local 2v2 available', async () => {
  await mount();
  await click('2v2');
  expect(button('Créer un salon en ligne').classList.contains('primary')).toBe(true);
  expect(button('Jouer sur cet appareil').classList.contains('secondary')).toBe(true);
  await click('Créer un salon en ligne');
  expect(lobby.props).toMatchObject({ defaults: { teams: true, count: 4 } });
  await act(() => (lobby.props!.onClose as () => void)());
  await click('Jouer sur cet appareil');
  const game = loadLocal()!.state;
  expect(game.mode).toBe('teams');
  expect(game.players.map((player) => player.team)).toEqual([0, 1, 0, 1]);
  expect(game.players.every((player) => !player.bot)).toBe(true);
});

it('makes local play primary only in solo and starts with the selected bots', async () => {
  await mount();
  await click('Solo & bots');
  expect(button('Jouer sur cet appareil').classList.contains('primary')).toBe(true);
  expect(button('Créer un salon en ligne').classList.contains('secondary')).toBe(true);
  await click('Jouer sur cet appareil');
  expect(loadLocal()!.state.players.map((player) => !!player.bot)).toEqual([
    false,
    true,
    true,
    true,
  ]);
});
