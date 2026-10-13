// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { bindPinchZoom } from '../src/board/pinchZoom';

afterEach(() => vi.useRealTimers());
it('zooms from the initial span, clamps the scale and suppresses tile taps after pinching', () => {
  vi.useFakeTimers();
  const board = document.createElement('div');
  const tile = document.createElement('button');
  board.append(tile);
  const tap = vi.fn(),
    zoom = vi.fn();
  tile.addEventListener('click', tap);
  const unbind = bindPinchZoom(board, () => 100, zoom);
  const touch = (type: string, xs: number[]) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', {
      value: xs.map((clientX, identifier) => ({ clientX, clientY: 10, identifier })),
    });
    tile.dispatchEvent(event);
    return event;
  };
  expect(touch('touchstart', [10]).defaultPrevented).toBe(false);
  touch('touchstart', [10, 110]);
  expect(touch('touchmove', [10, 160]).defaultPrevented).toBe(true);
  expect(zoom).toHaveBeenLastCalledWith(150);
  touch('touchmove', [10, 300]);
  expect(zoom).toHaveBeenLastCalledWith(160);
  touch('touchmove', [10, 20]);
  expect(zoom).toHaveBeenLastCalledWith(70);
  touch('touchend', [10]);
  tile.click();
  expect(tap).not.toHaveBeenCalled();
  touch('touchend', []);
  tile.click();
  expect(tap).not.toHaveBeenCalled();
  vi.advanceTimersByTime(401);
  tile.click();
  expect(tap).toHaveBeenCalledTimes(1);
  unbind();
  expect(touch('touchstart', [10, 110]).defaultPrevented).toBe(false);
});
