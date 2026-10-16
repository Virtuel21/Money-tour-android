// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { loadComfort, saveComfort } from '../src/game/comfort';

afterEach(() => localStorage.removeItem('money-tour.comfort'));

it('restores the personal zoom without losing existing comfort choices', () => {
  saveComfort({ pace: 'fast', largeText: true, boardZoom: 135 });
  expect(loadComfort()).toEqual({ pace: 'fast', largeText: true, boardZoom: 135 });
});

it('preserves the original camera for preferences written before zoom existed', () => {
  localStorage.setItem('money-tour.comfort', JSON.stringify({ pace: 'fast', largeText: true }));
  expect(loadComfort()).toEqual({ pace: 'fast', largeText: true, boardZoom: 100 });
  localStorage.setItem('money-tour.comfort', '{invalid');
  expect(loadComfort().boardZoom).toBe(100);
});

it('rejects malformed zoom and bounds stale preferences so the board cannot disappear', () => {
  for (const [value, expected] of [
    [null, 100],
    ['150', 100],
    [-500, 70],
    [999999, 400],
  ]) {
    localStorage.setItem('money-tour.comfort', JSON.stringify({ boardZoom: value }));
    expect(loadComfort().boardZoom).toBe(expected);
  }
});

it('persists the extended zoom range', () => {
  saveComfort({ pace: 'normal', largeText: false, boardZoom: 400 });
  expect(loadComfort().boardZoom).toBe(400);
});
