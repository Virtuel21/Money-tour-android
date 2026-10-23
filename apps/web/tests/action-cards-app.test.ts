// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  config,
  createGame,
  getPropertyValue,
  type GameAction,
  type GameState,
} from '@money-tour/engine';
import { DRAWN_CARD_EXIT_MS } from '../src/game/DrawnCard';
import App from '../src/App';

const scene = vi.hoisted(() => ({
  initial: null as GameState | null,
  latest: null as GameState | null,
  actions: [] as GameAction[],
}));
vi.mock('../src/game/preview', () => ({
  previewScenario: () => ({ version: 1, seed: 'action-cards-app', state: scene.initial }),
}));
vi.mock('../src/game/local', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/local')>();
  return {
    ...actual,
    applyLocal: (...args: Parameters<typeof actual.applyLocal>) => {
      scene.actions.push(args[1]);
      const result = actual.applyLocal(...args);
      scene.latest = result.save.state;
      return result;
    },
  };
});
vi.mock('../src/board/Board3D', () => ({
  default: ({ onTile }: { onTile: (id: number) => void }) =>
    createElement('button', {
      'aria-label': 'Inspecter une escale spéciale',
      onClick: () => onTile(16),
    }),
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

let root: Root | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  scene.actions = [];
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function game() {
  const state = createGame({
    config: { ...config, shuffleStreets: false, festivalCount: 0, adventures: false },
    players: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ],
  });
  state.properties[1]!.ownerId = 'a';
  state.properties[2]!.ownerId = 'a';
  state.properties[9]!.ownerId = 'b';
  return state;
}
async function mount(state: GameState, mobile = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width') ? mobile : false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  scene.initial = scene.latest = state;
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(App));
    await vi.dynamicImportSettled();
  });
}
function card() {
  const dialog = host.querySelector<HTMLDialogElement>('.action-card-dialog');
  expect(dialog, 'the current game action has a physical card').not.toBeNull();
  expect(dialog!.open).toBe(true);
  return dialog!;
}
function button(text: string, scope: ParentNode = host) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  expect(found, `button containing ${text}`).toBeDefined();
  return found!;
}
async function click(text: string, scope: ParentNode = host) {
  await act(() => button(text, scope).click());
}
async function finishDeparture() {
  await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
}
async function settle() {
  await act(() => vi.advanceTimersByTime(20000));
}
async function expectDeferred(text: string, type: GameAction['type']) {
  const count = scene.actions.length;
  const dialog = card();
  await click(text, dialog);
  expect(dialog.classList.contains('is-leaving')).toBe(true);
  expect(scene.actions).toHaveLength(count);
  await act(() => vi.advanceTimersByTime(100));
  expect(scene.actions).toHaveLength(count);
  await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS - 100));
  expect(scene.actions.slice(count).map((action) => action.type)).toEqual([type]);
}

it.each([false, true])('leaves the island through an animated card (mobile=%s)', async (mobile) => {
  const state = game();
  state.phase = 'island';
  state.players[0]!.position = state.config.board.find((tile) => tile.type === 'island')!.id;
  state.players[0]!.islandTurns = 1;
  const cash = state.players[0]!.cash;
  await mount(state, mobile);
  await expectDeferred('Quitter l’île', 'pay_bail');
  expect(scene.latest!.players[0]!.islandTurns).toBeNull();
  expect(scene.latest!.players[0]!.cash).toBe(cash - state.config.islandFee);
});

it.each([false, true])('chooses a Festival property from its card (mobile=%s)', async (mobile) => {
  const state = game();
  state.phase = 'championship';
  state.players[0]!.position = state.config.board.find((tile) => tile.type === 'championship')!.id;
  const cash = state.players[0]!.cash;
  await mount(state, mobile);
  await expectDeferred(state.config.board[1]!.name, 'place_championship');
  expect(scene.latest!.properties[1]).toMatchObject({
    ownerId: 'a',
    championships: 1,
    championshipTurns: state.config.championshipDuration,
  });
  expect(scene.latest!.players[0]!.cash).toBe(cash - state.config.championshipFee);
});

