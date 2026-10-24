const textInputTypes = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);
const margin = 12;

function editable(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLInputElement)
    return !element.disabled && !element.readOnly && textInputTypes.has(element.type);
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  return element instanceof HTMLElement && element.isContentEditable;
}

/** The Android IME can finish resizing after the browser's initial caret reveal. */
export function installFocusedFieldReveal(): () => void {
  let frame: number | null = null;
  const viewport = window.visualViewport;
  const reveal = () => {
    frame = null;
    const element = document.activeElement;
    if (!editable(element) || !element.isConnected) return;
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const top = Math.max(0, viewport?.offsetTop ?? 0) + margin;
    const left = Math.max(0, viewport?.offsetLeft ?? 0) + margin;
    const bottom =
      Math.min(innerHeight, (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight)) -
      margin;
    const right =
      Math.min(innerWidth, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth)) - margin;
    if (bounds.top < top || bounds.bottom > bottom || bounds.left < left || bounds.right > right)
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  };
  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(reveal);
  };
  document.addEventListener('focusin', schedule);
  window.addEventListener('resize', schedule);
  viewport?.addEventListener('resize', schedule);
  schedule();
  return () => {
    document.removeEventListener('focusin', schedule);
    window.removeEventListener('resize', schedule);
    viewport?.removeEventListener('resize', schedule);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
}
