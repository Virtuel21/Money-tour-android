import { expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { cameraBounds } from '../src/board/camera';
import { panFocus } from '../src/board/cameraPan';

it.each([
  [390, 844, 2.5],
  [844, 390, 4],
  [320, 740, 1.2],
  [390, 844, 4],
  [844, 390, 10],
  [320, 740, 10],
])('keeps a ground point under the finger at %s × %s and zoom %s', (width, height, zoom) => {
  const bounds = cameraBounds(width!, height!, true);
  const camera = new OrthographicCamera(
    -bounds.halfWidth,
    bounds.halfWidth,
    bounds.halfHeight,
    -bounds.halfHeight,
    0.1,
    80,
  );
  const focus = new Vector3(1, 0.6, -2),
    offset = new Vector3(18, 22, 18);
  camera.position.copy(focus).add(offset);
  camera.lookAt(focus);
  camera.zoom = zoom!;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const point = new Vector3(3, 0.29, 1);
  const before = point.clone().project(camera);
  const next = panFocus(camera, focus, 40, -30, width!, height!, { x: 100, z: 100 });
  camera.position.copy(next).add(offset);
  camera.lookAt(next);
  camera.updateMatrixWorld();
  const after = point.clone().project(camera);
  expect(((after.x - before.x) * width!) / 2).toBeCloseTo(40);
  expect((-(after.y - before.y) * height!) / 2).toBeCloseTo(-30);
  expect(next.y).toBeCloseTo(focus.y);
});

it('keeps the focus on the board after a very large drag', () => {
  const camera = new OrthographicCamera(-17, 17, 12, -12, 0.1, 80);
  camera.position.set(18, 22, 18);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const next = panFocus(camera, new Vector3(), 10000, -10000, 390, 300, { x: 12, z: 12 });
  expect(Math.abs(next.x)).toBeLessThanOrEqual(12);
  expect(Math.abs(next.z)).toBeLessThanOrEqual(12);
});
