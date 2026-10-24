// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  config,
  createGame,
  getBuyoutQuote,
  getRent,
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
  default: ({
    state,
    onTile,
    choices = [],
    selecting = false,
  }: {
    state: GameState;
    onTile: (id: number) => void;
    choices?: number[];
    selecting?: boolean;
  }) =>
    createElement(
      'div',
      { 'data-testid': 'board', 'data-choices': choices.join(','), 'data-selecting': selecting },
      createElement('button', {
        'aria-label': 'Inspecter une escale spéciale',
        onClick: () => onTile(16),
      }),
      ...state.config.board.map((tile) =>
        createElement(
          'button',
          {
            key: tile.id,
            'data-board-tile': tile.id,
            'aria-label': `${choices.includes(tile.id) ? 'Choisir' : 'Voir'} ${tile.name}`,
            onClick: () => onTile(tile.id),
          },
          tile.name,
        ),
      ),
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
async function clickBoard(id: number) {
  const tile = host.querySelector<HTMLButtonElement>(`[data-board-tile="${id}"]`);
  expect(tile).not.toBeNull();
  await act(() => tile!.click());
}
async function minimizeDebt() {
  const minimize = card().querySelector<HTMLButtonElement>(
    '[aria-label="Réduire pour voir le plateau"]',
  );
  expect(minimize).not.toBeNull();
  await act(() => minimize!.click());
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
  expect(host.querySelector('.game-sidebar .action-card')?.hasAttribute('hidden')).toBe(true);
  await expectDeferred('Quitter l’île', 'pay_bail');
  expect(scene.latest!.players[0]!.islandTurns).toBeNull();
  expect(scene.latest!.players[0]!.cash).toBe(cash - state.config.islandFee);
});

it.each([false, true])(
  'chooses a Festival property directly on the board (mobile=%s)',
  async (mobile) => {
    const state = game();
    state.phase = 'championship';
    state.players[0]!.position = state.config.board.find(
      (tile) => tile.type === 'championship',
    )!.id;
    const cash = state.players[0]!.cash;
    await mount(state, mobile);
    expect(host.querySelector('.action-card-dialog')).toBeNull();
    expect(host.querySelector('.mondial-picker')).toBeNull();
    expect(host.querySelector('.mobile-tile-list')).toBeNull();
    await clickBoard(9);
    expect(scene.actions).toEqual([]);
    expect(host.querySelector('dialog')).toBeNull();
    await clickBoard(1);
    expect(scene.actions.map((action) => action.type)).toEqual(['place_championship']);
    expect(scene.latest!.properties[1]).toMatchObject({
      ownerId: 'a',
      championships: 1,
      championshipTurns: state.config.championshipDuration,
    });
    expect(scene.latest!.players[0]!.cash).toBe(cash - state.config.championshipFee);
  },
);

it.each(['championship', 'travel'] as const)(
  'inspects a side-panel property without confirming the %s board choice',
  async (phase) => {
    const state = game();
    state.phase = phase;
    state.players[0]!.position = phase === 'travel' ? 24 : 16;
    if (phase === 'travel') state.players[0]!.travelPending = true;
    const cash = state.players[0]!.cash;
    const position = state.players[0]!.position;
    await mount(state);
    const preview = host.querySelector<HTMLButtonElement>('.player-property-preview-item');
    expect(preview).not.toBeNull();
    await act(() => preview!.click());
    const details = host.querySelector<HTMLDialogElement>('dialog[open]');
    expect(details).not.toBeNull();
    expect(details!.textContent).toContain(state.config.board[1]!.name);
    expect(scene.actions).toEqual([]);
    expect(scene.latest!.phase).toBe(phase);
    expect(scene.latest!.players[0]!.cash).toBe(cash);
    expect(scene.latest!.players[0]!.position).toBe(position);
    await click('Retour au plateau', details!);
    await finishDeparture();
    expect(host.querySelector('dialog')).toBeNull();
    expect(scene.actions).toEqual([]);
  },
);

