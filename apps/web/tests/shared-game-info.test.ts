// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, createGame, reduceGame, type GameState } from '@money-tour/engine';
import { SharedGameInfo } from '../src/game/AdventureHUD';
import { PlayerProfiles } from '../src/game/PlayerProfiles';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function game() {
  const state = createGame({
    config: { ...config, resortVictory: true },
    players: [
      { id: 'a', name: 'Léa' },
      { id: 'b', name: 'Max' },
      { id: 'c', name: 'Mila' },
    ],
    seed: 'shared-game-info',
    randomFirstPlayer: true,
  });
  for (const property of Object.values(state.properties)) property.ownerId = null;
  state.adventure = {
    twist: 'capital',
    capitalTile: state.config.board.find((tile) => tile.type === 'city')!.id,
    round: 1,
    tenderRound: 5,
    tenderDone: false,
  };
  return state;
}

function finishTurn(state: GameState) {
  const result = reduceGame(
    { ...state, phase: 'end' },
    { type: 'finish', playerId: state.players[state.currentPlayer]!.id },
  );
  expect(result.error).toBeUndefined();
  return result.state;
}

describe('shared game messages', () => {
  let host: HTMLDivElement;
  let root: Root;
  const render = (state: GameState, mobile = true, key = 'first') =>
    act(() => root.render(createElement(SharedGameInfo, { state, mobile, key })));

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it('frees the mobile rule banner only after every first turn, without waiting for a board lap', async () => {
    let state = game();
    await render(state);
    expect(host.querySelector('.adventure-banner')?.textContent).toContain('Capitale mystère');
    for (let i = 0; i < state.players.length - 1; i++) {
      state = finishTurn(state);
      await render(state);
      expect(host.querySelector('.adventure-banner')).not.toBeNull();
    }
    state = finishTurn(state);
    expect(state.adventure!.round).toBe(2);
    expect(state.players.every((player) => player.laps === 0)).toBe(true);
    await render(state);
    expect(host.querySelector('.adventure-banner')).toBeNull();
    expect(host.querySelector('.shared-game-info')?.children).toHaveLength(0);
  });

  it('keeps the special rule on desktop and displays it again for a new game on mobile', async () => {
    const state = game();
    state.adventure!.round = 2;
    await render(state, false);
    expect(host.querySelector('.adventure-banner')).not.toBeNull();
    await render(state);
    expect(host.querySelector('.adventure-banner')).toBeNull();
    await render(game(), true, 'new');
    expect(host.querySelector('.adventure-banner')).not.toBeNull();
  });

  it('keeps the hidden mobile rule available by opening a player profile', async () => {
    const state = game();
    state.adventure!.round = 2;
    await act(() =>
      root.render(
        createElement(
          'div',
          {},
          createElement(SharedGameInfo, { state, mobile: true }),
          createElement(PlayerProfiles, {
            state,
            mobile: true,
            inspectedOwner: null,
            onInspectOwner: vi.fn(),
            onTile: vi.fn(),
            onBonus: vi.fn(),
          }),
        ),
      ),
    );
    expect(host.querySelector('.adventure-banner')).toBeNull();
    await act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="Voir le profil de Léa"]')!.click(),
    );
    expect(document.querySelector('dialog[open] .player-details-rule')?.textContent).toContain(
      'Capitale mystère',
    );
    await act(() =>
      document.querySelector<HTMLButtonElement>('[aria-label="Fermer le profil"]')!.click(),
    );
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(host.querySelector('.adventure-banner')).toBeNull();
  });

  it('does not count double-dice extra rolls as another player taking a turn', async () => {
    let state = game();
    state.extraRoll = true;
    state = finishTurn(state);
    expect(state.adventure!.round).toBe(1);
    expect(state.turn).toBe(1);
    await render(state);
    expect(host.querySelector('.adventure-banner')).not.toBeNull();
  });

  it('opens reactions for the selected player without requiring a tiny board pawn', async () => {
    const state = game();
    const onTaunt = vi.fn();
    await act(() =>
      root.render(
        createElement(PlayerProfiles, {
          state,
          mobile: true,
          inspectedOwner: null,
          onInspectOwner: vi.fn(),
          onTile: vi.fn(),
          onBonus: vi.fn(),
          onTaunt,
        }),
      ),
    );
    await act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="Voir le profil de Max"]')!.click(),
    );
    await act(() =>
      document.querySelector<HTMLButtonElement>('[aria-label="Réagir à Max"]')!.click(),
    );
    expect(onTaunt).toHaveBeenCalledExactlyOnceWith('b');
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('does not offer reactions when the game is read-only or the target is eliminated', async () => {
    const state = game();
    const renderProfiles = (onTaunt?: (id: string) => void) =>
      act(() =>
        root.render(
          createElement(PlayerProfiles, {
            state,
            mobile: true,
            inspectedOwner: null,
            onInspectOwner: vi.fn(),
            onTile: vi.fn(),
            onBonus: vi.fn(),
            onTaunt,
          }),
        ),
      );
    await renderProfiles();
    await act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="Voir le profil de Max"]')!.click(),
    );
    expect(document.querySelector('.player-details-react')).toBeNull();
    await act(() =>
      document.querySelector<HTMLButtonElement>('[aria-label="Fermer le profil"]')!.click(),
    );
    state.players[1]!.eliminated = true;
    await renderProfiles(vi.fn());
    await act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="Voir le profil de Max"]')!.click(),
    );
    expect(document.querySelector('.player-details-react')).toBeNull();
  });

  it('expires a victory warning after 30 seconds even while game ticks keep rerendering it', async () => {
    const state = game();
    const islands = state.config.board.filter((tile) => tile.type === 'resort');
    for (const tile of islands.slice(0, 3)) state.properties[tile.id]!.ownerId = 'a';
    await render(state);
    expect(host.querySelector('.victory-watch')?.textContent).toContain('Léa');
    await act(() => vi.advanceTimersByTime(15_000));
    await render({ ...state, seq: state.seq + 1, elapsedMs: 15_000 });
    await act(() => vi.advanceTimersByTime(14_999));
    expect(host.querySelector('.victory-watch')).not.toBeNull();
    await act(() => vi.advanceTimersByTime(1));
    expect(host.querySelector('.victory-watch')).toBeNull();
    await render({ ...state, seq: state.seq + 2, elapsedMs: 30_000 });
    expect(host.querySelector('.victory-watch')).toBeNull();
  });

  it('gives a materially different threat its own 30 seconds', async () => {
    const state = game();
    const islands = state.config.board.filter((tile) => tile.type === 'resort');
    for (const tile of islands.slice(0, 3)) state.properties[tile.id]!.ownerId = 'a';
    await render(state);
    expect(host.querySelector('.victory-watch')?.textContent).toContain(islands[3]!.name);
    await act(() => vi.advanceTimersByTime(20_000));
    state.properties[islands[2]!.id]!.ownerId = null;
    state.properties[islands[3]!.id]!.ownerId = 'a';
    await render(state);
    expect(host.querySelector('.victory-watch')?.textContent).toContain(islands[2]!.name);
    await act(() => vi.advanceTimersByTime(29_999));
    expect(host.querySelector('.victory-watch')).not.toBeNull();
    await act(() => vi.advanceTimersByTime(1));
    expect(host.querySelector('.victory-watch')).toBeNull();
  });

  it('shows a warning again if the threat was resolved and later returns', async () => {
    const state = game();
    const islands = state.config.board.filter((tile) => tile.type === 'resort');
    for (const tile of islands.slice(0, 3)) state.properties[tile.id]!.ownerId = 'a';
    await render(state);
    await act(() => vi.advanceTimersByTime(30_000));
    expect(host.querySelector('.victory-watch')).toBeNull();
    state.properties[islands[2]!.id]!.ownerId = null;
    await render(state);
    state.properties[islands[2]!.id]!.ownerId = 'a';
    await render(state);
    expect(host.querySelector('.victory-watch')).not.toBeNull();
    await act(() => vi.advanceTimersByTime(30_000));
    expect(host.querySelector('.victory-watch')).toBeNull();
  });
});
