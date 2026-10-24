import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEvent, GameState } from '@money-tour/engine';
import { presentation, type Cue, type PresentationPace, type SceneFrame } from './presentation';

const PASSIVE_NOTICE_MS = 4000;

export function usePresentation(
  initial: GameState,
  reduced: boolean,
  online = false,
  pace: PresentationPace = 'normal',
  paused = false,
) {
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const pausedRef = useRef(paused && !online);
  pausedRef.current = paused && !online;
  const [frame, setFrame] = useState<SceneFrame>({
    state: initial,
    cue: { kind: 'settle', duration: 0 },
  });
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Cue | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authoritative = useRef(initial),
    latest = useRef(initial);
  const queue = useRef<SceneFrame[]>([]),
    running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(0);
  const started = useRef(0);
  const readingRef = useRef(false);
  const advanceRef = useRef<() => void>(() => {});
  const advance = useCallback(() => {
    setDismissed(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    let next = queue.current.shift();
    // Reveal feedback at its chronological position, then continue the scene immediately.
    while (next?.cue.nonblocking) {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      setNotice(next.cue);
      noticeTimer.current = setTimeout(() => {
        noticeTimer.current = null;
        setNotice(null);
      }, PASSIVE_NOTICE_MS);
      next = queue.current.shift();
    }
    if (!next) {
      running.current = false;
      setBusy(false);
      setFrame({ state: latest.current, cue: { kind: 'settle', duration: 0 } });
      return;
    }
    running.current = true;
    setBusy(true);
    setFrame(next);
    const reading =
      ['card', 'tax'].includes(next.cue.kind) &&
      !onlineRef.current &&
      !next.state.players[next.state.currentPlayer]?.bot;
    readingRef.current = reading;
    remaining.current = next.cue.duration;
    started.current = Date.now();
    if (!reading && !pausedRef.current)
      timer.current = setTimeout(() => advanceRef.current(), remaining.current);
  }, []);
  advanceRef.current = advance;
  const reset = useCallback((state: GameState) => {
    setDismissed(false);
    if (timer.current) clearTimeout(timer.current);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
    setNotice(null);
    timer.current = null;
    remaining.current = 0;
    queue.current = [];
    running.current = false;
    authoritative.current = latest.current = state;
    setFrame({ state, cue: { kind: 'settle', duration: 0 } });
    setBusy(false);
  }, []);
  const present = useCallback(
    (state: GameState, events: GameEvent[]) => {
      const frames = presentation(authoritative.current, state, events, reduced, pace);
      authoritative.current = latest.current = state;
      if (frames.length) queue.current.push(...frames);
      if (!running.current) advance();
    },
    [reduced, pace, advance],
  );
  useEffect(() => {
    if (paused && !online) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        remaining.current = Math.max(0, remaining.current - (Date.now() - started.current));
      }
    } else if (running.current && !readingRef.current && !timer.current) {
      started.current = Date.now();
      timer.current = setTimeout(() => advanceRef.current(), remaining.current);
    }
  }, [paused, online]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );
  const dismiss = useCallback(() => {
    // Only hide this client's overlay online; keep the shared presentation schedule intact.
    if (onlineRef.current) setDismissed(true);
    else advance();
  }, [advance]);
  const dismissNotice = useCallback(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
    setNotice(null);
  }, []);
  return { frame, busy, present, reset, advance, dismiss, dismissed, notice, dismissNotice };
}