it.each([false, true])('picks a travel destination from a card (mobile=%s)', async (mobile) => {
  const state = game();
  state.phase = 'travel';
  state.players[0]!.position = 24;
  state.players[0]!.travelPending = true;
  state.extraRoll = true;
  await mount(state, mobile);
  await click('Choisir ma destination');
  await expectDeferred('Départ', 'travel');
  expect(scene.latest!.players[0]!.position).toBe(0);
  expect(scene.latest!.players[0]!.travelPending).toBe(false);
  expect(scene.latest!.extraRoll).toBe(false);
});

it.each([false, true])(
  'places an insurance token from a card without consuming the turn (mobile=%s)',
  async (mobile) => {
    const state = game();
    state.players[0]!.insurance = { tile: null };
    await mount(state, mobile);
    expect(host.querySelector('.action-card-dialog')).toBeNull();
    await click('Choisir un bien à assurer');
    await expectDeferred(state.config.board[1]!.name, 'insure');
    expect(scene.latest!.players[0]!.insurance).toEqual({ tile: 1 });
    expect(scene.latest!.phase).toBe('roll');
    expect(scene.latest!.currentPlayer).toBe(0);
  },
);

it('animates an attack decision and applies exactly its selected target', async () => {
  const state = game();
  state.phase = 'attack';
  state.pendingAttack = state.config.cards.find((chance) => chance.effect === 'expropriate')!.id;
  await mount(state);
  await expectDeferred(state.config.board[9]!.name, 'attack');
  expect(scene.latest!.properties[9]!.ownerId).toBeNull();
  expect(scene.latest!.properties[1]!.ownerId).toBe('a');
  expect(scene.latest!.pendingAttack).toBeUndefined();
});

it('animates the alliance choice before creating the deal', async () => {
  const state = game();
  state.phase = 'alliance';
  await mount(state);
  await expectDeferred('Choisir Bob', 'alliance');
  expect(scene.latest!.alliance).toEqual({ beneficiaryId: 'a', targetId: 'b' });
});

it('keeps both the casino choice and the result inside physical cards', async () => {
  const state = game();
  state.phase = 'casino';
  state.players[0]!.position = 7;
  state.casino = { tile: 7, game: 'roulette', chance: 50 };
  await mount(state);
  await expectDeferred('Choisir rouge', 'casino_red');
  expect(card().querySelector('.casino-playing')).not.toBeNull();
  expect(scene.latest!.phase).toBe('end');
});

it('animates use of Squatteur while keeping the rent and held-card rules intact', async () => {
  const state = game();
  state.phase = 'rent';
  state.players[0]!.position = 9;
  const squatter = state.config.cards.find((chance) => chance.effect === 'squatter')!.id;
  state.players[0]!.heldCards = [squatter];
  state.pendingRent = { tile: 9, amount: 80, creditorId: 'b' };
  const cash = state.players[0]!.cash;
  await mount(state);
  await expectDeferred('Utiliser Squatteur', 'use_squatter');
  expect(scene.latest!.players[0]!.cash).toBe(cash);
  expect(scene.latest!.players[0]!.heldCards).not.toContain(squatter);
  expect(scene.latest!.pendingRent).toBeUndefined();
});

it.each([false, true])(
  'allows successive debt sales after the first card has left (mobile=%s)',
  async (mobile) => {
    const state = game();
    const value = (tile: number) =>
      Math.floor(getPropertyValue(state, tile) * state.config.resaleRate);
    state.phase = 'debt';
    state.players[0]!.cash = 0;
    state.debt = {
      playerId: 'a',
      creditorId: 'b',
      amount: value(1) + value(2),
      reason: 'rent',
      continuation: 'end',
    };
    await mount(state, mobile);
    await expectDeferred(state.config.board[1]!.name, 'sell');
    expect(scene.latest!.phase).toBe('debt');
    await settle();
    await expectDeferred(state.config.board[2]!.name, 'sell');
    expect(scene.latest!.phase).toBe('end');
    expect(scene.latest!.debt).toBeNull();
    expect(scene.latest!.properties[1]!.ownerId).toBeNull();
    expect(scene.latest!.properties[2]!.ownerId).toBeNull();
  },
);

