import type { CSSProperties } from 'react';

export const CARD_ARRIVE_MS = 1500;
export const CARD_EXIT_MS = 800;

/** Keep CSS animation and the pending-action fallback on the same shared rhythm. */
export const CARD_MOTION_STYLE = {
  '--card-arrive-duration': `${CARD_ARRIVE_MS}ms`,
  '--card-exit-duration': `${CARD_EXIT_MS}ms`,
} as CSSProperties;
