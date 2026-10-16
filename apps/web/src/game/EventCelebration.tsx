import { translate } from '../i18n/translate';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameState } from '@money-tour/engine';
import type { Celebration } from './celebrations';
import type { Cue } from './presentation';
import { GameIcon } from './GameIcon';
import { colors } from './local';
import './event-celebration.css';

/** A short, nonmodal celebration never holds the presentation queue or a player decision. */
export function EventCelebration({
  cue,
  state,
  reduced,
  paused = false,
}: {
  cue: Cue;
  state: GameState;
  reduced: boolean;
  paused?: boolean;
}) {
  const [visible, setVisible] = useState<Celebration[]>([]);
  const seen = useRef(new Set<string>());
  const remaining = useRef(2800);
  const timedIds = useRef('');
  useEffect(() => {
    const fresh = cue.celebrations?.filter((item) => !seen.current.has(item.id)) ?? [];
    if (!fresh.length) return;
    fresh.forEach((item) => seen.current.add(item.id));
    // Bounded memory; only recent cue IDs can still be in a presentation queue.
    if (seen.current.size > 64) seen.current = new Set([...seen.current].slice(-32));
    setVisible(fresh);
  }, [cue]);
  useEffect(() => {
    const ids = visible.map((item) => item.id).join('|');
    if (timedIds.current !== ids) {
      timedIds.current = ids;
      remaining.current = 2800;
    }
    if (!visible.length || paused) return;
    const started = Date.now();
    const timer = setTimeout(() => setVisible([]), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [visible, paused]);
  if (!visible.length) return null;
  return (
    <div
      className={`event-celebrations${reduced ? ' motion-reduced' : ''}${paused ? ' is-paused' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {visible.map((item) => (
        <div
          key={item.id}
          className="event-celebration"
          style={
            {
              '--celebration-color':
                colors[state.players.findIndex((p) => p.id === item.playerId)] ?? colors[0],
            } as CSSProperties
          }
        >
          <span className="event-celebration-icon">
            <GameIcon
              name={
                item.kind === 'hotel' ? 'hotel' : item.kind === 'insurance' ? 'shield' : 'trophy'
              }
            />
          </span>
          <span>
            <strong>{translate(item.title)}</strong>
            <small>{translate(item.detail)}</small>
          </span>
        </div>
      ))}
    </div>
  );
}
