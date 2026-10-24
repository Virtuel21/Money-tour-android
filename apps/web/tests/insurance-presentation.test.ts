// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createGame, type GameEvent } from '@money-tour/engine';
import { presentation, presentationMs } from '../src/game/presentation';
import { usePresentation } from '../src/game/usePresentation';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const game = () =>
  createGame({
    players: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ],
    seed: 1,
  });

it.each(['normal', 'fast'] as const)(
  'keeps insurance arrival and placement outside the shared %s presentation clock',
  (pace) => {
    const before = game();
    const next = structuredClone(before);
    next.players[0]!.insurance = { tile: 1 };
    const events: GameEvent[] = [
      { type: 'insurance', playerId: 'a' },
      { type: 'insured_tile', playerId: 'a', tile: 1 },
    ];
    const frames = presentation(before, next, events, false, pace);
    expect(frames.map((frame) => frame.cue)).toMatchObject([
      { kind: 'notice', reason: 'insurance', nonblocking: true, duration: 0 },
      { kind: 'notice', reason: 'insured_tile', nonblocking: true, duration: 0 },
    ]);
    expect(presentationMs(events, pace)).toBe(0);
    expect(before.players[0]!.insurance).toBeUndefined();
  },
);

it.each([false, true])(
  'shows insurance confirmation while the next action can immediately animate (online=%s)',
  async (online) => {
    vi.useFakeTimers();
    const before = game();
    const next = structuredClone(before);
    next.players[0]!.insurance = { tile: 1 };
    let cinema!: ReturnType<typeof usePresentation>;
    function Harness() {
      cinema = usePresentation(before, false, online, 'fast');
      return null;
    }
    const root = createRoot(document.createElement('div'));
    try {
      await act(() => root.render(createElement(Harness)));
      await act(() => cinema.present(next, [{ type: 'insured_tile', playerId: 'a', tile: 1 }]));
      expect(cinema.notice?.reason).toBe('insured_tile');
      expect(cinema.busy).toBe(false);
      expect(cinema.frame.state.players[0]!.insurance).toEqual({ tile: 1 });
      await act(() => cinema.present(next, [{ type: 'dice', dice: [1, 2] }]));
      expect(cinema.frame.cue.kind).toBe('dice');
      expect(cinema.busy).toBe(true);
      expect(cinema.notice?.reason).toBe('insured_tile');
      await act(() => vi.advanceTimersByTime(3999));
      expect(cinema.busy).toBe(false);
      expect(cinema.notice).not.toBeNull();
      await act(() => vi.advanceTimersByTime(1));
      expect(cinema.notice).toBeNull();
    } finally {
      await act(() => root.unmount());
      vi.useRealTimers();
    }
  },
);

it('waits for movement to arrive before showing the passive insurance advice', async () => {
  vi.useFakeTimers();
  const before = game();
  const next = structuredClone(before);
  next.players[0]!.position = 1;
  next.players[0]!.insurance = { tile: null };
  let cinema!: ReturnType<typeof usePresentation>;
  function Harness() {
    cinema = usePresentation(before, false, false, 'fast');
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(() => root.render(createElement(Harness)));
    await act(() =>
      cinema.present(next, [
        { type: 'move', playerId: 'a', tile: 1, steps: 1 },
        { type: 'insurance', playerId: 'a' },
      ]),
    );
    expect(cinema.notice).toBeNull();
    expect(cinema.frame.cue.kind).toBe('hop');
    await act(() => vi.advanceTimersByTime(140));
    expect(cinema.notice?.reason).toBe('insurance');
    expect(cinema.frame.state.players[0]!.insurance).toEqual({ tile: null });
    expect(cinema.busy).toBe(false);
    await act(() => cinema.reset(before));
    expect(cinema.notice).toBeNull();
  } finally {
    await act(() => root.unmount());
    vi.useRealTimers();
  }
});
