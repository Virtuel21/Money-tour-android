// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installFocusedFieldReveal } from '../src/native/focusedField';

let viewport: EventTarget & {
  height: number;
  width: number;
  offsetTop: number;
  offsetLeft: number;
};
let dispose: (() => void) | undefined;
let frames: Map<number, FrameRequestCallback>;
const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
beforeEach(() => {
  let sequence = 0;
  frames = new Map();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++sequence, callback);
      return sequence;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => frames.delete(id)),
  );
  vi.stubGlobal('innerHeight', 640);
  vi.stubGlobal('innerWidth', 400);
  viewport = Object.assign(new EventTarget(), {
    height: 640,
    width: 400,
    offsetTop: 0,
    offsetLeft: 0,
  });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = '';
  if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport);
  else Reflect.deleteProperty(window, 'visualViewport');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function flush() {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(0));
}
function control(tag = 'input', type = 'text', top = 100, bottom = 148) {
  const element = document.body.appendChild(document.createElement(tag));
  if (element instanceof HTMLInputElement) element.type = type;
  if (tag === 'div') {
    element.tabIndex = 0;
    Object.defineProperty(element, 'isContentEditable', { value: true });
  }
  element.scrollIntoView = vi.fn();
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    top,
    bottom,
    left: 20,
    right: 220,
    x: 20,
    y: top,
    width: 200,
    height: bottom - top,
    toJSON: () => ({}),
  });
  element.focus();
  return element;
}

it('reveals a text field clipped by a late Android keyboard resize and coalesces resize events', () => {
  const element = control('input', 'text', 520, 568);
  dispose = installFocusedFieldReveal();
  flush();
  expect(element.scrollIntoView).not.toHaveBeenCalled();
  viewport.height = 550;
  viewport.dispatchEvent(new Event('resize'));
  window.dispatchEvent(new Event('resize'));
  viewport.dispatchEvent(new Event('resize'));
  expect(frames.size).toBe(1);
  flush();
  expect(element.scrollIntoView).toHaveBeenCalledExactlyOnceWith({
    block: 'center',
    inline: 'nearest',
    behavior: 'instant',
  });
});

it('does not move a field already fully visible with the keyboard open', () => {
  viewport.height = 300;
  const element = control();
  dispose = installFocusedFieldReveal();
  flush();
  viewport.dispatchEvent(new Event('resize'));
  flush();
  expect(element.scrollIntoView).not.toHaveBeenCalled();
});

it('reveals a newly focused field with a small clearance above the keyboard', () => {
  viewport.height = 300;
  dispose = installFocusedFieldReveal();
  flush();
  const element = control('input', 'text', 246, 294);
  flush();
  expect(element.scrollIntoView).toHaveBeenCalledOnce();
});

it.each([
  ['input', 'number'],
  ['textarea', ''],
  ['div', ''],
])('also reveals an editable %s %s field', (tag, type) => {
  viewport.height = 300;
  const element = control(tag, type, 280, 328);
  dispose = installFocusedFieldReveal();
  flush();
  expect(element.scrollIntoView).toHaveBeenCalledOnce();
});

it.each([
  ['input', 'checkbox'],
  ['input', 'range'],
  ['input', 'button'],
  ['select', ''],
  ['button', ''],
])('does not reposition a nontext %s %s control', (tag, type) => {
  viewport.height = 300;
  const element = control(tag, type, 280, 328);
  dispose = installFocusedFieldReveal();
  flush();
  viewport.dispatchEvent(new Event('resize'));
  flush();
  expect(element.scrollIntoView).not.toHaveBeenCalled();
});

it('does not reposition a readonly field', () => {
  viewport.height = 300;
  const element = control('input', 'text', 280, 328) as HTMLInputElement;
  element.readOnly = true;
  dispose = installFocusedFieldReveal();
  flush();
  expect(element.scrollIntoView).not.toHaveBeenCalled();
});

it('uses the visual viewport offset and the smaller resized layout viewport', () => {
  viewport.offsetTop = 100;
  viewport.height = 400;
  const element = control('input', 'text', 250, 298);
  dispose = installFocusedFieldReveal();
  flush();
  expect(element.scrollIntoView).not.toHaveBeenCalled();
  vi.stubGlobal('innerHeight', 290);
  window.dispatchEvent(new Event('resize'));
  flush();
  expect(element.scrollIntoView).toHaveBeenCalledOnce();
});

it('cancels queued work and removes focus and resize listeners on cleanup', () => {
  viewport.height = 300;
  const element = control('input', 'text', 280, 328);
  dispose = installFocusedFieldReveal();
  expect(frames.size).toBe(1);
  dispose();
  expect(cancelAnimationFrame).toHaveBeenCalledOnce();
  flush();
  expect(element.scrollIntoView).not.toHaveBeenCalled();
  viewport.dispatchEvent(new Event('resize'));
  window.dispatchEvent(new Event('resize'));
  element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  expect(frames.size).toBe(0);
});
