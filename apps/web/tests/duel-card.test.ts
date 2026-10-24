// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  config,
  createGame,
  reduceGame,
  type GameAction,
  type GameState,
} from '@money-tour/engine';
import { DuelCard } from '../src/game/DuelCard';
import { CARD_EXIT_MS } from '../src/game/cardMotion';
import { presentation, type Cue } from '../src/game/presentation';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});
function duel(bots = false) {
  const state = createGame({
    config: { ...config, shuffleStreets: false, adventures: false, festivalCount: 0 },
    players: [
      { id: 'a', name: 'Alice', bot: bots },
      { id: 'b', name: 'Bob', bot: bots },
    ],
  });
  state.phase = 'duel';
  state.duel = {
    id: 'first-encounter',
    challengerId: 'a',
    amount: 0,
    stage: 'offer',
    escrow: false,
    commitments: {},
    reveals: {},
  };
  return state;
}
async function render(
  state: GameState,
  options: {
    liveState?: GameState;
    cue?: Cue;
    busy?: boolean;
    hidden?: boolean;
    self?: string;
    act?: (action: GameAction) => void;
  } = {},
) {
  await act(() =>
    root.render(
      createElement(DuelCard, {
        journey: 'same-journey',
        state,
        liveState: state,
        cue: { kind: 'settle', duration: 0 },
        busy: false,
        disabled: false,
        self: 'spectator',
        act: vi.fn(),
        dismissResult: vi.fn(),
        ...options,
      }),
    ),
  );
}
it('creates a fresh card for a second encounter in the same turn after the first was closed', async () => {
  let state = duel();
  const cancel = (action: GameAction) => {
    state = reduceGame(state, action).state;
  };
  await render(state, { self: undefined, act: cancel });
  const first = host.querySelector('.action-card-dialog');
  await act(() =>
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Passer ce duel'))!
      .click(),
  );
  await act(() => vi.advanceTimersByTime(CARD_EXIT_MS));
  expect(state.duel).toBeUndefined();
  expect(host.querySelector('.action-card-dialog')).toBeNull();
  state = { ...state, phase: 'duel', duel: { ...duel().duel!, id: 'second-encounter' } };
  await render(state);
  const second = host.querySelector('.action-card-dialog');
  expect(second).not.toBeNull();
  expect(second).not.toBe(first);
});
it('keeps a hidden spectator card hidden when the encounter ends', async () => {
  const state = duel();
  await render(state);
  expect(host.querySelector('.action-card-dialog')).not.toBeNull();
  await render(state, { hidden: true });
  const ended = structuredClone(state);
  delete ended.duel;
  ended.phase = 'end';
  await render(ended);
  expect(host.querySelector('.action-card-dialog')).toBeNull();
});
it('shows a bot duel result in the spectator’s existing card, then animates its departure once', async () => {
  const state = duel(true);
  state.duel = { ...state.duel!, stage: 'commit', targetId: 'b', amount: 50, escrow: true };
  await render(state);
  const dialog = host.querySelector('.action-card-dialog');
  const random = [0, 0.9];
  const result = reduceGame(state, { type: 'duel_bot', playerId: 'a' }, () => random.shift()!);
  expect(result.error).toBeUndefined();
  expect(result.state.duel).toBeUndefined();
  const notice = presentation(state, result.state, result.events).find(
    (frame) => frame.cue.reason === 'duel_result',
  )!;
  await render(notice.state, { liveState: result.state, cue: notice.cue, busy: true });
  expect(host.querySelector('.action-card-dialog')).toBe(dialog);
  expect(dialog?.textContent).toContain('Alice remporte le duel');
  await render(result.state);
  expect(dialog?.classList.contains('is-leaving')).toBe(true);
  await act(() => vi.advanceTimersByTime(CARD_EXIT_MS));
  expect(host.querySelector('.action-card-dialog')).toBeNull();
});
