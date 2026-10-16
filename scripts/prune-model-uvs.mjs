/** Losslessly remove unused UV buffers from solid-color Blender models. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  assert(!gltf.animations && !gltf.skins && !gltf.images, 'Only static solid models');
  const binary = bytes.subarray(28 + jsonLength);
  const usedAccessors = new Set();
  for (const mesh of gltf.meshes)
    for (const primitive of mesh.primitives) {
      assert(!primitive.targets, 'Morph targets require their own accessor accounting');
      for (const attribute of Object.keys(primitive.attributes))
        if (attribute.startsWith('TEXCOORD_')) delete primitive.attributes[attribute];
      Object.values(primitive.attributes).forEach((index) => usedAccessors.add(index));
      if (primitive.indices !== undefined) usedAccessors.add(primitive.indices);
    }
  const accessors = [...usedAccessors].sort((a, b) => a - b);
  const accessorMap = new Map(accessors.map((index, i) => [index, i]));
  const views = [...new Set(accessors.map((i) => gltf.accessors[i].bufferView))].sort(
    (a, b) => a - b,
  );
  const viewMap = new Map(views.map((index, i) => [index, i]));
  const parts = [];
  let offset = 0;
  gltf.bufferViews = views.map((index) => {
    const view = gltf.bufferViews[index];
    assert.equal(view.buffer, 0);
    const part = Buffer.alloc(Math.ceil(view.byteLength / 4) * 4);
    binary.copy(part, 0, view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    parts.push(part);
    const result = { ...view, byteOffset: offset };
    offset += part.length;
    return result;
  });
  gltf.accessors = accessors.map((index) => {
    const accessor = gltf.accessors[index];
    assert(!accessor.sparse);
    return { ...accessor, bufferView: viewMap.get(accessor.bufferView) };
  });
  for (const mesh of gltf.meshes)
    for (const primitive of mesh.primitives) {
      for (const attribute of Object.keys(primitive.attributes))
        primitive.attributes[attribute] = accessorMap.get(primitive.attributes[attribute]);
      if (primitive.indices !== undefined) primitive.indices = accessorMap.get(primitive.indices);
    }
  gltf.buffers = [{ byteLength: offset }];
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const header = Buffer.alloc(20);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + offset, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(offset);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const output = Buffer.concat([header, padded, binHeader, ...parts]);
  writeFileSync(file, output);
  console.log(
    `${file}: ${bytes.length} → ${output.length} bytes; positions, normals and indices unchanged`,
  );
}
