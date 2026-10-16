// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { config, createGame } from '@money-tour/engine';
import { MobileTiles } from '../src/game/MobileTiles';
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root: Root;
afterEach(async () => {
  await act(() => root?.unmount());
  document.body.innerHTML = '';
});
async function mount(choices: number[] = []) {
  const host = document.body.appendChild(document.createElement('div'));
  const onTile = vi.fn();
  const state = createGame({
    config: { ...config, shuffleStreets: false },
    players: [
      { id: 'p1', name: 'Léa' },
      { id: 'p2', name: 'Max' },
    ],
    seed: 'menus',
  });
  root = createRoot(host);
  await act(() => root.render(createElement(MobileTiles, { state, choices, onTile })));
  return { host, onTile };
}
async function search(host: HTMLElement, query: string) {
  const input = host.querySelector<HTMLInputElement>('input[type=search]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('finds accented names and resets pagination when searching or clearing', async () => {
  const { host } = await mount();
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Cases suivantes"]')!.click());
  expect(host.querySelector('[aria-label="Page 2 sur 6"]')).not.toBeNull();
  await search(host, 'edimbourg');
  expect(host.querySelector('.mobile-tile-list')!.textContent).toContain('Édimbourg');
  expect(host.querySelectorAll('.mobile-tile-list button')).toHaveLength(1);
  await search(host, '');
  expect(host.querySelector('[aria-label="Page 1 sur 6"]')).not.toBeNull();
});
it('never exposes destinations outside the legal choices when searching', async () => {
  const { host, onTile } = await mount([1, 2]);
  await search(host, 'Venise');
  expect(host.querySelectorAll('.mobile-tile-list button')).toHaveLength(0);
  expect(host.textContent).toContain('Aucune escale trouvée');
  await search(host, 'Lisbonne');
  await act(() => host.querySelector<HTMLButtonElement>('.mobile-tile-list button')!.click());
  expect(onTile).toHaveBeenCalledExactlyOnceWith(1);
});
