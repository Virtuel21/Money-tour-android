// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, type GameAction } from '@money-tour/engine';
import { ActionCard, ActionCardActions, ACTION_CARD_EXIT_MS } from '../src/game/ActionCard';
import { DuelView } from '../src/game/DuelView';
import { CasinoView } from '../src/game/CasinoView';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

describe('fixed action-card controls', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps nested controls in the fixed footer alongside an explicit footer action', async () => {
    const action = vi.fn();
    await act(() =>
      root.render(
        createElement(ActionCard, {
          cardKey: 'portal:1',
          title: 'Votre décision',
          children: (card) =>
            createElement(
              ActionCardActions,
              null,
              createElement('button', { onClick: () => card.run(action) }, 'Confirmer'),
            ),
          footer: createElement('button', null, 'Retour au plateau'),
        }),
      ),
    );
    expect(host.querySelector('.action-card-content button')).toBeNull();
    const footer = host.querySelector('.action-card-footer')!;
    expect(footer.querySelectorAll('button')).toHaveLength(2);
    expect(host.textContent?.match(/Confirmer/g)).toHaveLength(1);
    const confirm = footer.querySelector<HTMLButtonElement>('.action-card-actions button')!;
    await act(() => confirm.click());
    expect(confirm.closest('fieldset')!.disabled).toBe(true);
    expect(action).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTime(ACTION_CARD_EXIT_MS));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('keeps standalone action groups inline without adding a wrapper', async () => {
    await act(() =>
      root.render(
        createElement(
          'section',
          null,
          createElement(ActionCardActions, null, createElement('button', null, 'Jouer')),
        ),
      ),
    );
    expect(host.querySelector('section > button')?.textContent).toBe('Jouer');
    expect(host.querySelector('.action-card-actions')).toBeNull();
  });

  it('leaves the footer host empty when no view or footer supplies actions', async () => {
    await act(() =>
      root.render(
        createElement(ActionCard, {
          cardKey: 'spectator:1',
          title: 'Votre adversaire joue',
          children: createElement('p', null, 'En attente…'),
        }),
      ),
    );
    expect(host.querySelector('.action-card-footer')!.matches(':empty')).toBe(true);
  });

  it('preserves a typed duel stake across countdown rerenders while keeping the offers pinned', async () => {
    const state = createGame({
      players: [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
        { id: 'c', name: 'Camille' },
        { id: 'd', name: 'Dan' },
      ],
    });
    state.phase = 'duel';
    state.duel = {
      id: 'footer-duel',
      challengerId: 'a',
      stage: 'offer',
      amount: 0,
      escrow: false,
      commitments: {},
      reveals: {},
    };
    const actions: GameAction[] = [];
    const render = () =>
      act(() =>
        root.render(
          createElement(ActionCard, {
            cardKey: 'duel:offer:a',
            title: 'Le grand duel',
            children: (card) =>
              createElement(DuelView, {
                state: structuredClone(state),
                act: (action) => card.run(() => actions.push(action)),
              }),
          }),
        ),
      );
    await render();
    const input = host.querySelector('input')!;
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '125');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    state.seq += 1;
    state.decisionElapsedMs += 1000;
    await render();
    expect(host.querySelector('input')).toBe(input);
    expect(input.value).toBe('125');
    expect(host.querySelector('.action-card-content button')).toBeNull();
    const offers = host.querySelectorAll<HTMLButtonElement>(
      '.action-card-footer .duel-offer-actions button',
    );
    expect(offers).toHaveLength(3);
    await act(() => offers[0]!.click());
    expect(actions).toEqual([]);
    await act(() => vi.advanceTimersByTime(ACTION_CARD_EXIT_MS));
    expect(actions).toEqual([{ type: 'duel_offer', playerId: 'a', targetId: 'b', amount: 125 }]);
  });

  it.each(['roulette', 'slots'] as const)(
    'pins the %s casino choices and skip control and preserves their delayed action',
    async (game) => {
      const state = createGame({
        players: [
          { id: 'a', name: 'Alice' },
          { id: 'b', name: 'Bob' },
        ],
      });
      state.phase = 'casino';
      state.casino = { tile: 7, game, chance: 50 };
      const actions: GameAction[] = [];
      await act(() =>
        root.render(
          createElement(ActionCard, {
            cardKey: `casino:${game}`,
            title: 'Bienvenue au casino',
            children: (card) =>
              createElement(CasinoView, {
                state,
                act: (action) => card.run(() => actions.push(action)),
              }),
          }),
        ),
      );
      expect(host.querySelector('.action-card-content button')).toBeNull();
      expect(host.querySelectorAll('.action-card-footer .casino-actions button')).toHaveLength(
        game === 'roulette' ? 2 : 1,
      );
      expect(host.querySelector('.action-card-footer .secondary')).not.toBeNull();
      await act(() => host.querySelector<HTMLButtonElement>('.casino-actions button')!.click());
      expect(actions).toEqual([]);
      await act(() => vi.advanceTimersByTime(ACTION_CARD_EXIT_MS));
      expect(actions).toEqual([
        { type: game === 'roulette' ? 'casino_red' : 'casino_spin', playerId: 'a' },
      ]);
    },
  );
});
