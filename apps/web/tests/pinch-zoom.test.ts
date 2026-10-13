// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { bindPinchZoom } from '../src/board/pinchZoom';

afterEach(() => vi.useRealTimers());

function touch(target: HTMLElement, type: string, points: [number, number, number][]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: points.map(([identifier, clientX, clientY]) => ({ identifier, clientX, clientY })),
  });
  target.dispatchEvent(event);
  return event;
}

it('distinguishes a tap from a drag and leaves page scrolling available when not enlarged', () => {
  vi.useFakeTimers();
  const board = document.createElement('button');
  const tap = vi.fn(),
    move = vi.fn();
  let enabled = true;
  board.addEventListener('click', tap);
  const unbind = bindPinchZoom(board, () => 150, vi.fn(), { enabled: () => enabled, move });
  touch(board, 'touchstart', [[7, 100, 100]]);
  touch(board, 'touchmove', [[7, 102, 102]]);
  touch(board, 'touchend', []);
  board.click();
  expect(tap).toHaveBeenCalledTimes(1);
  expect(move).not.toHaveBeenCalled();
  touch(board, 'touchstart', [[7, 100, 100]]);
  expect(touch(board, 'touchmove', [[7, 120, 130]]).defaultPrevented).toBe(true);
  expect(move).toHaveBeenLastCalledWith(20, 30);
  touch(board, 'touchmove', [[7, 125, 135]]);
  expect(move).toHaveBeenLastCalledWith(5, 5);
  touch(board, 'touchend', []);
  board.click();
  expect(tap).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(401);
  board.click();
  expect(tap).toHaveBeenCalledTimes(2);
  enabled = false;
  touch(board, 'touchstart', [[8, 10, 10]]);
  expect(touch(board, 'touchmove', [[8, 90, 90]]).defaultPrevented).toBe(false);
  expect(move).toHaveBeenCalledTimes(2);
  unbind();
});

it('transitions between drag and pinch without jumping and cancels an interrupted gesture', () => {
  const board = document.createElement('div'),
    move = vi.fn(),
    zoom = vi.fn();
  const unbind = bindPinchZoom(board, () => 100, zoom, { enabled: () => true, move });
  touch(board, 'touchstart', [[2, 50, 100]]);
  touch(board, 'touchmove', [[2, 60, 100]]);
  touch(board, 'touchstart', [
    [2, 60, 100],
    [9, 160, 100],
  ]);
  touch(board, 'touchmove', [
    [9, 180, 120],
    [2, 80, 120],
  ]);
  expect(move).toHaveBeenLastCalledWith(20, 20);
  expect(zoom).toHaveBeenLastCalledWith(100);
  touch(board, 'touchend', [[9, 180, 120]]);
  touch(board, 'touchmove', [[9, 185, 120]]);
  expect(move).toHaveBeenLastCalledWith(5, 0);
  touch(board, 'touchcancel', []);
  const count = move.mock.calls.length;
  touch(board, 'touchmove', [[9, 200, 200]]);
  expect(move).toHaveBeenCalledTimes(count);
  touch(board, 'touchstart', [[1, 10, 10]]);
  touch(board, 'touchmove', [[1, 30, 10]]);
  expect(move).toHaveBeenLastCalledWith(20, 0);
  unbind();
});
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
