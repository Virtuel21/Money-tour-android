// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { tutorialScene } from '../src/game/tutorial';
import { PlayerInventory } from '../src/game/AdventureHUD';
import { MobilePocket } from '../src/game/MobilePocket';
import { TauntMenu } from '../src/game/TauntMenu';
import { estateGroups } from '../src/game/estate';
import { tauntPlayer } from '../src/game/taunts';
import { PurchaseDetails, purchaseOffer } from '../src/game/PurchaseOffer';
import { reduceGame } from '@money-tour/engine';
import { actionSchema } from '../src/network/schema';
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root: Root;
afterEach(async () => {
  await act(() => root?.unmount());
  document.body.innerHTML = '';
});
const mount = () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  return host;
};
it('removes a completed secret objective from the mobile notebook and returns to cities', async () => {
  const state = tutorialScene('build'),
    host = mount();
  state.quests!.p1!.completed = false;
  const render = () =>
    root.render(createElement(MobilePocket, { state, self: 'p1', onTile: vi.fn() }));
  await act(render);
  await act(() =>
    [...host.querySelectorAll<HTMLButtonElement>('nav button')]
      .find((button) => button.textContent === 'Objectif')!
      .click(),
  );
  expect(host.querySelector('.private-quest')).not.toBeNull();
  state.quests!.p1!.completed = true;
  await act(render);
  expect(host.querySelector('.private-quest')).toBeNull();
  expect([...host.querySelectorAll('nav button')].map((button) => button.textContent)).toEqual([
    'Villes',
    'Victoire',
    'Bonus',
    'Partie',
  ]);
  expect(host.querySelector('.pocket-cities')).not.toBeNull();
});
it('keeps network and solo taunts bound to the human outside their turn, and supports shared-device players', () => {
  const state = tutorialScene('build');
  state.currentPlayer = 1;
  state.players[1]!.bot = true;
  expect(tauntPlayer(state, undefined, 'p2')).toBe('p1');
  expect(tauntPlayer(state, 'p1', 'p2')).toBe('p1');
  expect(tauntPlayer(state, 'p2', 'p1')).toBeUndefined();
  state.players[1]!.bot = false;
  expect(tauntPlayer(state, undefined, 'p1')).toBe('p1');
  state.players[0]!.eliminated = true;
  expect(tauntPlayer(state, 'p1')).toBeUndefined();
});
it('opens the requested buyout selector and submits the chosen houses in one validated action', async () => {
  let state = tutorialScene('build');
  state.quests!.p1!.completed = true;
  state.properties[5] = { ownerId: 'p2', level: 0, championships: 0 };
  expect(purchaseOffer(state)).toBeNull();
  expect(purchaseOffer(state, undefined, true)?.buyout).toBe(true);
  const host = mount(),
    buy = vi.fn((level: number) => {
      state = reduceGame(
        state,
        actionSchema.parse({ type: 'buyout', playerId: 'p1', level }),
      ).state;
    });
  await act(() =>
    root.render(
      createElement(PurchaseDetails, { state, buyout: true, onBuy: buy, onPass: vi.fn() }),
    ),
  );
  const before = state.players[0]!.cash;
  expect(host.querySelector('.purchase-cta')!.textContent).toContain('300 💵');
  await act(() => host.querySelectorAll<HTMLButtonElement>('.purchase-levels button')[3]!.click());
  expect(host.querySelector('.purchase-cta')!.textContent).toContain('525 💵');
  await act(() => host.querySelector<HTMLButtonElement>('.purchase-cta')!.click());
  expect(buy).toHaveBeenCalledWith(3);
  expect(state.properties[5]).toMatchObject({ ownerId: 'p1', level: 3 });
  expect(state.players[0]!.cash).toBe(before - 525);
  expect(state.phase).toBe('end');
});
it('keeps streets together on desktop and paginates whole streets on mobile with the targeted malus', async () => {
  const state = tutorialScene('build');
  Object.values(state.properties).forEach((p) => (p.ownerId = null));
  for (const id of [1, 2, 3, 4, 5, 6]) state.properties[id]!.ownerId = 'p1';
  state.properties[5]!.level = 4;
  state.properties[5]!.roachTurns = 2;
  expect(estateGroups(state, 'p1').map(([name]) => name)).toEqual([
    'Rue 1',
    'Rue 2',
    'Îles privées',
  ]);
  const host = mount(),
    open = vi.fn();
  await act(() =>
    root.render(createElement(PlayerInventory, { state, player: state.players[0]!, onTile: open })),
  );
  expect([...host.querySelectorAll('.estate-street h4')].map((e) => e.textContent)).toEqual([
    'Rue 1',
    'Rue 2',
    'Îles privées',
  ]);
  expect(host.querySelector('.roach-badge')!.closest('button')!.textContent).toContain('Madrid');
  expect(host.querySelector('.roach-badge')!.textContent).toContain('2 tours');
  await act(() => root.render(createElement(MobilePocket, { state, self: 'p1', onTile: open })));
  expect(host.querySelectorAll('.pocket-cities button')).toHaveLength(3);
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Rue suivante"]')!.click());
  expect(host.querySelector('.pocket-cities h3')!.textContent).toBe('Rue 2');
  expect(host.querySelector('.roach-badge')!.textContent).toContain('2 tours');
  await act(() => host.querySelector<HTMLButtonElement>('.pocket-cities button')!.click());
  expect(open).toHaveBeenCalledWith(5);
});
it.each([0, 1, 2, 3])(
  'uses the sender face for seat %i and disables all choices during cooldown',
  async (seat) => {
    const state = tutorialScene('build'),
      host = mount(),
      send = vi.fn();
    state.players = Array.from({ length: 4 }, (_, i) => ({
      ...state.players[0]!,
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
    }));
    const props = {
      state,
      playerId: state.players[seat]!.id,
      targetId: state.players[(seat + 1) % 4]!.id,
      cooling: false,
      onSend: send,
    };
    await act(() => root.render(createElement(TauntMenu, props)));
    expect(host.querySelectorAll('.taunt-options img')).toHaveLength(5);
    for (const img of host.querySelectorAll('img'))
      expect(img.getAttribute('src')).toContain(`/taunts/${seat}-`);
    await act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="Merci pour le loyer !"]')!.click(),
    );
    expect(send).toHaveBeenCalledWith('cash');
    await act(() => root.render(createElement(TauntMenu, { ...props, cooling: true })));
    expect([...host.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
  },
);
