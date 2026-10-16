import type { KeyboardEvent } from 'react';

export function restoreDialogFocus(opener: Element | null) {
  const top = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (opener instanceof HTMLElement && opener.isConnected && (!top || top.contains(opener)))
    opener.focus({ preventScroll: true });
}

/** Native dialogs make the background inert; keep Tab on visible dialog controls at both ends. */
export function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
  const dialog = event.currentTarget;
  const controls = [
    ...dialog.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], summary, [tabindex]',
    ),
  ].filter(
    (element) =>
      element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0,
  );
  const first = controls[0],
    last = controls.at(-1);
  if (!first) {
    event.preventDefault();
    dialog.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last!.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
