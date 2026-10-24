export const MIN_BOARD_ZOOM = 70;
export const MAX_BOARD_ZOOM = 400;

/** Stored preferences are untrusted; older browsers/saves simply use the original framing. */
export function normalizeBoardZoom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, Math.round(value / 5) * 5))
    : 100;
}

export function cameraZoom(
  halfWidth: number,
  following: boolean,
  percent: number,
  frameAll: boolean,
) {
  const scale = normalizeBoardZoom(percent) / 100;
  if (frameAll) return Math.min(1, scale);
  return (following ? Math.max(2.15, (halfWidth * 2) / 14) : 1) * scale;
}

/** Preserve the desktop composition; portrait view uses real, undistorted world units. */
export function cameraBounds(width: number, height: number, mobile: boolean) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const halfWidth = Math.max(17, (mobile ? 12 : 13.3) * aspect);
  return { halfWidth, halfHeight: halfWidth / aspect };
}

interface ViewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Draw beyond the HUD's framing cell without changing its scale or focus position. */
export function cameraFrustum(canvas: ViewRect, frame: ViewRect, mobile: boolean) {
  const { halfWidth, halfHeight } = cameraBounds(frame.width, frame.height, mobile);
  const unitsX = (2 * halfWidth) / Math.max(1, frame.width);
  const unitsY = (2 * halfHeight) / Math.max(1, frame.height);
  const centerX = frame.left - canvas.left + frame.width / 2;
  const centerY = frame.top - canvas.top + frame.height / 2;
  return {
    left: -centerX * unitsX,
    right: (canvas.width - centerX) * unitsX,
    top: centerY * unitsY,
    bottom: -(canvas.height - centerY) * unitsY,
    framingHalfWidth: halfWidth,
  };
}

/** Orthographic zoom must keep the focus in the framing cell, rather than the canvas center. */
export function zoomFrustum(
  bounds: { left: number; right: number; top: number; bottom: number },
  zoom: number,
) {
  const centerX = (bounds.left + bounds.right) / (2 * zoom);
  const centerY = (bounds.top + bounds.bottom) / (2 * zoom);
  const halfWidth = (bounds.right - bounds.left) / 2;
  const halfHeight = (bounds.top - bounds.bottom) / 2;
  return {
    left: centerX - halfWidth,
    right: centerX + halfWidth,
    top: centerY + halfHeight,
    bottom: centerY - halfHeight,
  };
}

export function followPlayer({
  mobile,
  overview,
  selecting,
  phase,
  cue,
  bot,
  self,
  active,
  winner,
}: {
  mobile: boolean;
  overview: boolean;
  selecting: boolean;
  phase: string;
  cue?: string;
  bot: boolean;
  self?: string;
  active: string;
  winner: boolean;
}) {
  return (
    mobile &&
    !overview &&
    !selecting &&
    !bot &&
    !winner &&
    (!self || self === active) &&
    phase !== 'end' &&
    phase !== 'auction' &&
    cue !== 'turn'
  );
}
