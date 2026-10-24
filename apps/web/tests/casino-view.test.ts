// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { config, createGame, type GameAction, type GameState } from '@money-tour/engine';
import { CasinoView } from '../src/game/CasinoView';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let host: HTMLDivElement;
let root: Root;
let state: GameState;
let dispatch: ReturnType<typeof vi.fn<(action: GameAction) => void>>;

beforeEach(() => {
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  state = createGame({
    config,
    players: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ],
  });
  state.phase = 'casino';
  state.casino = { tile: 7, game: 'roulette', chance: 50 };
  dispatch = vi.fn<(action: GameAction) => void>();
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

const render = (disabled = false) =>
  act(() => root.render(createElement(CasinoView, { state, act: dispatch, disabled })));
const play = () => host.querySelector<HTMLButtonElement>('.casino_red')!;

it('locks repeated choices while an online play is pending and permits retry after a failure', async () => {
  await render();
  const original = host.querySelector('.casino-view');
  await act(() => {
    play().click();
    play().click();
  });
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'casino_red', playerId: 'a' });
  expect(play().disabled).toBe(true);
  await render(true);
  state = { ...state, seq: state.seq + 1 };
  await render(true);
  expect(play().disabled).toBe(true);
  expect(host.querySelector('.casino-view')).toBe(original);
  await render(false);
  expect(play().disabled).toBe(false);
  await act(() => play().click());
  expect(dispatch).toHaveBeenCalledTimes(2);
});

it('keeps casino choices disabled while the online room is blocked', async () => {
  await render(true);
  await act(() => play().click());
  expect(dispatch).not.toHaveBeenCalled();
  expect([...host.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
});
