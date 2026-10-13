import { normalizeBoardZoom } from './camera';

/** Scope two-finger zoom to the board; one finger can still scroll the page. */
export function bindPinchZoom(
  element: HTMLElement,
  getZoom: () => number,
  onZoom: (value: number) => void,
): () => void {
  let gesture: { ids: number[]; distance: number; zoom: number } | null = null;
  let consumed = false;
  let suppressUntil = 0;
  const distance = (touches: TouchList, ids: number[]) => {
    const points = Array.from(touches).filter((touch) => ids.includes(touch.identifier));
    return points.length === 2
      ? Math.hypot(points[1]!.clientX - points[0]!.clientX, points[1]!.clientY - points[0]!.clientY)
      : 0;
  };
  const start = (event: TouchEvent) => {
    if (event.touches.length < 2 || gesture) return;
    const ids = Array.from(event.touches)
      .slice(0, 2)
      .map((touch) => touch.identifier);
    const span = distance(event.touches, ids);
    if (!span) return;
    event.preventDefault();
    consumed = true;
    gesture = { ids, distance: span, zoom: getZoom() };
  };
  const move = (event: TouchEvent) => {
    if (!gesture) return;
    event.preventDefault();
    const span = distance(event.touches, gesture.ids);
    if (span) onZoom(normalizeBoardZoom((gesture.zoom * span) / gesture.distance));
  };
  const end = (event: TouchEvent) => {
    if (!consumed) return;
    if (event.cancelable) event.preventDefault();
    if (gesture && !distance(event.touches, gesture.ids)) gesture = null;
    if (!event.touches.length) {
      consumed = false;
      gesture = null;
      suppressUntil = Date.now() + 400;
    }
  };
  const click = (event: MouseEvent) => {
    if (!consumed && Date.now() >= suppressUntil) return;
    event.preventDefault();
    event.stopPropagation();
  };
  element.addEventListener('touchstart', start, { passive: false });
  element.addEventListener('touchmove', move, { passive: false });
  element.addEventListener('touchend', end, { passive: false });
  element.addEventListener('touchcancel', end, { passive: false });
  element.addEventListener('click', click, true);
  return () => {
    element.removeEventListener('touchstart', start);
    element.removeEventListener('touchmove', move);
    element.removeEventListener('touchend', end);
    element.removeEventListener('touchcancel', end);
    element.removeEventListener('click', click, true);
  };
}
