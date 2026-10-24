import * as THREE from 'three';
import type { Tile } from '@money-tour/engine';
import { streetSurface } from './surfaces';
import { tileFrame } from './layout';

/** Blender owns all board geometry; the game only binds artwork and live state. */
export function boardModel(source: THREE.Group, tiles: Tile[], anisotropy: number) {
  const count = tiles.length;
  const root = source.getObjectByName(`board_${count}`);
  if (!root) throw new Error(`Plateau Blender absent : ${count} cases`);
  const mesh = (kind: string, id: number) => {
    const object = root.getObjectByName(`${kind}_${count}_${id}`);
    if (!(object instanceof THREE.Mesh)) throw new Error(`Pièce Blender absente : ${kind}/${id}`);
    return object;
  };
  const surfaces = new Map<string, THREE.MeshStandardMaterial>();
  source.getObjectByName('board_surfaces')?.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.surfaceKey) {
      const material = object.material as THREE.MeshStandardMaterial;
      if (material.map) material.map.anisotropy = Math.min(8, anisotropy);
      surfaces.set(object.userData.surfaceKey, material);
    }
  });
  const trims: THREE.Mesh[] = [];
  const borders: THREE.Mesh[] = [];
  const rentQuays = new Map<number, THREE.Object3D>();
  const cells = tiles.map((tile) => {
    const extra = tile.type === 'casino' || tile.type === 'karma';
    const surface = mesh(extra ? 'icon' : 'surface', tile.id);
    mesh(extra ? 'surface' : 'icon', tile.id).visible = false;
    const key = `${tile.type}:${tile.group ?? ''}:${tile.color ?? ''}`;
    const baked = surfaces.get(key);
    // Old saves may carry colors outside the authored palette.
    if (baked) surface.material = baked;
    else {
      const map = streetSurface(tile);
      map.flipY = false;
      surface.material = new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
    }
    if (tile.type === 'resort' || tile.type === 'island') {
      const material = (surface.material as THREE.MeshStandardMaterial).clone();
      if (material.map)
        material.map = shorelineArtwork(material.map, tileFrame(tile.id, count).side);
      surface.material = material;
    }
    const backdrop = mesh('backdrop', tile.id);
    backdrop.visible = extra;
    const trim = mesh('trim', tile.id);
    trim.material = (trim.material as THREE.MeshStandardMaterial).clone();
    trims.push(trim);
    const border = mesh('selection', tile.id);
    border.material = (border.material as THREE.MeshStandardMaterial).clone();
    border.visible = false;
    borders.push(border);
    const quay = root.getObjectByName(`quay_${count}_${tile.id}`)!;
    quay.visible = false;
    if (tile.type === 'city' || tile.type === 'resort') rentQuays.set(tile.id, quay);
    const wreck = mesh('wreck', tile.id);
    wreck.visible = tile.type === 'island';
    return { surface, wreck };
  });
  const foam = new THREE.MeshBasicMaterial({
    color: '#b1f5ed',
    transparent: true,
    opacity: 0.55,
  });
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.name.startsWith('ripple_')) {
      object.material = foam;
    } else if (
      object.name.startsWith('surface_') ||
      object.name.startsWith('icon_') ||
      object.name.startsWith('wreck_')
    ) {
      object.receiveShadow = true;
    }
  });
  return { root, cells, trims, borders, rentQuays };
}

/** The sand artwork's top edge is water: turn that edge toward the lagoon. */
export function shorelineArtwork(texture: THREE.Texture, side: number) {
  const map = texture.clone();
  map.center.set(0.5, 0.5);
  map.rotation = (side * Math.PI) / 2;
  return map;
}

/** Existing image files use browser UVs; glTF stores their vertical axis reversed. */
export function boardArtwork(texture: THREE.Texture, angle = 0) {
  const map = texture.clone();
  map.flipY = false;
  map.colorSpace = THREE.SRGBColorSpace;
  map.center.set(0.5, 0.5);
  map.rotation = -angle;
  return map;
}