it.each(['funds', 'property'] as const)(
  'keeps the Festival decline available without enough %s',
  async (missing) => {
    const state = game();
    state.phase = 'championship';
    if (missing === 'funds') state.players[0]!.cash = state.config.championshipFee - 1;
    else {
      state.properties[1]!.ownerId = null;
      state.properties[2]!.ownerId = null;
    }
    const cash = state.players[0]!.cash;
    await mount(state);
    expect(host.querySelector('.action-card-dialog')).toBeNull();
    expect(host.querySelector('[data-testid="board"]')?.getAttribute('data-choices')).toBe('');
    expect(host.querySelector('.game-sidebar .board-choice-hint')?.textContent).toContain(
      missing === 'funds' ? 'Il vous faut' : 'Achetez d’abord',
    );
    await click('Ne pas organiser le Festival');
    expect(scene.actions.at(-1)?.type).toBe('finish');
    expect(scene.latest!.phase).not.toBe('championship');
    expect(scene.latest!.players[0]!.cash).toBe(cash);
  },
);

it.each([false, true])(
  'picks a travel destination directly on the board (mobile=%s)',
  async (mobile) => {
    const state = game();
    state.phase = 'travel';
    state.players[0]!.position = 24;
    state.players[0]!.travelPending = true;
    state.extraRoll = true;
    await mount(state, mobile);
    expect(host.querySelector('.action-card-dialog')).toBeNull();
    expect(host.querySelector('.travel-destination')).toBeNull();
    await clickBoard(0);
    expect(scene.actions.map((action) => action.type)).toEqual(['travel']);
    expect(scene.latest!.players[0]!.position).toBe(0);
    expect(scene.latest!.players[0]!.travelPending).toBe(false);
    expect(scene.latest!.extraRoll).toBe(false);
  },
);

it.each([false, true])(
  'travels to a rival property and completes its buyout in the real interface (mobile=%s)',
  async (mobile) => {
    const state = game();
    state.phase = 'travel';
    state.players[0]!.position = 8;
    state.players[0]!.travelPending = true;
    state.properties[9]!.level = 1;
    const alice = state.players[0]!.cash,
      bob = state.players[1]!.cash;
    const rent = getRent(state, 9);
    await mount(state, mobile);
    await clickBoard(9);
    expect(scene.latest!.phase).toBe('property');
    const quote = getBuyoutQuote(scene.latest!)!;
    expect(quote.canBuy).toBe(true);
    await settle();
    await click('Racheter');
    expect(host.querySelector('.purchase-offer')?.textContent).toContain('RACHETER CETTE VILLE');
    await click('Racheter', host.querySelector('.purchase-offer')!);
    expect(scene.latest!.properties[9]).toMatchObject({ ownerId: 'a', level: 1 });
    expect(scene.latest!.players[0]!.cash).toBe(
      alice - state.config.travelFee - rent - quote.total,
    );
    expect(scene.latest!.players[1]!.cash).toBe(bob + rent + quote.land);
    expect(scene.actions.map((action) => action.type)).toEqual(['travel', 'buyout']);
  },
);

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
    expect(host.querySelector('.passive-insurance-notice')?.textContent).toContain(
      'Cette propriété est maintenant assurée.',
    );
    expect(host.querySelector('.action-card-dialog')).toBeNull();
    expect(button('Lancer les dés').disabled).toBe(false);
    await click('Lancer les dés');
    expect(scene.actions.at(-1)?.type).toBe('roll');
    expect(host.querySelector('.passive-insurance-notice')).not.toBeNull();
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

it.each([
  ['roulette', false],
  ['roulette', true],
  ['slots', false],
  ['slots', true],
] as const)(
  'keeps one casino card through %s play and result (mobile=%s)',
  async (casino, mobile) => {
    const state = game();
    state.phase = 'casino';
    state.players[0]!.position = 7;
    state.casino = { tile: 7, game: casino, chance: 50 };
    await mount(state, mobile);
    const dialog = card();
    const motion = dialog.querySelector('.drawn-card-motion');
    const play = button(casino === 'roulette' ? 'Choisir rouge' : 'Lancer les rouleaux', dialog);
    await act(() => {
      play.click();
      play.click();
    });
    expect(scene.actions.map((action) => action.type)).toEqual([
      casino === 'roulette' ? 'casino_red' : 'casino_spin',
    ]);
    expect(scene.latest!.phase).toBe('end');
    expect(card()).toBe(dialog);
    expect(card().querySelector('.drawn-card-motion')).toBe(motion);
    expect(dialog.classList.contains('is-leaving')).toBe(false);
    expect(dialog.querySelector('.casino-playing')).not.toBeNull();
    expect(dialog.querySelector('.casino-revealed')).toBeNull();
    expect(dialog.querySelector('.casino-card-actions')).toBeNull();
    await act(() => vi.advanceTimersByTime(1900));
    expect(card()).toBe(dialog);
    expect(dialog.querySelector('.casino-revealed')).not.toBeNull();
    await click('Passer l’animation', dialog);
    expect(dialog.classList.contains('is-leaving')).toBe(true);
    await finishDeparture();
    expect(host.querySelector('.action-card-dialog')).toBeNull();
    expect(scene.actions).toHaveLength(1);
  },
);

