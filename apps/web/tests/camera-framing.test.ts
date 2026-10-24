import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { cameraBounds, cameraFrustum, zoomFrustum } from '../src/board/camera';

describe('full screen board with a HUD framing cell', () => {
  for (const [width, height, frame] of [
    [390, 844, { left: 8, top: 240, width: 374, height: 350 }],
    [844, 390, { left: 123, top: 119, width: 532, height: 213 }],
  ] as const) {
    for (const zoom of [1, 2.43, 9.72])
      it(`preserves focus and world scale at zoom ${zoom} while drawing beyond ${width}x${height}`, () => {
        const base = cameraFrustum({ left: 0, top: 0, width, height }, frame, true);
        const bounds = zoomFrustum(base, zoom);
        const original = cameraBounds(frame.width, frame.height, true);
        expect(base.left).toBeLessThan(-original.halfWidth);
        expect(base.right).toBeGreaterThan(original.halfWidth);
        expect(base.top).toBeGreaterThan(original.halfHeight);
        expect(base.bottom).toBeLessThan(-original.halfHeight);
        expect(base.framingHalfWidth).toBe(original.halfWidth);
        const camera = new OrthographicCamera(bounds.left, bounds.right, bounds.top, bounds.bottom);
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
        const at = (x: number, y: number) => {
          const p = new Vector3(x, y, -1).project(camera);
          return { x: ((p.x + 1) * width) / 2, y: ((1 - p.y) * height) / 2 };
        };
        const center = at(0, 0);
        expect(center.x).toBeCloseTo(frame.left + frame.width / 2);
        expect(center.y).toBeCloseTo(frame.top + frame.height / 2);
        const right = at(1, 0);
        expect(right.x - center.x).toBeCloseTo((frame.width * zoom) / (2 * original.halfWidth));
        const up = at(0, 1);
        expect(center.y - up.y).toBeCloseTo((frame.height * zoom) / (2 * original.halfHeight));
      });
  }

  it('retains the exact desktop frustum when the canvas is its own frame', () => {
    const rect = { left: 280, top: 180, width: 880, height: 640 };
    const bounds = cameraFrustum(rect, rect, false);
    const original = cameraBounds(rect.width, rect.height, false);
    expect(bounds.left).toBe(-original.halfWidth);
    expect(bounds.right).toBe(original.halfWidth);
    expect(bounds.top).toBe(original.halfHeight);
    expect(bounds.bottom).toBe(-original.halfHeight);
  });

  it('also preserves focus with overscan beyond the screen during a camera shake', () => {
    const canvas = { left: -6, top: -6, width: 402, height: 856 };
    const frame = { left: 8, top: 240, width: 374, height: 350 };
    const bounds = zoomFrustum(cameraFrustum(canvas, frame, true), 9.72);
    const camera = new OrthographicCamera(bounds.left, bounds.right, bounds.top, bounds.bottom);
    camera.zoom = 9.72;
    camera.updateProjectionMatrix();
    const point = new Vector3(0, 0, -1).project(camera);
    expect(canvas.left + ((point.x + 1) * canvas.width) / 2).toBeCloseTo(195);
    expect(canvas.top + ((1 - point.y) * canvas.height) / 2).toBeCloseTo(415);
  });
});
