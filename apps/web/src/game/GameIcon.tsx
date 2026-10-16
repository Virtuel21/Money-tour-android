import type { CSSProperties } from 'react';
import './game-icons.css';

const paths = {
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm4 5-3 5-5 3 3-5 5-3Z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm2.5 5H11a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9.5M12 6v12',
  house: 'm3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7',
  hotel: 'M5 21V5h14v16M3 21h18M9 8h1m4 0h1M9 12h1m4 0h1M10 21v-5h4v5M9 2h6',
  island:
    'M3 20q9-7 18 0M11 18q3-6 1-12M12 7Q7 0 3 8q5-3 9-1Zm0 0q4-8 9-1-6-1-9 1Zm0 0q6 0 7 6-4-4-7-6',
  trophy: 'M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v5M8 21h8',
  target: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l9-9m-5 0h5v5',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  book: 'M12 5Q7 1 3 4v16q4-3 9 0 5-3 9 0V4q-4-3-9 1v15',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6M12 7v.2',
  shield: 'm12 2 8 3v6c0 5-4 8-8 11-4-3-8-6-8-11V5l8-3Zm-4 9 3 3 5-6',
  dice: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM8 8v.1m8-.1v.1M12 12v.1M8 16v.1m8-.1v.1',
  settings:
    'm9 3-.5 3-2 1-3-.5-2 3 2 2v2l-2 2 2 3 3-.5 2 1 .5 3h4l.5-3 2-1 3 .5 2-3-2-2v-2l2-2-2-3-3 .5-2-1-.5-3H9Zm3 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  close: 'm6 6 12 12M6 18 18 6',
  arrowLeft: 'm14 5-7 7 7 7M7 12h14',
  arrowRight: 'm10 5 7 7-7 7M3 12h14',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l4 2',
  pause: 'M8 4v16M16 4v16',
  play: 'm7 3 14 9-14 9V3Z',
  exit: 'M10 3H4v18h6m5-14 5 5-5 5M9 12h11',
  journal: 'M5 3h14v18H5V3Zm4 5h6m-6 4h6m-6 4h4',
  people:
    'M9 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4 5v2',
  flag: 'M5 22V3m0 1q4-3 8 0t7 0v9q-3 3-7 0t-8 0',
  sparkles: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z',
  speed: 'M3 17a9 9 0 0 1 18 0M12 16l5-7M6 12l1 1m10 0 1-1M12 6v2',
  lock: 'M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 5v2',
  card: 'M5 3h14v18H5V3Zm7 5 4 4-4 4-4-4 4-4Z',
  warning: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v.2',
  bug: 'M8 10h8v7a4 4 0 0 1-8 0v-7Zm1 0V8a3 3 0 0 1 6 0v2M9 5 7 3m8 2 2-2M4 10l4 2m8 0 4-2M3 16h5m8 0h5M5 22l4-3m6 0 4 3M12 11v9',
  music:
    'M9 18V5l11-2v13M9 8l11-2M9 18a3 2 0 1 1-6 0 3 2 0 0 1 6 0Zm11-2a3 2 0 1 1-6 0 3 2 0 0 1 6 0Z',
  trendDown: 'm3 5 6 6 4-4 8 10m-7 0h7v-7M3 21h18',
} as const;
export type GameIconName = keyof typeof paths;

/** One rounded, ink-like line family. Nearby text carries accessible meaning. */
export function GameIcon({
  name,
  className = '',
  style,
}: {
  name: GameIconName;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={`game-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
