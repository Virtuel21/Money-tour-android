// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { loadLocal, newLocal, persistLocal } from '../src/game/local';
import App from '../src/App';
import type { SessionView } from '../src/network/session';

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
  history.replaceState(null, '', '/');
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
  expect(tabs.map((tab) => tab.textContent)).toEqual(['Entre amis', 'En ligne', 'Solo & bots']);
  expect(tabs[0]!.getAttribute('aria-pressed')).toBe('true');
  expect(button('Créer un salon en ligne').classList.contains('primary')).toBe(true);
  await click('Créer un salon en ligne');
  expect(document.querySelector('.setup .seat-list')).toBeNull();
  expect(document.querySelector('.setup .setup-options')).toBeNull();
  expect(button('Comment jouer')).toBeUndefined();
  expect(lobby.props).toMatchObject({ autoCreate: true, defaults: { count: 4 } });
  expect(loadLocal()?.seed).toBe(previous.seed);
});

it('configures a local friends game only after choosing to play on this device', async () => {
  await mount();
  expect(button('Jouer sur cet appareil').classList.contains('secondary')).toBe(true);
  await click('Jouer sur cet appareil');
  expect(loadLocal()).toBeNull();
  const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!;
  expect(dialog.querySelector('h2')?.textContent).toBe('Jouer sur cet appareil');
  expect(dialog.querySelectorAll('.seat')).toHaveLength(4);
  const travellers = dialog.querySelector<HTMLSelectElement>('.setup-options select')!;
  await act(() => {
    travellers.value = '2';
    travellers.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(dialog.querySelectorAll('.seat')).toHaveLength(2);
  await click('Lancer la partie');
  const game = loadLocal()!.state;
  expect(game.mode).toBe('free-for-all');
  expect(game.players).toHaveLength(2);
  expect(game.players.every((player) => !player.bot && player.team === undefined)).toBe(true);
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

it.each([
  ['Trouver une partie', 'find'],
  ['Créer un salon public', 'create'],
] as const)('opens %s without changing the saved local game', async (label, publicMode) => {
  const previous = newLocal({
    players: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ],
  });
  persistLocal(previous);
  await mount();
  await click('En ligne');
  expect(document.querySelector('.setup .seat-list')).toBeNull();
  expect(document.querySelector('.setup-note')?.textContent).toContain('joueurs IA');
  await click(label);
  expect(lobby.props).toMatchObject({ publicMode, autoCreate: false, open: true });
  expect(loadLocal()?.seed).toBe(previous.seed);
});

it.each(['local', 'online'])(
  'can start a fresh %s game after returning home from an online game',
  async (target) => {
    await mount();
    await click('Créer un salon en ligne');
    const close = vi.fn();
    const state = newLocal({
      players: [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
      ],
    }).state;
    const view: SessionView = {
      state,
      members: [{ id: 'a', name: 'Alice', key: {}, order: 0 }],
      host: 'a',
      self: 'a',
      connected: ['a'],
      busy: false,
      status: 'Salon prêt',
      incidents: [],
      hash: '',
      epoch: 0,
      events: [],
      blocked: false,
    };
    await act(() => {
      (lobby.props!.onSession as (session: unknown) => void)({ close });
      (lobby.props!.onView as (view: SessionView) => void)(view);
    });
    history.replaceState(null, '', `/#room=${'c'.repeat(32)}`);
    await act(() =>
      document.querySelector<HTMLButtonElement>('[aria-label="Money Tour, accueil"]')!.click(),
    );
    await click('Accueil et sauvegarde');
    const label = target === 'online' ? 'Créer un salon en ligne' : 'Jouer sur cet appareil';
    expect(button(label).disabled).toBe(false);
    await click(label);
    if (target === 'local') await click('Lancer la partie');
    expect(close).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe('');
    if (target === 'online')
      expect(lobby.props).toMatchObject({ autoCreate: true, resume: undefined, open: true });
    else expect(loadLocal()?.state.players).toHaveLength(4);
  },
);

it('uses identity names and keeps the ready button for a public guest controlling a former AI seat', async () => {
  await mount();
  await click('Créer un salon en ligne');
  const readyAdventure = vi.fn();
  const state = newLocal({
    players: [
      { id: 'host', name: 'Alice' },
      { id: 'bot-1', name: 'Nico' },
    ],
  }).state;
  const view: SessionView = {
    state,
    publicGame: true,
    publicJoinStatus: 'joined',
    members: [
      { id: 'host', name: 'Alice', key: {}, order: 0 },
      { id: 'guest-key', name: 'Nico', key: {}, order: 1, seatId: 'bot-1' },
    ],
    startGate: {
      id: 'rematch-gate',
      deadline: Date.now() + 20000,
      participants: ['host', 'guest-key'],
      ready: ['host'],
    },
    host: 'host',
    self: 'bot-1',
    selfIdentity: 'guest-key',
    connected: ['host', 'guest-key'],
    busy: false,
    status: 'Salon prêt',
    incidents: [],
    hash: '',
    epoch: 0,
    events: [],
    blocked: false,
  };
  await act(() => {
    (lobby.props!.onSession as (session: unknown) => void)({ close: vi.fn(), readyAdventure });
    (lobby.props!.onView as (view: SessionView) => void)(view);
  });
  const introduction = document.querySelector<HTMLDialogElement>('.adventure-start[open]')!;
  expect(
    [...introduction.querySelectorAll('.adventure-start-players li > span:first-child')].map(
      (element) => element.textContent,
    ),
  ).toEqual(['Alice', 'Nico']);
  expect(introduction.textContent).not.toContain('guest-key');
  expect(button('Démarrer l’aventure').disabled).toBe(false);
  await click('Démarrer l’aventure');
  expect(readyAdventure).toHaveBeenCalledTimes(1);
});
