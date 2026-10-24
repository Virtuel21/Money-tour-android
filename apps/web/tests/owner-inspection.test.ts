// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOwnerInspectionDismissal } from '../src/game/useOwnerInspectionDismissal';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

describe('dismiss property inspection anywhere', () => {
  let host: HTMLDivElement;
  let root: Root;
  let dismiss: ReturnType<typeof vi.fn<() => void>>;
  let underlyingAction: ReturnType<typeof vi.fn<() => void>>;
  function View({ owner }: { owner: string | null }) {
    useOwnerInspectionDismissal(owner, dismiss);
    return createElement('button', { onClick: underlyingAction }, 'Roll dice');
  }
  const render = (owner: string | null) => act(() => root.render(createElement(View, { owner })));

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    dismiss = vi.fn();
    underlyingAction = vi.fn();
  });
  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
  });

  it('consumes a click on a control, then allows it after inspection is cleared', async () => {
    await render('p1');
    await act(() => host.querySelector('button')!.click());
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(underlyingAction).not.toHaveBeenCalled();
    await render(null);
    await act(() => host.querySelector('button')!.click());
    expect(underlyingAction).toHaveBeenCalledTimes(1);
  });

  it('also dismisses from the page background or Escape', async () => {
    await render('p1');
    await act(() => document.body.click());
    expect(dismiss).toHaveBeenCalledTimes(1);
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    await act(() => document.body.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(dismiss).toHaveBeenCalledTimes(2);
  });

  it('leaves zoom gestures and unrelated keys available and removes listeners on unmount', async () => {
    await render('p1');
    await act(() => document.body.dispatchEvent(new Event('pointermove', { bubbles: true })));
    await act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '+' })));
    expect(dismiss).not.toHaveBeenCalled();
    await act(() => root.render(null));
    document.body.click();
    expect(dismiss).not.toHaveBeenCalled();
  });
});
