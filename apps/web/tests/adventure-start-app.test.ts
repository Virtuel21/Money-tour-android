// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type GameState } from '@money-tour/engine';
import { newLocal, applyLocal, persistLocal, type LocalSave } from '../src/game/local';
import { prepareLocalAdventure } from '../src/game/adventureIntro';
import { DRAWN_CARD_EXIT_MS } from '../src/game/DrawnCard';
import App from '../src/App';

const scene = vi.hoisted(() => ({ visible: null as GameState | null }));
vi.mock('../src/game/preview', () => ({ previewScenario: () => undefined }));
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

let root: Root | undefined;
const saved = () => JSON.parse(localStorage.getItem('money-tour.local.v17')!) as LocalSave;
const introduction = () => document.querySelector<HTMLDialogElement>('dialog.adventure-start');
const button = (label: string) => {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  expect(found, label).toBeDefined();
  return found!;
};
const click = (label: string) => act(() => button(label).click());
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

async function mount() {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => {
    root!.render(createElement(App));
    await vi.dynamicImportSettled();
  });
}

async function unmount() {
  await act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
}

function existingSave() {
  return newLocal({
    players: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
  });
}

describe('adventure introduction in the actual app', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    scene.visible = null;
  });
  afterEach(async () => {
    await unmount();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('introduces a fresh solo game and releases it on the explicit start button', async () => {
    await mount();
    await click('Solo & bots');
    await click('Jouer sur cet appareil');
    expect(introduction()?.open).toBe(true);
    expect(introduction()?.querySelector('.adventure-start-rule')?.textContent).toContain(
      'Complétez un côté du plateau ou trois rues',
    );
    expect(saved().adventureStartDeadline).toBe(Date.now() + 20_000);
    const before = saved().state;
    await advance(1500);
    expect(saved().state).toEqual(before);
    await click('Démarrer l’aventure');
    expect(introduction()).toBeNull();
    expect(saved().adventureStartDeadline).toBeUndefined();
    await advance(1000);
    expect(saved().state.seq).toBeGreaterThan(before.seq);
  });

  it('freezes every bot, the game clock and decisions until the 20 second automatic start', async () => {
    await mount();
    await click('Solo & bots');
    const firstSeat = document.querySelector<HTMLSelectElement>('[aria-label="Type du joueur 1"]')!;
    await act(() => {
      firstSeat.value = 'bot';
      firstSeat.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('Jouer sur cet appareil');
    const before = saved().state;
    expect(before.players.every((player) => player.bot)).toBe(true);
    expect(document.querySelector('.game-tools .clock')?.textContent).toContain('20:00');
    await advance(19_999);
    expect(introduction()).not.toBeNull();
    expect(saved().state).toEqual(before);
    expect(document.querySelector('.game-tools .clock')?.textContent).toContain('20:00');
    await advance(1);
    expect(introduction()).toBeNull();
    expect(saved().adventureStartDeadline).toBeUndefined();
    await advance(650);
    expect(saved().state.seq).toBeGreaterThan(before.seq);
    expect(saved().state.dice).toHaveLength(2);
  });

  it('blocks a game action and Escape while the introduction is waiting', async () => {
    const initial = prepareLocalAdventure(existingSave());
    persistLocal(initial);
    await mount();
    await click('Reprendre ma partie');
    const roll = button('Lancer les dés');
    expect(roll.disabled).toBe(true);
    await act(() => roll.click());
    const cancel = new Event('cancel', { cancelable: true });
    await act(() => introduction()!.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(introduction()).not.toBeNull();
    expect(saved().state).toEqual(initial.state);
  });

  it('resumes an existing save without introducing its rules again', async () => {
    const initial = existingSave();
    persistLocal(initial);
    await mount();
    await click('Reprendre ma partie');
    expect(introduction()).toBeNull();
    expect(button('Lancer les dés').disabled).toBe(false);
    expect(scene.visible).toEqual(initial.state);
    await advance(1000);
    expect(saved().state.elapsedMs).toBe(1000);
  });

  it('preserves the original deadline through a reload instead of starting another 20 seconds', async () => {
    persistLocal(prepareLocalAdventure(existingSave()));
    await mount();
    await click('Reprendre ma partie');
    const deadline = saved().adventureStartDeadline;
    await advance(7000);
    await unmount();
    await mount();
    await click('Reprendre ma partie');
    expect(saved().adventureStartDeadline).toBe(deadline);
    expect(introduction()?.querySelector('[role="timer"]')?.textContent).toContain('13 s');
    await advance(12_999);
    expect(introduction()).not.toBeNull();
    await advance(1);
    expect(introduction()).toBeNull();
    expect(saved().adventureStartDeadline).toBeUndefined();
  });

  it('immediately releases an introduction whose persisted deadline already elapsed', async () => {
    persistLocal(prepareLocalAdventure(existingSave(), Date.now() - 25_000));
    await mount();
    await click('Reprendre ma partie');
    await advance(0);
    expect(introduction()).toBeNull();
    expect(saved().adventureStartDeadline).toBeUndefined();
    expect(button('Lancer les dés').disabled).toBe(false);
  });

  it('introduces a rematch as a new adventure with its own deadline', async () => {
    const initial = existingSave();
    const finished = applyLocal(initial, {
      type: 'tick',
      elapsedMs: initial.state.durationMs,
    }).save;
    expect(finished.state.winner).not.toBeNull();
    persistLocal(finished);
    await mount();
    await click('Revoir le dernier résultat');
    expect(introduction()).toBeNull();
    await click('Revanche avec les mêmes joueurs');
    await advance(DRAWN_CARD_EXIT_MS);
    expect(introduction()?.open).toBe(true);
    expect(saved().state.winner).toBeNull();
    expect(saved().adventureStartDeadline).toBe(Date.now() + 20_000);
  });
});
