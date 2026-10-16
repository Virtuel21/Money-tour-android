import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { tileFrame } from '../src/board/layout';
import { tileLabelRegions } from '../src/board/tileLabels';
import { lagoonIslands, lagoonScale } from '../src/board/lagoon';

type Node = {
  name: string;
  mesh?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
};
const bytes = readFileSync(new URL('../public/models/board-layout.glb', import.meta.url));
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12))) as {
  scenes: { nodes: number[] }[];
  nodes: Node[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  accessors: { min: number[]; max: number[] }[];
};
const worlds = new Map<string, Matrix4>();
function visit(index: number, parent: Matrix4) {
  const n = gltf.nodes[index]!;
  const world = parent
    .clone()
    .multiply(
      new Matrix4().compose(
        new Vector3(...(n.translation ?? [0, 0, 0])),
        new Quaternion(...(n.rotation ?? [0, 0, 0, 1])),
        new Vector3(...(n.scale ?? [1, 1, 1])),
      ),
    );
  worlds.set(n.name, world);
  n.children?.forEach((child) => visit(child, world));
}
gltf.scenes[0]!.nodes.forEach((index) => visit(index, new Matrix4()));
function bounds(name: string) {
  const node = gltf.nodes.find((n) => n.name === name)!;
  const box = new Box3();
  for (const primitive of gltf.meshes[node.mesh!]!.primitives) {
    const accessor = gltf.accessors[primitive.attributes.POSITION!]!;
    box.union(
      new Box3(new Vector3(...accessor.min), new Vector3(...accessor.max)).applyMatrix4(
        worlds.get(name)!,
      ),
    );
  }
  return box;
}

it('exports only the four playable layouts and their embedded texture palette', () => {
  expect(bytes.toString('utf8', 0, 4)).toBe('glTF');
  expect(gltf.scenes).toHaveLength(1);
  expect(gltf.scenes[0]!.nodes.map((i) => gltf.nodes[i]!.name).sort()).toEqual([
    'board_26',
    'board_28',
    'board_30',
    'board_32',
    'board_surfaces',
  ]);
});

it.each([26, 28, 30, 32])(
  'aligns every authored surface and rent quay with the %i clickable layout',
  (count) => {
    for (let id = 0; id < count; id++) {
      const t = tileFrame(id, count);
      const surface = bounds(`surface_${count}_${id}`);
      const center = surface.getCenter(new Vector3());
      const size = surface.getSize(new Vector3());
      expect(center.x).toBeCloseTo(t.x, 4);
      expect(center.y).toBeCloseTo(0.28, 5);
      expect(center.z).toBeCloseTo(t.z, 4);
      expect(size.x).toBeCloseTo(t.width - 0.12, 4);
      expect(size.z).toBeCloseTo(t.depth - 0.12, 4);
      const quay = new Vector3().setFromMatrixPosition(worlds.get(`quay_${count}_${id}`)!);
      const label = tileLabelRegions(id, count);
      expect(quay.x).toBeCloseTo(label.rent.x, 4);
      expect(quay.z).toBeCloseTo(label.rent.z, 4);
      const uv =
        gltf.meshes[gltf.nodes.find((n) => n.name === `surface_${count}_${id}`)!.mesh!]!
          .primitives[0]!.attributes.TEXCOORD_0;
      expect(uv).toBeDefined();
    }
  },
);

it.each([26, 28, 30, 32])(
  'keeps the %i island meshes at the original sprite anchors and scale',
  (count) => {
    const normal = new Vector3(18, 22, 18).normalize();
    const right = new Vector3(0, 1, 0).cross(normal).normalize();
    const up = normal.clone().cross(right);
    lagoonIslands.forEach((p, i) => {
      const box = bounds(`island_${count}_${i}`);
      const anchor = new Vector3(p.x, 0.08, p.z)
        .addScaledVector(up, 0.45 * 3.05)
        .multiplyScalar(lagoonScale(count));
      expect(box.getCenter(new Vector3()).distanceTo(anchor)).toBeLessThan(0.00001);
    });
  },
);
