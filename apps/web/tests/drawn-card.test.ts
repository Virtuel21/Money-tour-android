// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAWN_CARD_EXIT_MS, DrawnCard, type DrawnCardProps } from '../src/game/DrawnCard';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

describe('physical drawn cards', () => {
  let host: HTMLDivElement;
  let root: Root;
  let onDismiss: ReturnType<typeof vi.fn<() => void>>;
  let props: DrawnCardProps;
  const render = (overrides: Partial<DrawnCardProps> = {}) =>
    act(() => root.render(createElement(DrawnCard, { ...props, ...overrides })));
  const clickContinue = () => act(() => host.querySelector('button')!.click());

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    onDismiss = vi.fn();
    props = {
      cardKey: 'draw:1',
      title: 'Une surprise vous attend',
      description: 'Recevez 100 pièces.',
      ownerLabel: 'Carte de Camille',
      actionLabel: 'J’ai lu · continuer',
      onDismiss,
    };
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shows an accessible native card dialog and holds dismissal until its departure finishes', async () => {
    await render();
    const dialog = host.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe(
      props.title,
    );
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe(
      props.description,
    );
    expect(document.activeElement).toBe(host.querySelector('.drawn-card-copy h2'));
    expect(host.querySelector('img')!.alt).toBe('');
    await clickContinue();
    expect(dialog.classList.contains('is-leaving')).toBe(true);
    expect(host.querySelector('button')!.disabled).toBe(true);
    await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS - 1));
    expect(onDismiss).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses the same departure for Escape and ignores repeated dismissal requests', async () => {
    await render();
    const dialog = host.querySelector('dialog')!;
    const cancel = new Event('cancel', { cancelable: true });
    await act(() => dialog.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    await act(() => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
    await clickContinue();
    await act(() => vi.advanceTimersByTime(DRAWN_CARD_EXIT_MS));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('completes only once when the animation event fires before the fallback timer', async () => {
    await render();
    await clickContinue();
    const animationEnd = new Event('animationend', { bubbles: true });
    Object.defineProperty(animationEnd, 'animationName', { value: 'drawn-card-depart' });
    await act(() => host.querySelector('.drawn-card-motion')!.dispatchEvent(animationEnd));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await act(() => vi.runAllTimers());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it.each(['comfort', 'OS'])(
    'dismisses immediately with reduced motion from %s',
    async (source) => {
      if (source === 'OS') {
        vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
      }
      await render({ reducedMotion: source === 'comfort' });
      await clickContinue();
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('cancels a previous draw’s departure when a new draw replaces it', async () => {
    await render();
    await clickContinue();
    const nextDismiss = vi.fn();
    await render({ cardKey: 'draw:2', title: 'La carte suivante', onDismiss: nextDismiss });
    expect(host.querySelector('dialog')!.classList.contains('is-leaving')).toBe(false);
    expect(host.querySelector('button')!.disabled).toBe(false);
    await act(() => vi.runAllTimers());
    expect(onDismiss).not.toHaveBeenCalled();
    expect(nextDismiss).not.toHaveBeenCalled();
    await clickContinue();
    await act(() => vi.runAllTimers());
    expect(nextDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not leave a dismissal callback alive after unmount', async () => {
    await render();
    await clickContinue();
    await act(() => root.render(null));
    await act(() => vi.runAllTimers());
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('supports tax content and restores focus to the still-connected opener', async () => {
    const opener = document.createElement('button');
    document.body.prepend(opener);
    opener.focus();
    try {
      await render({
        title: 'Passage à la caisse',
        tone: 'tax',
        description: undefined,
        artwork: '/textures/tax-tile-v2.webp',
        children: createElement('strong', null, '100 pièces'),
      });
      expect(host.querySelector('dialog')!.classList.contains('drawn-card-tax')).toBe(true);
      expect(host.querySelector('dialog')!.hasAttribute('aria-describedby')).toBe(false);
      expect(host.querySelector('.drawn-card-detail')!.textContent).toBe('100 pièces');
      await act(() => root.render(null));
      expect(document.activeElement).toBe(opener);
    } finally {
      opener.remove();
    }
  });
});