it('still animates the departure when the player skips the casino', async () => {
  const state = game();
  state.phase = 'casino';
  state.players[0]!.position = 7;
  state.casino = { tile: 7, game: 'roulette', chance: 50 };
  await mount(state);
  await expectDeferred('Passer mon tour au casino', 'finish');
  expect(host.querySelector('.casino-playing')).toBeNull();
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

it.each([false, true])(
  'minimizes debt across ticks and property inspection without selling (mobile=%s)',
  async (mobile) => {
    const state = game();
    state.phase = 'debt';
    state.players[0]!.cash = 0;
    state.debt = {
      playerId: 'a',
      creditorId: 'b',
      amount: Math.floor(
        (getPropertyValue(state, 1) + getPropertyValue(state, 2)) * state.config.resaleRate,
      ),
      reason: 'rent',
      continuation: 'end',
    };
    window.history.replaceState(null, '', '?clock=1');
    await mount(state, mobile);
    expect(host.querySelector('.game-sidebar .action-card')?.hasAttribute('hidden')).toBe(true);
    await minimizeDebt();
    expect(host.querySelector('.action-card-dialog')).toBeNull();
    expect(scene.actions).toEqual([]);
    const resume = button('Reprendre la vente');
    expect(document.activeElement).toBe(resume);
    expect(host.querySelector('[data-testid="board"]')?.getAttribute('data-choices')).toBe('');
    expect(host.querySelector('[data-testid="board"]')?.getAttribute('data-selecting')).toBe(
      'false',
    );
    expect(host.querySelector('.game-sidebar .action-card')?.hasAttribute('hidden')).toBe(false);
    await act(() => vi.advanceTimersByTime(1000));
    expect(scene.latest!.phase).toBe('debt');
    expect(host.querySelector('.action-card-dialog')).toBeNull();
    expect(scene.actions.map((action) => action.type)).toEqual(['tick']);
    await clickBoard(1);
    const details = host.querySelector<HTMLDialogElement>('dialog[open]')!;
    expect(details.textContent).toContain(state.config.board[1]!.name);
    expect(details.textContent).not.toContain('Réglons cette dette ensemble');
    expect(scene.latest!.properties[1]!.ownerId).toBe('a');
    expect(scene.latest!.players[0]!.cash).toBe(0);
    await click('Retour au plateau', details);
    expect(host.querySelector('dialog[open]')).toBeNull();
    expect(document.activeElement).toBe(resume);
    await click('Reprendre la vente');
    expect(card().textContent).toContain('Réglons cette dette ensemble');
    expect(card().textContent).toContain(state.config.board[1]!.name);
    expect(card().textContent).toContain(state.config.board[2]!.name);
    expect(scene.actions.every((action) => action.type === 'tick')).toBe(true);
  },
);

it.each([false, true])(
  'keeps one duel card through offers, stakes, a tie and the final result (mobile=%s)',
  async (mobile) => {
    const state = game();
    state.phase = 'duel';
    state.duel = {
      id: 'action-card-duel',
      challengerId: 'a',
      amount: 0,
      stage: 'offer',
      escrow: false,
      commitments: {},
      reveals: {},
    };
    await mount(state, mobile);
    const dialog = card();
    const motion = dialog.querySelector('.drawn-card-motion');
    await click('Défier Bob', dialog);
    expect(scene.latest!.duel!.stage).toBe('accept');
    expect(card()).toBe(dialog);
    expect(dialog.classList.contains('is-leaving')).toBe(false);
    await click('Accepter et miser', dialog);
    expect(scene.latest!.duel!.stage).toBe('commit');
    expect(card()).toBe(dialog);
    await settle();
    expect(card()).toBe(dialog);
    await click('Pierre', dialog);
    expect(scene.latest!.duel!.stage).toBe('commit');
    await click('Pierre', dialog);
    expect(scene.latest!.duel!.round).toBe(2);
    expect(card()).toBe(dialog);
    expect(dialog.classList.contains('is-leaving')).toBe(false);
    expect(dialog.textContent).toContain('Égalité');
    await click('Manche suivante', dialog);
    await act(() => vi.advanceTimersByTime(100));
    await click('Pierre', dialog);
    await click('Ciseaux', dialog);
    expect(scene.latest!.duel).toBeUndefined();
    expect(scene.latest!.phase).toBe('end');
    expect(card()).toBe(dialog);
    expect(dialog.querySelector('.drawn-card-motion')).toBe(motion);
    expect(dialog.textContent).toContain('Alice remporte le duel');
    expect(host.querySelectorAll('.action-card-dialog')).toHaveLength(1);
    await click('Continuer', dialog);
    expect(dialog.classList.contains('is-leaving')).toBe(true);
    await finishDeparture();
    expect(host.querySelector('.action-card-dialog')).toBeNull();
  },
);

it.each(['Passer ce duel', 'Refuser le duel'])(
  'departs only once when declining a duel with %s',
  async (choice) => {
    const state = game();
    state.phase = 'duel';
    state.duel = {
      id: 'cancel-once',
      challengerId: 'a',
      amount: 0,
      stage: 'offer',
      escrow: false,
      commitments: {},
      reveals: {},
    };
    await mount(state);
    const dialog = card();
    if (choice === 'Refuser le duel') {
      await click('Défier Bob', dialog);
      expect(card()).toBe(dialog);
    }
    await expectDeferred(choice, choice === 'Passer ce duel' ? 'duel_cancel' : 'duel_decline');
    expect(scene.latest!.duel).toBeUndefined();
    expect(host.querySelector('.action-card-dialog')).toBeNull();
    expect(host.querySelector('.passive-duel-notice')?.textContent).toContain('Duel annulé');
    expect(button('Fin du tour').disabled).toBe(false);
    await settle();
    expect(host.querySelector('.action-card-dialog')).toBeNull();
  },
);

it('automatically animates the same duel card out when its result reading time expires', async () => {
  const state = game();
  state.phase = 'duel';
  state.duel = {
    id: 'auto-exit',
    challengerId: 'a',
    targetId: 'b',
    amount: 50,
    stage: 'commit',
    escrow: true,
    commitments: {},
    reveals: {},
  };
  await mount(state);
  const dialog = card();
  await click('Pierre', dialog);
  await click('Ciseaux', dialog);
  expect(scene.latest!.duel).toBeUndefined();
  expect(card()).toBe(dialog);
  expect(dialog.classList.contains('is-leaving')).toBe(false);
  await settle();
  expect(card()).toBe(dialog);
  expect(dialog.classList.contains('is-leaving')).toBe(true);
  await finishDeparture();
  expect(host.querySelector('.action-card-dialog')).toBeNull();
});

it('cancels an outgoing island choice if its decision expires before the card leaves', async () => {
  const state = game();
  state.phase = 'island';
  state.players[0]!.position = state.config.board.find((tile) => tile.type === 'island')!.id;
  state.players[0]!.islandTurns = 1;
  state.decisionElapsedMs = state.config.actionTimeoutMs - 1000;
  window.history.replaceState(null, '', '?clock=1');
  await mount(state);
  await act(() => vi.advanceTimersByTime(500));
  await click('Quitter l’île', card());
  expect(scene.actions).toEqual([]);
  // The next game tick expires this turn halfway through the departure animation.
  await act(() => vi.advanceTimersByTime(500));
  expect(scene.actions.map((action) => action.type)).toContain('tick');
  expect(scene.latest!.phase).not.toBe('island');
  const cashAfterTimeout = scene.latest!.players[0]!.cash;
  await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
  expect(scene.actions.some((action) => action.type === 'pay_bail')).toBe(false);
  expect(scene.latest!.players[0]!.cash).toBe(cashAfterTimeout);
});

it('preserves the direct Festival payment and journal when its click and the next tick share one React batch', async () => {
  const state = game();
  state.phase = 'championship';
  const cash = state.players[0]!.cash;
  window.history.replaceState(null, '', '?clock=1');
  await mount(state);
  await act(() => {
    host.querySelector<HTMLButtonElement>('[data-board-tile="1"]')!.click();
    vi.advanceTimersByTime(1000);
  });
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
