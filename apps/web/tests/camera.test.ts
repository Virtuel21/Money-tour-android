import { describe, expect, it } from 'vitest';
import { cameraBounds, cameraZoom, followPlayer } from '../src/board/camera';

describe('mobile camera', () => {
  it('applies personal zoom to desktop framing and mobile following without changing the aspect ratio', () => {
    const desktop = cameraBounds(1920, 1080, false);
    const mobile = cameraBounds(390, 480, true);
    expect(cameraZoom(desktop.halfWidth, false, 100, false)).toBe(1);
    expect(cameraZoom(desktop.halfWidth, false, 150, false)).toBe(1.5);
    expect(cameraZoom(mobile.halfWidth, true, 150, false)).toBeCloseTo(
      cameraZoom(mobile.halfWidth, true, 100, false) * 1.5,
    );
  });
  it('keeps every tile in frame when choosing a destination, bidding, or highlighting a collection', () => {
    expect(cameraZoom(17, true, 400, true)).toBe(1);
    expect(cameraZoom(17, false, 70, true)).toBe(0.7);
  });
  it('renders the full extended zoom range in overview and follow mode', () => {
    const { halfWidth } = cameraBounds(390, 480, true);
    expect(cameraZoom(halfWidth, false, 400, false)).toBe(4);
    expect(cameraZoom(halfWidth, true, 400, false)).toBeCloseTo(
      cameraZoom(halfWidth, true, 100, false) * 4,
    );
  });
  it.each([
    [1440, 900],
    [3440, 1440],
    [1024, 768],
  ])('uses desktop space without stretching at %s × %s', (w, h) => {
    const bounds = cameraBounds(w, h, false);
    expect(bounds.halfWidth / bounds.halfHeight).toBeCloseTo(w / h);
    expect(bounds.halfWidth).toBeGreaterThanOrEqual(17);
  });
  it.each([
    [320, 220],
    [390, 480],
    [844, 240],
    [768, 760],
  ])('fits the complete board without distortion at %s × %s', (w, h) => {
    const b = cameraBounds(w, h, true);
    expect(b.halfWidth).toBeGreaterThanOrEqual(17);
    expect(b.halfHeight).toBeGreaterThanOrEqual(12 - 1e-10);
    expect(b.halfWidth / b.halfHeight).toBeCloseTo(w / h);
  });
  const turn = {
    mobile: true,
    overview: false,
    selecting: false,
    phase: 'roll',
    cue: 'settle',
    bot: false,
    active: 'p1',
    winner: false,
  };
  it('follows the local human and the online seat only on their turn', () => {
    expect(followPlayer(turn)).toBe(true);
    expect(followPlayer({ ...turn, self: 'p1', cue: 'hop' })).toBe(true);
    expect(followPlayer({ ...turn, self: 'p2' })).toBe(false);
    expect(followPlayer({ ...turn, bot: true })).toBe(false);
  });
  it.each([
    { overview: true },
    { selecting: true },
    { phase: 'end' },
    { phase: 'auction' },
    { cue: 'turn' },
    { winner: true },
    { mobile: false },
  ])('returns to the overview for %j', (override) => {
    expect(followPlayer({ ...turn, ...override })).toBe(false);
  });
});
