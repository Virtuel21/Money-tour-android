import { expect, it } from 'vitest';
import { Texture, Vector2 } from 'three';
import { shorelineArtwork } from '../src/board/boardModel';
import { tileFrame } from '../src/board/layout';

it.each([26, 28, 30, 32])('turns every %i-cell shoreline toward the lagoon', (count) => {
  const source = new Texture();
  source.flipY = false;
  for (let id = 0; id < count; id++) {
    const tile = tileFrame(id, count);
    const map = shorelineArtwork(source, tile.side);
    map.updateMatrix();
    // Project the inward edge through the actual texture transform: it must
    // sample the blue top band, rather than the sand or a neighbouring tile.
    const uv = new Vector2(0.5 - tile.normal.x * 0.5, 0.5 - tile.normal.z * 0.5);
    uv.applyMatrix3(map.matrix);
    expect(uv.x).toBeCloseTo(0.5);
    expect(uv.y).toBeCloseTo(0);
  }
  expect(source.rotation).toBe(0);
  expect(source.center.toArray()).toEqual([0, 0]);
});
