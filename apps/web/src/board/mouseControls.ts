import { MAX_BOARD_ZOOM, MIN_BOARD_ZOOM, normalizeBoardZoom } from './camera';

/** Mouse exploration stays local to the board and preserves ordinary tile clicks. */
export function bindMouseControls(
  element: HTMLElement,
  getZoom: () => number,
  onZoom: (value: number) => void,
  pan: { enabled: () => boolean; move: (dx: number, dy: number) => void },
): () => void {
  let drag: { id: number; x: number; y: number; started: boolean } | null = null;
  let suppressUntil = 0;
  let wheelZoom = getZoom();
  let lastWheel = -Infinity;
  let lastPublishedZoom = wheelZoom;
  const wheel = (event: WheelEvent) => {
    // Keep the browser's accessibility zoom shortcut available.
    if (event.ctrlKey || event.metaKey || !event.deltaY) return;
    event.preventDefault();
    const now = performance.now();
    const current = getZoom();
    if (now - lastWheel > 200 || current !== lastPublishedZoom) wheelZoom = current;
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
    wheelZoom = Math.max(
      MIN_BOARD_ZOOM,
      Math.min(MAX_BOARD_ZOOM, wheelZoom * Math.exp(-pixels * 0.0015)),
    );
    lastWheel = now;
    lastPublishedZoom = normalizeBoardZoom(wheelZoom);
    onZoom(lastPublishedZoom);
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !pan.enabled()) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, started: false };
    // A fresh click must work immediately after the previous drag.
    suppressUntil = 0;
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id || !pan.enabled()) return;
    if (!(event.buttons & 1)) {
      end();
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.started && Math.hypot(dx, dy) < 6) return;
    event.preventDefault();
    drag = { id: drag.id, x: event.clientX, y: event.clientY, started: true };
    element.classList.add('board-is-dragging');
    pan.move(dx, dy);
  };
  const end = () => {
    if (drag?.started) suppressUntil = Date.now() + 400;
    drag = null;
    element.classList.remove('board-is-dragging');
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId === drag?.id) end();
  };
  const click = (event: MouseEvent) => {
    // Keyboard activation has no pointer detail and must remain available.
    if (!event.detail || Date.now() >= suppressUntil) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const document = element.ownerDocument;
  const window = document.defaultView;
  element.addEventListener('wheel', wheel, { passive: false });
  element.addEventListener('pointerdown', down);
  element.addEventListener('click', click, true);
  document.addEventListener('pointermove', move, { passive: false });
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
  window?.addEventListener('blur', end);
  return () => {
    end();
    element.removeEventListener('wheel', wheel);
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('click', click, true);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    window?.removeEventListener('blur', end);
  };
}