it('animates user duel choices while revealing both secrets automatically', async () => {
  const state = game();
  state.phase = 'duel';
  state.duel = {
    id: 'action-card-duel',
    challengerId: 'a',
    targetId: 'b',
    amount: 50,
    stage: 'commit',
    escrow: true,
    commitments: {},
    reveals: {},
  };
  await mount(state);
  await expectDeferred('Pierre', 'duel_commit');
  expect(scene.latest!.duel!.stage).toBe('commit');
  await click('Ciseaux', card());
  expect(scene.actions.map((action) => action.type)).toEqual(['duel_commit']);
  await finishDeparture();
  expect(scene.actions.map((action) => action.type)).toEqual([
    'duel_commit',
    'duel_commit',
    'duel_reveal',
    'duel_reveal',
  ]);
  expect(scene.latest!.duel).toBeUndefined();
  expect(scene.latest!.phase).toBe('end');
});

it('cancels an outgoing Festival choice if its decision expires before the card leaves', async () => {
  const state = game();
  state.phase = 'championship';
  state.decisionElapsedMs = state.config.actionTimeoutMs - 1000;
  window.history.replaceState(null, '', '?clock=1');
  await mount(state);
  await act(() => vi.advanceTimersByTime(500));
  await click(state.config.board[1]!.name, card());
  expect(scene.actions).toEqual([]);
  // The next game tick expires this turn halfway through the departure animation.
  await act(() => vi.advanceTimersByTime(500));
  expect(scene.actions.map((action) => action.type)).toContain('tick');
  expect(scene.latest!.currentPlayer).toBe(1);
  await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
  expect(scene.actions.some((action) => action.type === 'place_championship')).toBe(false);
  expect(scene.latest!.properties[1]!.championships).toBe(0);
});

it('preserves the Festival payment and journal when its departure and the next tick share one React batch', async () => {
  const state = game();
  state.phase = 'championship';
  const cash = state.players[0]!.cash;
  window.history.replaceState(null, '', '?clock=1');
  await mount(state);
  await click(state.config.board[1]!.name, card());
  // One batch deliberately runs both the 800 ms departure and the 1 s game tick.
  await act(() => vi.advanceTimersByTime(1000));
  expect(scene.actions.map((action) => action.type)).toEqual(['place_championship', 'tick']);
  expect(scene.latest!.properties[1]!.championships).toBe(1);
  expect(scene.latest!.players[0]!.cash).toBe(cash - state.config.championshipFee);
  expect(host.querySelector('.live-actions')!.textContent?.toLowerCase()).toContain(
    'organise un festival',
  );
});

it('closes an insurance picker when its owner’s turn expires without applying the pending choice', async () => {
  const state = game();
  state.phase = 'end';
  state.players[0]!.insurance = { tile: null };
  state.decisionElapsedMs = state.config.actionTimeoutMs - 1000;
  window.history.replaceState(null, '', '?clock=1');
  await mount(state);
  await act(() => vi.advanceTimersByTime(500));
  await click('Choisir un bien à assurer');
  await click(state.config.board[1]!.name, card());
  await act(() => vi.advanceTimersByTime(500));
  expect(scene.latest!.currentPlayer).toBe(1);
  expect(host.querySelector('.action-card-dialog')).toBeNull();
  await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
  expect(scene.actions.some((action) => action.type === 'insure')).toBe(false);
  expect(scene.latest!.players[0]!.insurance).toEqual({ tile: null });
});

it('inspects a special tile through a physical card and returns without taking a game action', async () => {
  await mount(game());
  await act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="Inspecter une escale spéciale"]')!.click(),
  );
  expect(card().textContent).toContain('Festival');
  await click('Retour au plateau', card());
  expect(scene.actions).toEqual([]);
  await finishDeparture();
  expect(host.querySelector('dialog')).toBeNull();
  expect(scene.actions).toEqual([]);
});

it.each([false, true])(
  'keeps property purchases in their existing dialog with an unused insurance token (owned=%s)',
  async (owned) => {
    const state = game();
    state.phase = 'property';
    state.players[0]!.position = 5;
    state.players[0]!.insurance = { tile: null };
    if (owned) state.properties[5]!.ownerId = 'a';
    await mount(state);
    expect(host.querySelector('.purchase-offer')).not.toBeNull();
    expect(host.querySelector('.action-card-dialog')).toBeNull();
    expect(scene.actions).toEqual([]);
  },
);
