import { normalizeBoardZoom } from './camera';

/** Keep taps, one-finger pan and two-finger zoom distinct on the board. */
export function bindPinchZoom(
  element: HTMLElement,
  getZoom: () => number,
  onZoom: (value: number) => void,
  pan?: { enabled: () => boolean; move: (dx: number, dy: number) => void },
): () => void {
  let gesture: { ids: number[]; distance: number; zoom: number } | null = null;
  let drag: { id: number; x: number; y: number; started: boolean } | null = null;
  let center: { x: number; y: number } | null = null;
  let consumed = false;
  let suppressUntil = 0;
  const distance = (touches: TouchList, ids: number[]) => {
    const points = Array.from(touches).filter((touch) => ids.includes(touch.identifier));
    return points.length === 2
      ? Math.hypot(points[1]!.clientX - points[0]!.clientX, points[1]!.clientY - points[0]!.clientY)
      : 0;
  };
  const start = (event: TouchEvent) => {
    if (event.touches.length === 1 && pan?.enabled()) {
      const touch = event.touches[0]!;
      drag = { id: touch.identifier, x: touch.clientX, y: touch.clientY, started: false };
      return;
    }
    if (event.touches.length < 2 || gesture) return;
    const ids = Array.from(event.touches)
      .slice(0, 2)
      .map((touch) => touch.identifier);
    const span = distance(event.touches, ids);
    if (!span) return;
    event.preventDefault();
    consumed = true;
    drag = null;
    center = {
      x: (event.touches[0]!.clientX + event.touches[1]!.clientX) / 2,
      y: (event.touches[0]!.clientY + event.touches[1]!.clientY) / 2,
    };
    gesture = { ids, distance: span, zoom: getZoom() };
  };
  const move = (event: TouchEvent) => {
    if (drag && event.touches.length === 1) {
      const touch = Array.from(event.touches).find((point) => point.identifier === drag!.id);
      if (!touch || !pan?.enabled()) return;
      const dx = touch.clientX - drag.x,
        dy = touch.clientY - drag.y;
      if (!drag.started && Math.hypot(dx, dy) < 6) return;
      event.preventDefault();
      consumed = true;
      drag = { id: touch.identifier, x: touch.clientX, y: touch.clientY, started: true };
      pan.move(dx, dy);
      return;
    }
    if (!gesture) return;
    event.preventDefault();
    const points = Array.from(event.touches).filter((touch) =>
      gesture!.ids.includes(touch.identifier),
    );
    if (points.length === 2 && center) {
      const next = {
        x: (points[0]!.clientX + points[1]!.clientX) / 2,
        y: (points[0]!.clientY + points[1]!.clientY) / 2,
      };
      if (pan?.enabled() && (next.x !== center.x || next.y !== center.y))
        pan.move(next.x - center.x, next.y - center.y);
      center = next;
    }
    const span = distance(event.touches, gesture.ids);
    if (span) onZoom(normalizeBoardZoom((gesture.zoom * span) / gesture.distance));
  };
  const end = (event: TouchEvent) => {
    drag = null;
    if (event.type === 'touchcancel') {
      gesture = null;
      center = null;
      if (consumed) suppressUntil = Date.now() + 400;
      consumed = false;
      return;
    }
    if (!consumed) return;
    if (event.cancelable) event.preventDefault();
    if (gesture && !distance(event.touches, gesture.ids)) {
      gesture = null;
      center = null;
      if (event.touches.length === 1 && pan?.enabled()) {
        const touch = event.touches[0]!;
        drag = { id: touch.identifier, x: touch.clientX, y: touch.clientY, started: true };
      }
    }
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
