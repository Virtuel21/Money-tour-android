import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { Box3, Vector3, Matrix4, Quaternion } = await import(
  pathToFileURL(require.resolve('three').replace('three.cjs', 'three.module.js'))
);
const bytes = readFileSync(new URL('../apps/web/public/models/money-tour.glb', import.meta.url));
assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
let gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
const bounds = {};
function visit(index, parent, box) {
  const node = gltf.nodes[index];
  const local = node.matrix
    ? new Matrix4().fromArray(node.matrix)
    : new Matrix4().compose(
        new Vector3(...(node.translation ?? [0, 0, 0])),
        new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
        new Vector3(...(node.scale ?? [1, 1, 1])),
      );
  const world = parent.clone().multiply(local);
  if (node.mesh !== undefined)
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      assert(accessor.min?.every(Number.isFinite) && accessor.max?.every(Number.isFinite));
      box.union(
        new Box3(new Vector3(...accessor.min), new Vector3(...accessor.max)).applyMatrix4(world),
      );
    }
  node.children?.forEach((child) => visit(child, world, box));
}
for (const name of [
  'board',
  'tile',
  'die',
  'palm',
  'chance',
  'start',
  'travel',
  'tax',
  'championship',
  'plot',
]) {
  const index = gltf.nodes.findIndex((node) => node.name === name);
  assert(index >= 0, `Missing Blender root ${name}`);
  const box = new Box3();
  visit(index, new Matrix4(), box);
  bounds[name] = box;
  assert(!box.isEmpty(), `Empty model ${name}`);
}
assert(bounds.board.getSize(new Vector3()).x >= 16.6);
assert(bounds.tile.getSize(new Vector3()).x >= 1.68);
assert.equal(gltf.scenes.length, 1, 'Only the Money Tour asset scene may be exported');
assert.equal(gltf.scenes[0].nodes.length, 10, 'No unrelated Blender objects may be exported');
for (const [file, roots] of [
  ['wealth', ['banknote_bundle', 'gold_bar']],
  ['fortune', ['casino_roulette', 'casino_slots', 'insurance_shield', 'karma_scale']],
]) {
  const data = readFileSync(new URL(`../apps/web/public/models/${file}.glb`, import.meta.url));
  assert.equal(data.toString('utf8', 0, 4), 'glTF');
  gltf = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
  assert.equal(gltf.scenes.length, 1);
  assert.equal(gltf.scenes[0].nodes.length, roots.length);
  for (const name of roots) {
    const index = gltf.nodes.findIndex((node) => node.name === name);
    assert(index >= 0 && gltf.scenes[0].nodes.includes(index), `Missing root ${name}`);
    const box = new Box3();
    visit(index, new Matrix4(), box);
    const size = box.getSize(new Vector3());
    assert(
      [size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0),
      `Invalid model ${name}`,
    );
  }
}
const boardBytes = readFileSync(
  new URL('../apps/web/public/models/board-layout.glb', import.meta.url),
);
assert.equal(boardBytes.toString('utf8', 0, 4), 'glTF');
const board = JSON.parse(boardBytes.toString('utf8', 20, 20 + boardBytes.readUInt32LE(12)));
assert.equal(board.scenes.length, 1);
assert.deepEqual(board.scenes[0].nodes.map((i) => board.nodes[i].name).sort(), [
  'board_26',
  'board_28',
  'board_30',
  'board_32',
  'board_surfaces',
]);
assert.equal(board.images.length, 18, 'All original lossless surface swatches must be embedded');
assert(boardBytes.length < 500_000, 'Board geometry and swatches must stay below 500 kB');
console.log(
  '16 Blender piece roots, four authored board layouts and 18 embedded surface textures verified. Visual QA separately checks rendering and interaction.',
);
