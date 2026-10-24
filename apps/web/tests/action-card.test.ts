// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionCard, useActionCard, type ActionCardProps } from '../src/game/ActionCard';
import { DRAWN_CARD_EXIT_MS } from '../src/game/DrawnCard';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

describe('interactive physical action cards', () => {
  let host: HTMLDivElement;
  let root: Root;
  let action: ReturnType<typeof vi.fn<() => void>>;
  let props: ActionCardProps;
  const render = (overrides: Partial<ActionCardProps> = {}) =>
    act(() => root.render(createElement(ActionCard, { ...props, ...overrides })));
  const click = () => act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  const animationEnd = async () => {
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'drawn-card-depart' });
    await act(() => host.querySelector('.drawn-card-motion')!.dispatchEvent(event));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    action = vi.fn();
    props = {
      cardKey: 'festival:1:camille',
      title: 'Préparer le festival',
      ownerLabel: 'Au tour de Camille',
      children: createElement('p', null, 'Choisissez la ville qui accueillera le festival.'),
      footer: (card) => createElement('button', { onClick: () => card.run(action) }, 'Confirmer'),
    };
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opens an accessible native dialog and applies a decision only after the card leaves', async () => {
    await render({ status: createElement('span', null, '20 secondes') });
    const dialog = host.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe(
      props.title,
    );
    expect(document.activeElement).toBe(host.querySelector('h2'));
    expect(host.querySelector('.action-card-status')?.textContent).toBe('20 secondes');
    expect(host.querySelector('.drawn-card-back')).not.toBeNull();
    await click();
    expect(dialog.classList.contains('is-leaving')).toBe(true);
    expect(dialog.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('fieldset')!.disabled).toBe(true);
    await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS - 1));
    expect(action).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTime(1));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('freezes the selected action across countdown rerenders and ignores double clicks', async () => {
    await render();
    await click();
    const nextAction = vi.fn();
    await render({
      status: createElement('span', null, '19 secondes'),
      footer: (card) =>
        createElement('button', { onClick: () => card.run(nextAction) }, 'Confirmer'),
    });
    await click();
    expect(host.querySelector('dialog')!.classList.contains('is-leaving')).toBe(true);
    await act(() => vi.runAllTimers());
    expect(action).toHaveBeenCalledTimes(1);
    expect(nextAction).not.toHaveBeenCalled();
  });

  it('cancels pending decisions when a different turn or player replaces the card', async () => {
    await render();
    await click();
    await render({ cardKey: 'festival:2:sam', title: 'Au tour de Sam' });
    expect(host.querySelector('dialog')!.classList.contains('is-leaving')).toBe(false);
    expect(host.querySelector('fieldset')!.disabled).toBe(false);
    await act(() => vi.runAllTimers());
    expect(action).not.toHaveBeenCalled();
  });

  it('cancels pending decisions on unmount', async () => {
    await render();
    await click();
    await act(() => root.render(null));
    await act(() => vi.runAllTimers());
    expect(action).not.toHaveBeenCalled();
  });

  it('ignores the timer after animation completion and rearms a retained decision', async () => {
    await render();
    await click();
    await animationEnd();
    expect(action).toHaveBeenCalledTimes(1);
    await act(() => vi.runAllTimers());
    expect(action).toHaveBeenCalledTimes(1);
    expect(host.querySelector('dialog')!.classList.contains('is-leaving')).toBe(false);
    expect(host.querySelector('fieldset')!.disabled).toBe(false);
    expect(document.activeElement).toBe(host.querySelector('h2'));
    await click();
    await act(() => vi.runAllTimers());
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('uses the same departure for Escape when an optional close action exists', async () => {
    const onClose = vi.fn();
    await render({ onClose });
    const event = new Event('cancel', { cancelable: true });
    await act(() => host.querySelector('dialog')!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    await act(() => vi.runAllTimers());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('provides a visible close control that shares the single departure lock', async () => {
    const onClose = vi.fn();
    await render({ onClose });
    const close = host.querySelector<HTMLButtonElement>('.action-card-close')!;
    expect(close.getAttribute('aria-label')).toBe('Fermer');
    await act(() => close.click());
    expect(close.disabled).toBe(true);
    await act(() => close.click());
    await act(() => vi.runAllTimers());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });

  it('keeps mandatory choices open on Escape without discarding the decision', async () => {
    await render();
    const dialog = host.querySelector('dialog')!;
    const event = new Event('cancel', { cancelable: true });
    await act(() => dialog.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);
    expect(dialog.classList.contains('is-leaving')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('minimizes locally without scheduling a departure or applying a game action', async () => {
    const onMinimize = vi.fn();
    await render({ onMinimize });
    const control = host.querySelector<HTMLButtonElement>('.action-card-minimize')!;
    expect(control.getAttribute('aria-label')).toBe('Réduire pour voir le plateau');
    expect(control.getAttribute('type')).toBe('button');
    await act(() => control.click());
    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
    expect(host.querySelector('dialog')!.classList.contains('is-leaving')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('minimizes on Escape when there is no close action', async () => {
    const onMinimize = vi.fn();
    await render({ onMinimize });
    const event = new Event('cancel', { cancelable: true });
    await act(() => host.querySelector('dialog')!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the close action priority on Escape when both controls exist', async () => {
    const onClose = vi.fn();
    const onMinimize = vi.fn();
    await render({ onClose, onMinimize });
    expect(host.querySelector('.action-card-minimize')).not.toBeNull();
    expect(host.querySelector('.action-card-close')).not.toBeNull();
    await act(() => host.querySelector('dialog')!.dispatchEvent(new Event('cancel')));
    expect(onMinimize).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await act(() => vi.runAllTimers());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('blocks minimize and Escape while an outgoing decision is pending', async () => {
    const onMinimize = vi.fn();
    await render({ onMinimize });
    await act(() => host.querySelector<HTMLButtonElement>('.action-card-footer button')!.click());
    const control = host.querySelector<HTMLButtonElement>('.action-card-minimize')!;
    expect(control.disabled).toBe(true);
    await act(() => {
      control.click();
      host.querySelector('dialog')!.dispatchEvent(new Event('cancel'));
    });
    expect(onMinimize).not.toHaveBeenCalled();
    await act(() => vi.runAllTimers());
    expect(action).toHaveBeenCalledTimes(1);
    expect(control.disabled).toBe(false);
  });

  it('does not add a minimize control to cards that cannot be minimized', async () => {
    await render();
    expect(host.querySelector('.action-card-minimize')).toBeNull();
  });

  it.each(['comfort', 'OS'])(
    'applies the decision immediately when reduced motion comes from %s',
    async (source) => {
      if (source === 'OS') {
        vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
      }
      await render({ reducedMotion: source === 'comfort' });
      await click();
      expect(action).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      expect(host.querySelector('fieldset')!.disabled).toBe(false);
    },
  );

  it('exposes the same decision controller to nested views and restores opener focus', async () => {
    function NestedChoice() {
      const card = useActionCard();
      return createElement('button', { onClick: () => card.run(action) }, 'Partir');
    }
    const opener = document.createElement('button');
    document.body.prepend(opener);
    opener.focus();
    try {
      await render({ children: createElement(NestedChoice), footer: undefined });
      await click();
      await act(() => vi.runAllTimers());
      expect(action).toHaveBeenCalledTimes(1);
      await act(() => root.render(null));
      expect(document.activeElement).toBe(opener);
    } finally {
      opener.remove();
    }
  });

  it('contains Tab focus within the card and skips disabled controls', async () => {
    await render({
      children: createElement('button', { disabled: true }, 'Indisponible'),
    });
    const content = host.querySelector<HTMLElement>('.action-card-content')!;
    const button = host.querySelector<HTMLButtonElement>('.action-card-footer button')!;
    vi.spyOn(content, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    vi.spyOn(button, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    button.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    await act(() => button.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(content);
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(() => content.dispatchEvent(shiftTab));
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button);
  });
});
