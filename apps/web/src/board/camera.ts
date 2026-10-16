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
