// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { bindMouseControls } from '../src/board/mouseControls';

afterEach(() => vi.useRealTimers());

function pointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  values: Partial<PointerEvent> = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(
    event,
    Object.fromEntries(
      Object.entries({
        pointerId: 3,
        pointerType: 'mouse',
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
        ...values,
      }).map(([key, value]) => [key, { value }]),
    ),
  );
  target.dispatchEvent(event);
  return event;
}

it('zooms only over the board, clamps both ends and preserves browser zoom shortcuts', () => {
  const board = document.createElement('div');
  let zoom = 100;
  const publish = vi.fn((value: number) => (zoom = value));
  const unbind = bindMouseControls(board, () => zoom, publish, {
    enabled: () => true,
    move: vi.fn(),
  });
  const wheel = (deltaY: number, values: WheelEventInit = {}) => {
    const event = new WheelEvent('wheel', { cancelable: true, deltaY, ...values });
    Object.defineProperties(event, {
      ctrlKey: { value: values.ctrlKey ?? false },
      metaKey: { value: values.metaKey ?? false },
    });
    board.dispatchEvent(event);
    return event;
  };
  expect(wheel(-400).defaultPrevented).toBe(true);
  expect(zoom).toBeGreaterThan(100);
  wheel(-10000);
  expect(zoom).toBe(400);
  wheel(10000);
  expect(zoom).toBe(70);
  const count = publish.mock.calls.length;
  expect(wheel(-100, { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(wheel(-100, { metaKey: true }).defaultPrevented).toBe(false);
  expect(wheel(0, { deltaX: 100 }).defaultPrevented).toBe(false);
  document.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
  expect(publish).toHaveBeenCalledTimes(count);
  unbind();
  expect(wheel(-100).defaultPrevented).toBe(false);
});

it('accumulates small trackpad changes instead of rounding each event away', () => {
  const board = document.createElement('div');
  let zoom = 100;
  const unbind = bindMouseControls(
    board,
    () => zoom,
    (value) => (zoom = value),
    {
      enabled: () => true,
      move: vi.fn(),
    },
  );
  for (let i = 0; i < 40; i++)
    board.dispatchEvent(new WheelEvent('wheel', { cancelable: true, deltaY: -1 }));
  expect(zoom).toBeGreaterThan(100);
  unbind();
});

it('keeps tile clicks while suppressing the release click after an actual drag', () => {
  vi.useFakeTimers();
  const board = document.createElement('div');
  const tile = document.createElement('button');
  board.append(tile);
  const move = vi.fn();
  const click = vi.fn();
  tile.addEventListener('click', click);
  const unbind = bindMouseControls(board, () => 100, vi.fn(), {
    enabled: () => true,
    move,
  });
  const tap = () => tile.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  pointer(tile, 'pointerdown', 100, 100);
  pointer(document, 'pointermove', 103, 102);
  pointer(document, 'pointerup', 103, 102);
  tap();
  expect(move).not.toHaveBeenCalled();
  expect(click).toHaveBeenCalledTimes(1);
  pointer(tile, 'pointerdown', 100, 100);
  expect(pointer(document, 'pointermove', 120, 130).defaultPrevented).toBe(true);
  expect(move).toHaveBeenLastCalledWith(20, 30);
  expect(board.classList.contains('board-is-dragging')).toBe(true);
  pointer(document, 'pointermove', 128, 132);
  expect(move).toHaveBeenLastCalledWith(8, 2);
  pointer(document, 'pointerup', 128, 132);
  expect(board.classList.contains('board-is-dragging')).toBe(false);
  tap();
  expect(click).toHaveBeenCalledTimes(1);
  tile.click();
  expect(click).toHaveBeenCalledTimes(2); // keyboard activation
  pointer(tile, 'pointerdown', 128, 132);
  pointer(document, 'pointerup', 128, 132);
  tap();
  expect(click).toHaveBeenCalledTimes(3); // a fresh pointer click need not wait
  unbind();
});

it('ignores touch/right-click, disabled panning and cancelled or lost gestures', () => {
  const board = document.createElement('div');
  const move = vi.fn();
  let enabled = true;
  const unbind = bindMouseControls(board, () => 100, vi.fn(), {
    enabled: () => enabled,
    move,
  });
  for (const values of [{ pointerType: 'touch' }, { button: 2 }, { pointerType: 'pen' }]) {
    pointer(board, 'pointerdown', 10, 10, values);
    pointer(document, 'pointermove', 100, 100);
  }
  expect(move).not.toHaveBeenCalled();
  enabled = false;
  pointer(board, 'pointerdown', 10, 10);
  pointer(document, 'pointermove', 100, 100);
  expect(move).not.toHaveBeenCalled();
  enabled = true;
  pointer(board, 'pointerdown', 10, 10);
  pointer(document, 'pointercancel', 10, 10);
  pointer(document, 'pointermove', 100, 100);
  expect(move).not.toHaveBeenCalled();
  pointer(board, 'pointerdown', 10, 10);
  pointer(document, 'pointermove', 100, 100, { buttons: 0 });
  pointer(document, 'pointermove', 120, 120);
  expect(move).not.toHaveBeenCalled();
  pointer(board, 'pointerdown', 10, 10);
  window.dispatchEvent(new Event('blur'));
  pointer(document, 'pointermove', 120, 120);
  expect(move).not.toHaveBeenCalled();
  unbind();
});
