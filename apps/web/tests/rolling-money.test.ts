// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, createGame } from '@money-tour/engine';
import { readFileSync } from 'node:fs';
import { setLanguage } from '../src/i18n/language';
import { PlayerProfiles } from '../src/game/PlayerProfiles';
import { MONEY_ROLL_MS, RollingMoney, moneyWheelEnd } from '../src/game/RollingMoney';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const cashStyles = readFileSync('apps/web/src/game/rolling-money.css', 'utf8');

describe('mechanical cash counters', () => {
  let host: HTMLDivElement;
  let root: Root;
  let media: MediaQueryList;
  let sheet: HTMLStyleElement;
  let reduced = false;
  const render = (value: number, compact = false) =>
    act(() => root.render(createElement(RollingMoney, { value, compact })));
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const counter = () => host.querySelector<HTMLSpanElement>('.money-odometer')!;
  const wheel = (place: number) =>
    host.querySelector<HTMLSpanElement>(`[data-place="${place}"] .money-odometer-tape`)!;
  const pose = (place: number) => wheel(place).style.transform;
  const accessible = () => counter().querySelector('.sr-only')!.textContent;

  beforeEach(() => {
    vi.useFakeTimers();
    reduced = false;
    media = new EventTarget() as MediaQueryList;
    Object.defineProperty(media, 'matches', { get: () => reduced });
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    setLanguage('fr');
    host = document.createElement('div');
    document.body.append(host);
    sheet = document.createElement('style');
    sheet.textContent = cashStyles;
    document.head.append(sheet);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    sheet.remove();
    setLanguage('fr');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useRealTimers();
  });

  it('shows the exact initial balance without counting up from zero', async () => {
    await render(1350);
    expect(accessible()).toBe('1\u202f350');
    expect(counter().dataset.rolling).toBe('false');
    expect(pose(3)).toBe('translate3d(0, -1em, 0)');
    expect(pose(2)).toBe('translate3d(0, -3em, 0)');
    expect(host.querySelector('.money-odometer-visual')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('[aria-live]')).toBeNull();
  });

  it('hides the semantic total using component CSS, leaving just one visible drum row', async () => {
    await render(1911);
    const value = counter().querySelector<HTMLElement>('.money-odometer-value')!;
    const hidden = getComputedStyle(value);
    expect(hidden.position).toBe('absolute');
    expect(hidden.width).toBe('1px');
    expect(hidden.height).toBe('1px');
    expect(hidden.overflow).toBe('hidden');
    expect(hidden.clipPath).toBe('inset(50%)');
    expect(counter().querySelectorAll('.money-odometer-visual')).toHaveLength(1);
    expect(counter().querySelectorAll('.money-odometer-value')).toHaveLength(1);
    const slot = counter().querySelector<HTMLElement>('.money-odometer-slot')!;
    expect(getComputedStyle(slot).overflow).toBe('hidden');
    expect(
      getComputedStyle(counter().querySelector<HTMLElement>('.money-odometer-visual')!).display,
    ).toBe('inline-flex');
  });

  it('rolls gains and losses in opposite directions and settles on the authoritative total', async () => {
    await render(1350);
    await render(1550);
    expect(counter().dataset.rolling).toBe('true');
    expect(counter().dataset.direction).toBe('gain');
    expect(accessible()).toBe('1\u202f550');
    expect(pose(2)).toBe('translate3d(0, -3em, 0)');
    await advance(200);
    expect(pose(2)).not.toBe('translate3d(0, -3em, 0)');
    expect(pose(2)).not.toBe('translate3d(0, -5em, 0)');
    await advance(MONEY_ROLL_MS);
    expect(pose(2)).toBe('translate3d(0, -5em, 0)');
    expect(counter().dataset.rolling).toBe('false');
    await render(1250);
    expect(counter().dataset.direction).toBe('loss');
    await advance(200);
    expect(pose(2)).not.toBe('translate3d(0, -5em, 0)');
    await advance(MONEY_ROLL_MS);
    expect(pose(2)).toBe('translate3d(0, -2em, 0)');
    expect(accessible()).toBe('1\u202f250');
  });

  it('continues from the visible drum position when a new payment interrupts a gain', async () => {
    await render(1350);
    await render(1750);
    await advance(300);
    const interrupted = pose(2);
    await render(1450);
    expect(pose(2)).toBe(interrupted);
    expect(accessible()).toBe('1\u202f450');
    await advance(MONEY_ROLL_MS + 16);
    expect(pose(2)).toBe('translate3d(0, -4em, 0)');
    expect(counter().dataset.rolling).toBe('false');
  });

  it('adds a drum for a carry and removes unused leading drums when the balance shrinks', async () => {
    await render(990);
    await render(1010);
    expect(wheel(3)).not.toBeNull();
    await advance(MONEY_ROLL_MS + 16);
    expect(pose(3)).toBe('translate3d(0, -1em, 0)');
    await render(980);
    expect(host.querySelector('[data-place="3"]')).toBeNull();
    await advance(MONEY_ROLL_MS + 16);
    expect(accessible()).toBe('980');
    expect(pose(2)).toBe('translate3d(0, -9em, 0)');
    expect(pose(1)).toBe('translate3d(0, -8em, 0)');
  });

  it('releases large-number slots and decimal places instead of retaining invisible profile width', async () => {
    await render(123456789.25);
    expect(host.querySelectorAll('.money-odometer-slot')).toHaveLength(11);
    await render(100);
    expect(host.querySelectorAll('.money-odometer-slot')).toHaveLength(3);
    expect(host.querySelectorAll('.money-odometer-mark')).toHaveLength(0);
    await advance(MONEY_ROLL_MS + 16);
    expect(host.querySelectorAll('.money-odometer-slot')).toHaveLength(3);
    expect(accessible()).toBe('100');
    await render(1100);
    expect(pose(3)).toBe('translate3d(0, 0em, 0)');
    await advance(MONEY_ROLL_MS + 16);
    expect(pose(3)).toBe('translate3d(0, -1em, 0)');
  });

  it('preserves decimal cash, localized grouping and compact units', async () => {
    await render(1234.25);
    expect(accessible()).toBe('1\u202f234,25');
    expect(pose(-1)).toBe('translate3d(0, -2em, 0)');
    expect(pose(-2)).toBe('translate3d(0, -5em, 0)');
    await render(1234.75);
    await advance(MONEY_ROLL_MS + 16);
    expect(pose(-1)).toBe('translate3d(0, -7em, 0)');
    setLanguage('en');
    await render(1234.75);
    expect(accessible()).toBe('1,234.75');
    // ICU versions differ on en-GB compact-unit casing (K/k).
    const compactEnglish = new Intl.NumberFormat('en-GB', {
      notation: 'compact',
      maximumFractionDigits: 0,
    });
    await render(12000, true);
    expect(accessible()).toBe(compactEnglish.format(12000));
    await render(15000, true);
    expect(counter().dataset.rolling).toBe('true');
    await advance(MONEY_ROLL_MS + 16);
    expect(pose(0)).toBe('translate3d(0, -5em, 0)');
    expect(accessible()).toBe(compactEnglish.format(15000));
  });

  it('stops immediately when reduced motion is requested, including during a roll', async () => {
    reduced = true;
    await render(1350);
    await render(1750);
    expect(counter().dataset.rolling).toBe('false');
    expect(pose(2)).toBe('translate3d(0, -7em, 0)');
    reduced = false;
    await act(() => media.dispatchEvent(new Event('change')));
    await render(1950);
    await advance(100);
    expect(counter().dataset.rolling).toBe('true');
    reduced = true;
    await act(() => media.dispatchEvent(new Event('change')));
    expect(counter().dataset.rolling).toBe('false');
    expect(pose(2)).toBe('translate3d(0, -9em, 0)');
    await advance(MONEY_ROLL_MS * 2);
    expect(pose(2)).toBe('translate3d(0, -9em, 0)');
  });

  it('does not restart a roll on unrelated profile rerenders and cleans up scheduled frames', async () => {
    await render(1350);
    await render(1750);
    await advance(300);
    const before = pose(2);
    await render(1750);
    expect(pose(2)).toBe(before);
    await advance(550);
    expect(counter().dataset.rolling).toBe('false');
    await render(1550);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(() => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('animates the actual player profile without changing its game-state cash', async () => {
    const state = createGame({
      config,
      players: [
        { id: 'a', name: 'Léa' },
        { id: 'b', name: 'Max' },
      ],
      seed: 'rolling-profile',
    });
    state.players[0]!.cash = 1350;
    const view = () =>
      createElement(PlayerProfiles, {
        state,
        mobile: true,
        inspectedOwner: null,
        onInspectOwner: vi.fn(),
        onTile: vi.fn(),
        onBonus: vi.fn(),
      });
    await act(() => root.render(view()));
    const full = host.querySelector('[data-bank="a"] .player-panel-money-full .money-odometer')!;
    expect(full.getAttribute('data-rolling')).toBe('false');
    state.players[0]!.cash = 1150;
    await act(() => root.render(view()));
    expect(full.getAttribute('data-rolling')).toBe('true');
    expect(full.querySelector('.sr-only')?.textContent).toBe('1\u202f150');
    expect(state.players[0]!.cash).toBe(1150);
    await advance(MONEY_ROLL_MS + 16);
    expect(full.getAttribute('data-rolling')).toBe('false');
    expect(state.players[0]!.cash).toBe(1150);
    state.players[0]!.cash = 123456789.25;
    await act(() => root.render(view()));
    expect(full.querySelectorAll('.money-odometer-slot')).toHaveLength(11);
    expect(
      full.closest('.player-panel-money')!.classList.contains('player-panel-money-compactable'),
    ).toBe(true);
    state.players[0]!.cash = 100;
    await act(() => root.render(view()));
    expect(full.querySelectorAll('.money-odometer-slot')).toHaveLength(3);
    expect(
      full.closest('.player-panel-money')!.classList.contains('player-panel-money-compactable'),
    ).toBe(false);
    expect(full.closest('.player-panel-money')!.classList.contains('player-panel-money-long')).toBe(
      false,
    );
    await advance(MONEY_ROLL_MS + 16);
    expect(full.querySelectorAll('.money-odometer-slot')).toHaveLength(3);
    expect(full.querySelector('.sr-only')?.textContent).toBe('100');
  });

  it('bounds whole-turn travel for huge payments and respects wrap direction', () => {
    expect(moneyWheelEnd(9, 1, 1, true)).toBe(11);
    expect(moneyWheelEnd(1, 9, -1, true)).toBe(-1);
    expect(moneyWheelEnd(0, 0, 1, true)).toBe(10);
    expect(moneyWheelEnd(0, 0, -1, true)).toBe(-10);
    expect(moneyWheelEnd(5.25, 3, -1, true)).toBe(3);
    expect(moneyWheelEnd(5, 5, 1, false)).toBe(5);
  });
});
