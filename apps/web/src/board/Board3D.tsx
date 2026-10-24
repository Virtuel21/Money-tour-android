import { translate, formatText } from '../i18n/translate';
import { numberLocale } from '../i18n/language';
import { InsuranceBadge, type InsuranceStyle } from './InsuranceBadge';
import { architectureFamilies, architectureForCity } from '../game/architecture';
import { tauntAsset, type Taunt } from '../game/taunts';
import { scaledAmount } from '@money-tour/engine';
import { cameraFrustum, cameraZoom, followPlayer, zoomFrustum } from './camera';
import { bindPinchZoom } from './pinchZoom';
import { bindMouseControls } from './mouseControls';
import { panFocus } from './cameraPan';
import { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { reservedCity, getRent, type GameState } from '@money-tour/engine';
import type { Cue } from '../game/presentation';
import { boardModel, boardArtwork } from './boardModel';
import { colors } from '../game/local';
import { boardTileTitle, tileTitle } from '../game/tileTitle';
import { concertSprite, festivalBeat, illustratedSprite } from './specialArt';
import { advanceScenery, lagoonScale } from './lagoon';
import { festivalFlag, lagoonBoat } from './scenery';
import { projectTileLabels, tileDecorationPoint, type TileLabelAnchors } from './tileLabels';
import { TileLabel } from './TileLabel';
import './board.css';

import { boardShape, tileFrame, tilePoint, wealthPoints } from './layout';
const up = new THREE.Vector3(0, 1, 0);
// Blender Z up -> glTF Y up. Opposite faces sum to seven.
const faceNormals = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, -1, 0),
];
function compact(source: THREE.Object3D) {
  source.updateWorldMatrix(true, true);
  const inverse = source.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  source.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || Array.isArray(node.material)) return;
    const geometry = node.geometry.clone().applyMatrix4(inverse.clone().multiply(node.matrixWorld));
    // These Blender assets use solid materials. Primitive UVs must not prevent
    // merging with the hand-built roof, arch and facial meshes, which have no UVs.
    geometry.deleteAttribute('uv');
    const list = batches.get(node.material) ?? [];
    list.push(geometry);
    batches.set(node.material, list);
  });
  const group = new THREE.Group();
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    if (merged) {
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    geometries.forEach((g) => g.dispose());
  }
  return group;
}
function caption(text: string, width: number, height: number, color = '#163d4b') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const context = canvas.getContext('2d')!;
  context.scale(2, 2);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    context.font = `${lines.length === 1 ? '900 120' : i ? '600 50' : '900 76'}px Trebuchet MS, sans-serif`;
    context.fillText(line, 256, lines.length === 1 ? 96 : 60 + i * 85, 490);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(width, height, 1);
  sprite.renderOrder = 4;
  return sprite;
}

export default function Board({
  state,
  onTile,
  reducedMotion = false,
  demo = false,
  cue,
  choices = [],
  selecting = false,
  insuranceFocus = false,
  auctionTile,
  strategicTiles = [],
  onReady,
  mobile = false,
  overview = false,
  zoomPercent = 100,
  onZoomChange,
  viewResetKey = 0,
  onPanChange,
  self,
  inspectedOwner,
  onPlayer,
  taunt,
}: {
  state: GameState;
  onTile: (id: number) => void;
  reducedMotion?: boolean;
  demo?: boolean;
  cue?: Cue;
  choices?: number[];
  selecting?: boolean;
  insuranceFocus?: boolean;
  auctionTile?: number;
  strategicTiles?: number[];
  onReady?: () => void;
  mobile?: boolean;
  overview?: boolean;
  zoomPercent?: number;
  onZoomChange?: (value: number) => void;
  viewResetKey?: number;
  onPanChange?: (panned: boolean) => void;
  self?: string;
  inspectedOwner?: string | null;
  onPlayer?: (id: string) => void;
  taunt?: Taunt;
}) {
  const badgeStyle: InsuranceStyle = import.meta.env.DEV
    ? ['shield', 'outline', 'medallion'].includes(
        new URLSearchParams(location.search).get('insurance-style') ?? '',
      )
      ? (new URLSearchParams(location.search).get('insurance-style') as InsuranceStyle)
      : 'outline'
    : 'outline';
  const host = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const zoomCallback = useRef(onZoomChange);
  zoomCallback.current = onZoomChange;
  const panCallback = useRef(onPanChange);
  panCallback.current = onPanChange;
  const manualView = useRef<{ focus: THREE.Vector3; zoomBase: number } | null>(null);
  const panEnabled = useRef(false);
  const pan = useRef<(dx: number, dy: number) => void>(() => {});
  const frameAll =
    overview ||
    selecting ||
    auctionTile !== undefined ||
    state.phase === 'auction' ||
    strategicTiles.length > 0 ||
    Boolean(state.winner);
  useEffect(() => {
    if (manualView.current) {
      manualView.current = null;
      panCallback.current?.(false);
    }
  }, [viewResetKey, overview, mobile, frameAll, state.turn, state.currentPlayer]);
  const foregroundPawns = useRef<(HTMLSpanElement | null)[]>([]);
  const live = useRef({
    state,
    cue,
    reducedMotion,
    choices,
    mobile,
    overview,
    selecting,
    self,
    zoomPercent,
    strategicTiles,
    auctionTile,
  });
  live.current = {
    state,
    cue,
    reducedMotion,
    choices,
    mobile,
    overview,
    selecting,
    self,
    zoomPercent,
    strategicTiles,
    auctionTile,
  };
  const update = useRef<() => void>(() => {});
  useEffect(() => {
    if (!mobile || demo || !onZoomChange || !shell.current) return;
    return bindPinchZoom(
      shell.current,
      () => live.current.zoomPercent,
      (value) => zoomCallback.current?.(value),
      { enabled: () => panEnabled.current, move: (dx, dy) => pan.current(dx, dy) },
    );
  }, [mobile, demo, Boolean(onZoomChange)]);
  useEffect(() => {
    if (mobile || demo || !onZoomChange || !shell.current) return;
    return bindMouseControls(
      shell.current,
      () => live.current.zoomPercent,
      (value) => zoomCallback.current?.(value),
      { enabled: () => panEnabled.current, move: (dx, dy) => pan.current(dx, dy) },
    );
  }, [mobile, demo, Boolean(onZoomChange)]);
  const [error, setError] = useState(''),
    [ready, setReady] = useState(false);
  const [pawnAnchors, setPawnAnchors] = useState<
    { x: number; y: number; width: number; height: number }[]
  >([]);
  const [bankAnchors, setBankAnchors] = useState<{ x: number; y: number }[]>([]);
  const [anchors, setAnchors] = useState<{ points: string; labels: TileLabelAnchors }[]>([]);
  useEffect(() => {
    const element = host.current!;
    let disposed = false;
    let renderer: THREE.WebGLRenderer | undefined;
    let festivalRenderer: THREE.WebGLRenderer | undefined;
    let observer: ResizeObserver | undefined;
    const resources = new THREE.Group();
    const festivalScene = new THREE.Scene();
    const pendingAssets: THREE.Object3D[] = [];
    const disposePending = (root: THREE.Object3D) =>
      root.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
            (m as THREE.MeshStandardMaterial).map?.dispose();
            m.dispose();
          }
        }
      });
    let cleanup = () => {
      disposePending(resources);
      disposePending(festivalScene);
      pendingAssets.forEach(disposePending);
    };
    const initialize = async () => {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = 0.9;
        element.appendChild(renderer.domElement);
        // DOM tile labels sit above the board canvas. Render full-size flags
        // in their own transparent layer, using the very same board camera.
        festivalRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        festivalRenderer.setPixelRatio(renderer.getPixelRatio());
        festivalRenderer.outputColorSpace = renderer.outputColorSpace;
        festivalRenderer.toneMapping = renderer.toneMapping;
        festivalRenderer.toneMappingExposure = renderer.toneMappingExposure;
        festivalRenderer.domElement.className = 'festival-foreground-layer';
        festivalRenderer.domElement.setAttribute('aria-hidden', 'true');
        element.parentElement!.appendChild(festivalRenderer.domElement);
        const scene = new THREE.Scene();
        scene.add(resources);
        const camera = new THREE.OrthographicCamera(-18, 18, 12.25, -12.25, 0.1, 80);
        camera.position.set(18, 22, 18);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        const viewport = element.closest('.board-viewport');
        let framingHalfWidth = 18;
        let framing: ReturnType<typeof cameraFrustum>;
        const project = () => {
          if (framing) {
            const bounds = zoomFrustum(framing, camera.zoom);
            camera.left = bounds.left;
            camera.right = bounds.right;
            camera.top = bounds.top;
            camera.bottom = bounds.bottom;
          }
          camera.updateProjectionMatrix();
        };
        const resize = () => {
          const width = element.clientWidth,
            height = element.clientHeight;
          if (!width || !height) return;
          renderer!.setSize(width, height, false);
          festivalRenderer!.setSize(width, height, false);
          // Menu previews can be rotated by CSS: their DOM bounding box is not the renderer size.
          const fullBleed = live.current.mobile && !demo && viewport;
          const canvas = fullBleed
            ? element.getBoundingClientRect()
            : { left: 0, top: 0, width, height };
          const frame = fullBleed ? viewport.getBoundingClientRect() : canvas;
          framing = cameraFrustum(canvas, frame, live.current.mobile);
          framingHalfWidth = framing.framingHalfWidth;
          project();
        };
        observer = new ResizeObserver(resize);
        observer.observe(element);
        // Tips, the journal and the HUD can resize the framing cell while the canvas stays full screen.
        if (viewport) observer.observe(viewport);
        const area = element.closest('.board-area');
        if (area) observer.observe(area);
        // Row changes can move the frame without changing its own dimensions.
        area?.parentElement
          ?.querySelectorAll(
            ':scope > .game-top, :scope > .shared-game-info, :scope > .game-sidebar, :scope > .board-controls',
          )
          .forEach((panel) => observer!.observe(panel));
        resize();
        scene.add(new THREE.HemisphereLight(0xf4fcff, 0xa8a388, 1.8));
        const light = new THREE.DirectionalLight(0xfff4df, 2.4);
        light.position.set(-8, 20, 10);
        light.castShadow = true;
        light.shadow.mapSize.set(2048, 2048);
        light.shadow.camera.left = -12;
        light.shadow.camera.right = 12;
        light.shadow.camera.top = 12;
        light.shadow.camera.bottom = -12;
        light.shadow.normalBias = 0.025;
        light.shadow.radius = 3;
        scene.add(light);
        festivalScene.add(new THREE.HemisphereLight(0xf4fcff, 0xa8a388, 1.8));
        const festivalLight = new THREE.DirectionalLight(0xfff4df, 2.4);
        festivalLight.position.copy(light.position);
        festivalScene.add(festivalLight);
        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(200, 200),
          demo
            ? new THREE.MeshStandardMaterial({ color: 0xd5edf2, roughness: 1 })
            : new THREE.ShadowMaterial({ color: 0x126878, opacity: 0.2, depthWrite: false }),
        );
        // Keep the board and its shadow grounded over the illustrated sea. An
        // opaque floor would hide the archipelago behind the transparent canvas.
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.5;
        ground.receiveShadow = true;
        resources.add(ground);
        const loader = new GLTFLoader();
        const loadModel = async (url: string) => {
          const asset = await loader.loadAsync(url);
          pendingAssets.push(asset.scene);
          return asset;
        };
        const gltf = await loadModel(
          `${import.meta.env.BASE_URL}models/money-tour.glb?v=${import.meta.env.VITE_MODEL_REVISION}`,
        );
        if (disposed) {
          disposePending(gltf.scene);
          return;
        }
        const templates = new Map<string, THREE.Group>();
        for (const name of [
          'die',
          'palm',
          'chance',
          'championship',
          'tax',
          'travel',
          'start',
          'plot',
        ]) {
          const original = gltf.scene.getObjectByName(name);
          if (!original) throw new Error(`Modèle absent : ${name}`);
          templates.set(name, compact(original));
        }
        const clone = (name: string) => templates.get(name)!.clone(true);
        const fortuneGltf = await loadModel(import.meta.env.BASE_URL + 'models/fortune.glb');
        if (disposed) {
          disposePending(fortuneGltf.scene);
          disposePending(gltf.scene);
          return;
        }
        for (const name of ['casino_roulette', 'casino_slots', 'insurance_shield', 'karma_scale'])
          templates.set(name, compact(fortuneGltf.scene.getObjectByName(name)!));
        const boardGltf = await loadModel(
          `${import.meta.env.BASE_URL}models/board-layout.glb?v=${import.meta.env.VITE_BOARD_REVISION}`,
        );
        if (disposed) {
          disposePending(boardGltf.scene);
          disposePending(gltf.scene);
          disposePending(fortuneGltf.scene);
          return;
        }
        const shape = boardShape(live.current.state.config.board.length);
        const authoredBoard = boardModel(
          boardGltf.scene,
          live.current.state.config.board,
          renderer.capabilities.getMaxAnisotropy(),
        );
        // Batch the original solid meshes without touching the authored surface UVs.
        const tileCount = live.current.state.config.board.length;
        for (const key of [
          `platform_${tileCount}`,
          ...live.current.state.config.board.map((t) => `tile_${tileCount}_${t.id}`),
        ]) {
          const original = authoredBoard.root.getObjectByName(key)!;
          const batch = compact(original);
          batch.position.copy(original.position);
          batch.quaternion.copy(original.quaternion);
          batch.scale.copy(original.scale);
          original.visible = false;
          original.parent!.add(batch);
        }
        resources.add(authoredBoard.root);
        const wealthGltf = await loadModel(import.meta.env.BASE_URL + 'models/wealth.glb');
        if (disposed) {
          disposePending(wealthGltf.scene);
          disposePending(gltf.scene);
          return;
        }
        const note = compact(wealthGltf.scene.getObjectByName('banknote_bundle')!);
        const ingot = compact(wealthGltf.scene.getObjectByName('gold_bar')!);
        // glTF already converts these models to Y-up; keep the bundles horizontal.
        for (const source of [note, ingot])
          source.traverse((node) => {
            if (node instanceof THREE.Mesh) {
              node.geometry.scale(1, 1, 1.5);
              if (
                node.material instanceof THREE.MeshStandardMaterial &&
                node.material.metalness > 0
              )
                node.material.metalness = 0.22;
            }
          });
        const wealth = live.current.state.players.map((_, i) => {
          const pile = new THREE.Group();
          const pos = wealthPoints[i]!;
          pile.position.set(pos.x, -0.4, pos.z);
          const plinth = new THREE.Mesh(
            new THREE.BoxGeometry(2.3, 0.06, 1.4),
            new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.6 }),
          );
          plinth.position.y = -0.04;
          pile.add(plinth);
          const units = new THREE.Group();
          pile.add(units);
          for (let k = 0; k < 24; k++) {
            const unit = (k % 3 < 2 ? note : ingot).clone(true);
            unit.position.set(
              ((k % 3) - 1) * 0.76,
              Math.floor(k / 6) * 0.23,
              Math.floor((k % 6) / 3) * 0.7 - 0.35,
            );
            unit.rotation.y = k % 2 ? 0.06 : -0.04;
            units.add(unit);
          }
          resources.add(pile);
          return units;
        });
        const shownWealth = live.current.state.players.map((p) => p.cash);
        const textureLoader = new THREE.TextureLoader();
        const [
          travelers,
          architecture,
          regionalArchitecture,
          expansionTiles,
          lostIslandArt,
          festivalArt,
          chanceArt,
          taxArt,
          insuranceArt,
          airportArt,
        ] = await Promise.all([
          textureLoader.loadAsync(import.meta.env.BASE_URL + 'textures/travelers-v3.webp'),
          textureLoader.loadAsync(import.meta.env.BASE_URL + 'textures/architecture-v3.webp'),
          textureLoader.loadAsync(import.meta.env.BASE_URL + 'textures/architecture-regional.svg'),
          textureLoader.loadAsync(import.meta.env.BASE_URL + 'textures/expansion-v1.webp'),
          textureLoader.loadAsync(import.meta.env.BASE_URL + 'textures/lost-island-v1.webp'),
          textureLoader.loadAsync(import.meta.env.BASE_URL + 'textures/festival-stage-v2.webp'),
          textureLoader.loadAsync(import.meta.env.BASE_URL + 'textures/chance-tile-v2.webp'),
          textureLoader.loadAsync(import.meta.env.BASE_URL + 'textures/tax-tile-v2.webp'),
          textureLoader.loadAsync(import.meta.env.BASE_URL + 'textures/insurance-tile-v2.webp'),
          textureLoader.loadAsync(import.meta.env.BASE_URL + 'textures/travel-airport-v1.webp'),
        ]);
        const loadedTextures = [
          travelers,
          architecture,
          regionalArchitecture,
          expansionTiles,
          lostIslandArt,
          festivalArt,
          chanceArt,
          taxArt,
          insuranceArt,
          airportArt,
        ];
        if (disposed) {
          loadedTextures.forEach((texture) => texture.dispose());
          disposePending(gltf.scene);
          return;
        }
        const atlasSprite = (
          atlas: THREE.Texture,
          index: number,
          columns: number,
          width: number,
          height: number,
        ) => {
          const map = atlas.clone();
          map.colorSpace = THREE.SRGBColorSpace;
          map.repeat.set(1 / columns, 0.5);
          map.offset.set((index % columns) / columns, index < columns ? 0.5 : 0);
          map.anisotropy = renderer!.capabilities.getMaxAnisotropy();
          const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map,
              alphaTest: 0.7,
              transparent: true,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          sprite.center.set(0.5, 0.05);
          sprite.scale.set(width, height, 1);
          return sprite;
        };
        const ownerSprite = (sprite: THREE.Sprite, owner: number) => {
          sprite.material.onBeforeCompile = (shader) => {
            shader.uniforms.ownerTone = { value: new THREE.Color(colors[owner] ?? '#278fc0') };
            shader.fragmentShader = 'uniform vec3 ownerTone;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <map_fragment>',
              `#include <map_fragment>
              float chroma=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b))-min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));
              if(chroma>0.07 && ((diffuseColor.r>diffuseColor.g*1.25 && diffuseColor.r>diffuseColor.b*1.08) || (diffuseColor.b>diffuseColor.r*1.18 && diffuseColor.b>diffuseColor.g*1.10))) {
                float shade=clamp(max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b))*1.65,0.28,1.3);
                diffuseColor.rgb=ownerTone*shade;
              }
            `,
            );
          };
          sprite.material.customProgramCacheKey = () => 'owner-color-v1';
          return sprite;
        };
        // Detailed pre-rendered dioramas: a fixed three-quarter camera lets the art retain its fine detail.
        const lagoon = new THREE.Group();
        lagoon.scale.setScalar(lagoonScale(live.current.state.config.board.length));
        resources.add(lagoon);
        for (let i = 0; i < 4; i++) {
          const island = authoredBoard.root.getObjectByName(
            `island_${live.current.state.config.board.length}_${i}`,
          ) as THREE.Mesh;
          const map = boardArtwork(architecture);
          const index = i + 2;
          map.center.set(0, 0);
          map.repeat.set(1 / 3, 0.5);
          map.offset.set((index % 3) / 3, index < 3 ? 0 : 0.5);
          map.anisotropy = renderer!.capabilities.getMaxAnisotropy();
          island.material = new THREE.MeshBasicMaterial({
            map,
            alphaTest: 0.7,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
          });
        }
        const boats = [lagoonBoat('cruise', 0), lagoonBoat('sail', 1)];
        boats.forEach((boat) => lagoon.add(boat.root));
        const { trims, borders, rentQuays } = authoredBoard;
        const buildings: THREE.Group[] = [],
          championships: THREE.Group[] = [],
          confetti: THREE.Group[] = [];
        const festivalFlags: ReturnType<typeof festivalFlag>[] = [];
        const concertBeats: { value: number }[] = [];
        for (const tile of live.current.state.config.board) {
          const p = tileFrame(tile.id, live.current.state.config.board.length);
          const { surface, wreck } = authoredBoard.cells[tile.id]!;
          const illustratedTile =
            tile.type === 'chance'
              ? chanceArt
              : tile.type === 'tax'
                ? taxArt
                : tile.type === 'insurance'
                  ? insuranceArt
                  : undefined;
          const extra = ['casino', 'karma'].includes(tile.type);
          if (illustratedTile || extra) {
            const tileMap = boardArtwork(
              illustratedTile ?? expansionTiles,
              illustratedTile ? p.angle : 0,
            );
            if (extra) {
              const index = tile.type === 'casino' ? (tile.id < 15 ? 0 : 1) : 3;
              tileMap.repeat.set(0.5, 0.5);
              tileMap.center.set(0, 0);
              tileMap.offset.set((index % 2) * 0.5, index < 2 ? 0 : 0.5);
            }
            tileMap.anisotropy = renderer!.capabilities.getMaxAnisotropy();
            surface.material = new THREE.MeshStandardMaterial({ map: tileMap, roughness: 0.95 });
          }
          const city = new THREE.Group();
          const cityPosition = tileDecorationPoint(
            tile.id,
            live.current.state.config.board.length,
            0.85,
          );
          city.position.set(cityPosition.x, 0.26, cityPosition.z);
          city.rotation.y = p.angle;
          resources.add(city);
          buildings.push(city);
          if (tile.type === 'island') {
            const map = boardArtwork(lostIslandArt);
            map.colorSpace = lostIslandArt.colorSpace;
            wreck.material = new THREE.MeshStandardMaterial({
              map,
              transparent: true,
              alphaTest: 0.05,
              depthWrite: false,
              roughness: 0.95,
            });
          }
          if (tile.type === 'championship') {
            const concert = concertSprite(festivalArt, 2.65);
            // Leave the front of the corner clear for its horizontal name strip.
            concert.sprite.position.set(p.x - 0.5, 0.29, p.z - 0.5);
            resources.add(concert.sprite);
            concertBeats.push(concert.beat);
          }
          if (tile.type === 'travel') {
            const airport = illustratedSprite(airportArt, 3.25, 0.08);
            airport.scale.y = 3.25 / 1.5;
            // Keep the airport at the rear; travelers and the name use the front lane.
            airport.position.set(p.x - 0.35, 0.29, p.z - 0.65);
            resources.add(airport);
          }
          if (tile.type === 'resort') {
            const palm = clone('palm');
            palm.scale.setScalar(0.9);
            const palmPosition = tileDecorationPoint(
              tile.id,
              live.current.state.config.board.length,
              0.65,
            );
            palm.position.set(palmPosition.x, 0.26, palmPosition.z);
            resources.add(palm);
          }
          if (
            ![
              'city',
              'resort',
              'island',
              'chance',
              'tax',
              'duel',
              'championship',
              'insurance',
              'travel',
            ].includes(tile.type)
          ) {
            const model =
              tile.type === 'casino'
                ? tile.id < 15
                  ? 'casino_roulette'
                  : 'casino_slots'
                : tile.type === 'insurance'
                  ? 'insurance_shield'
                  : tile.type === 'karma'
                    ? 'karma_scale'
                    : tile.type;
            const icon = clone(model);
            if (extra) icon.scale.setScalar(0.72);
            icon.position.set(p.x - p.normal.x * 0.3, 0.27, p.z - p.normal.z * 0.3);
            resources.add(icon);
          }
          const celebration = new THREE.Group();
          celebration.position.set(p.x, 0.29, p.z);
          celebration.rotation.y = p.angle;
          if (tile.type === 'city' || tile.type === 'resort') {
            const flag = festivalFlag(festivalFlags[0]?.texture);
            flag.group.position.set(-0.72, 0, -0.62);
            flag.group.rotation.y = -p.angle;
            celebration.add(flag.group);
            festivalFlags.push(flag);
          }
          festivalScene.add(celebration);
          championships.push(celebration);
          const shower = new THREE.Group();
          shower.position.copy(celebration.position);
          if (tile.type === 'city' || tile.type === 'resort')
            for (let k = 0; k < 18; k++) {
              const flake = new THREE.Mesh(
                new THREE.PlaneGeometry(0.075, 0.13),
                new THREE.MeshBasicMaterial({
                  color: ['#ffd45c', '#f34b90', '#4bdddf', '#fff5cc'][k % 4],
                  side: THREE.DoubleSide,
                }),
              );
              flake.position.set(((k * 7) % 17) / 12 - 0.65, 0, ((k * 11) % 17) / 12 - 0.65);
              shower.add(flake);
            }
          resources.add(shower);
          confetti.push(shower);
        }
        const projectLabels = () => {
          setBankAnchors(
            wealthPoints.map((p) => {
              const v = new THREE.Vector3(
                p.x + (Math.abs(p.x) > Math.abs(p.z) ? Math.sign(p.x) * 1.2 : 0),
                0,
                p.z + (Math.abs(p.z) > Math.abs(p.x) ? Math.sign(p.z) * 1.2 : 0),
              ).project(camera);
              return { x: (v.x + 1) * 50, y: (1 - v.y) * 50 };
            }),
          );
          setAnchors(
            live.current.state.config.board.map((t) => {
              const p = tileFrame(t.id, live.current.state.config.board.length);
              const points = [
                [-p.width / 2, -p.depth / 2],
                [-p.width / 2, p.depth / 2],
                [p.width / 2, p.depth / 2],
                [p.width / 2, -p.depth / 2],
              ]
                .map(([x, z]) => {
                  const corner = new THREE.Vector3(p.x + x!, 0.27, p.z + z!).project(camera);
                  return (corner.x + 1) * 50 + ',' + (1 - corner.y) * 50;
                })
                .join(' ');
              const labels = projectTileLabels(
                t.id,
                live.current.state.config.board.length,
                t.type === 'start' || t.type === 'championship' || t.type === 'travel',
                (point) => {
                  const v = new THREE.Vector3(point.x, 0.29, point.z).project(camera);
                  return {
                    x: ((v.x + 1) * element.clientWidth) / 2,
                    y: ((1 - v.y) * element.clientHeight) / 2,
                  };
                },
              );
              return { points, labels };
            }),
          );
        };
        projectLabels();
        let pawnSignature = '',
          lastPawnProjection = 0;
        const pawns = live.current.state.players.map((_, i) => {
          const pawn = new THREE.Group();
          const character = atlasSprite(travelers, i, 2, 2.55, 2.55);
          pawn.add(character);
          const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.53, 0.12, 32),
            new THREE.MeshStandardMaterial({ color: colors[i] }),
          );
          pawn.add(base);
          pawn.scale.setScalar(0.7);
          resources.add(pawn);
          const badge = caption(String(i + 1), 0.3, 0.3, colors[i]);
          badge.position.set(0, 2.28, 0);
          pawn.add(badge);
          return pawn;
        });
        const diceScene = new THREE.Scene();
        const diceCamera = new THREE.OrthographicCamera(-2.8, 2.8, 2, -2, 0.1, 100);
        diceCamera.position.set(0, 6, 7);
        diceCamera.lookAt(0, 0, 0);
        diceScene.add(new THREE.AmbientLight(0xffffff, 2.3));
        const diceLight = new THREE.DirectionalLight(0xfff0d2, 3);
        diceLight.position.set(-3, 7, 4);
        diceScene.add(diceLight);
        const diceTray = new THREE.Mesh(
          new THREE.CylinderGeometry(2.35, 2.4, 0.18, 64),
          new THREE.MeshStandardMaterial({ color: '#d8a34c', roughness: 0.45, metalness: 0.2 }),
        );
        diceTray.position.y = -0.16;
        diceTray.scale.z = 0.72;
        diceScene.add(diceTray);
        const felt = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 2.2, 0.035, 64),
          new THREE.MeshStandardMaterial({ color: '#185b58', roughness: 0.95 }),
        );
        felt.scale.z = 0.72;
        felt.position.y = -0.045;
        diceScene.add(felt);
        let diceVisibleUntil = 0;
        const dice = [clone('die'), clone('die')];
        dice.forEach((die, i) => {
          die.position.set(i ? 0.52 : -0.52, 0.55, 1.0);
          die.scale.setScalar(1.15);
          diceScene.add(die);
        });
        let lastCue: Cue | undefined,
          started = 0;
        const signatures: string[] = [];
        const detached: THREE.Object3D[] = [];
        const draw = () => {
          const game = live.current.state;
          game.config.board.forEach((tile, i) => {
            const prop = game.properties[tile.id],
              owner = game.players.findIndex((p) => p.id === prop?.ownerId);
            trims[i]!.visible = owner >= 0;
            const quay = rentQuays.get(tile.id);
            if (quay) quay.visible = owner >= 0;
            (trims[i]!.material as THREE.MeshStandardMaterial).color.set(
              colors[owner] ?? '#ffffff',
            );
            borders[i]!.visible = live.current.choices.includes(tile.id);
            championships[i]!.visible =
              (prop?.championships ?? 0) > 0 || game.festivals.includes(tile.id);
            const signature = String(prop?.level ?? 0) + ':' + String(prop?.ownerId);
            if (signatures[i] === signature) return;
            signatures[i] = signature;
            const group = buildings[i]!;
            detached.push(...group.children);
            group.clear();
            if (tile.type !== 'city') return;
            const level = prop?.level ?? 0;
            if (!level) {
              group.add(clone('plot'));
              return;
            }
            const n = level === 4 ? 1 : level;
            for (let j = 0; j < n; j++) {
              const building = new THREE.Group();
              building.add(
                ownerSprite(
                  atlasSprite(
                    regionalArchitecture,
                    architectureFamilies.indexOf(architectureForCity(tile.name)) +
                      (level === 4 ? 5 : 0),
                    5,
                    1.85,
                    1.85,
                  ),
                  owner,
                ),
              );
              building.scale.setScalar(level === 4 ? 0.61 : n === 1 ? 0.66 : 0.44);
              building.position.x = (j - (n - 1) / 2) * 0.46;
              building.position.z = -(j - (n - 1) / 2) * 0.46;
              if (level === 4) building.position.z -= 0.1;
              group.add(building);
            }
          });
        };
        update.current = draw;
        draw();
        const focus = new THREE.Vector3();
        const cameraOffset = new THREE.Vector3(18, 22, 18);
        pan.current = (dx, dy) => {
          if (!panEnabled.current || (!dx && !dy)) return;
          const previous = manualView.current;
          const next = panFocus(
            camera,
            previous?.focus ?? focus,
            dx,
            dy,
            element.clientWidth,
            element.clientHeight,
            { x: shape.x + shape.depth / 2, z: shape.z + shape.depth / 2 },
          );
          manualView.current = {
            focus: next,
            zoomBase:
              previous?.zoomBase ??
              (live.current.mobile ? camera.zoom / (live.current.zoomPercent / 100) : 1),
          };
          if (!previous) panCallback.current?.(true);
        };
        let previousTime = performance.now(),
          lastProjection = 0,
          projectionSignature = '';
        let sceneryTime = 0,
          sceneryPrevious = performance.now();
        renderer.setAnimationLoop(() => {
          if (disposed) return;
          const { state: game, cue: activeCue, reducedMotion: reduced } = live.current;
          const now = performance.now();
          const still = reduced || document.hidden;
          sceneryTime = advanceScenery(sceneryTime, (now - sceneryPrevious) / 1000, still);
          sceneryPrevious = now;
          boats.forEach((boat) => boat.animate(sceneryTime, still));
          festivalFlags.forEach((flag) => {
            if (flag.group.parent?.visible) flag.wave(sceneryTime);
          });
          const beat = festivalBeat(now, reduced);
          concertBeats.forEach((uniform) => {
            uniform.value = beat;
          });
          if (activeCue !== lastCue) {
            lastCue = activeCue;
            started = now;
          }
          const progress = activeCue?.duration
            ? Math.min(1, (now - started) / activeCue.duration)
            : 1;
          pawns.forEach((pawn, i) => {
            const player = game.players[i];
            if (!player) {
              pawn.visible = false;
              return;
            }
            pawn.visible = !player.eliminated;
            const walkingPoint = (id: number) => {
              const point = tilePoint(id, game.config.board.length);
              return ['championship', 'travel'].includes(game.config.board[id]?.type ?? '')
                ? { x: point.x + 0.68, z: point.z + 0.68 }
                : point;
            };
            let point = walkingPoint(player.position),
              height = 0.27;
            if (activeCue?.kind === 'hop' && activeCue.playerId === player.id && !reduced) {
              const from = walkingPoint(activeCue.from!),
                to = walkingPoint(activeCue.to!);
              point = {
                x: THREE.MathUtils.lerp(from.x, to.x, progress),
                z: THREE.MathUtils.lerp(from.z, to.z, progress),
              };
              height += Math.sin(progress * Math.PI) * 0.65;
              pawn.rotation.z = Math.sin(progress * Math.PI * 2) * 0.07;
            } else pawn.rotation.z = 0;
            const peers = game.players.filter(
                (p) => !p.eliminated && p.position === player.position,
              ),
              slot = peers.findIndex((p) => p.id === player.id);
            // Separate the rear building plot from the front walking lane.
            // Four co-located travelers use two rows, never a stack of models.
            pawn.scale.setScalar(game.currentPlayer === i ? 0.95 : peers.length > 1 ? 0.7 : 0.88);
            const offsetX =
              peers.length > 2
                ? slot % 2
                  ? 0.38
                  : -0.38
                : peers.length === 2
                  ? slot
                    ? 0.37
                    : -0.37
                  : 0;
            const offsetZ = peers.length > 2 ? (slot < 2 ? 0.15 : 0.6) : 0.35;
            const frame = tileFrame(player.position, game.config.board.length);
            const atLandmark = ['championship', 'travel'].includes(
              game.config.board[player.position]?.type ?? '',
            );
            pawn.position.set(
              point.x +
                (atLandmark ? offsetX * 1.5 + offsetZ * 0.4 : offsetX + frame.normal.x * 0.25),
              height,
              point.z +
                (atLandmark ? -offsetX * 1.5 + offsetZ * 0.4 : offsetZ + frame.normal.z * 0.25),
            );
            // A crowded cell remains readable: the active traveler stays solid; companions become translucent.
            pawn.traverse((node) => {
              if (node instanceof THREE.Sprite && node.material.map) {
                node.material.opacity = peers.length > 1 && game.currentPlayer !== i ? 0.48 : 1;
                node.material.alphaTest = 0.7 * node.material.opacity;
              }
            });
          });
          const currentPlayer = game.players[game.currentPlayer]!;
          const following = followPlayer({
            mobile: live.current.mobile,
            overview: live.current.overview,
            selecting: live.current.selecting,
            phase: game.phase,
            cue: activeCue?.kind,
            bot: currentPlayer.bot,
            self: live.current.self,
            active: currentPlayer.id,
            winner: Boolean(game.winner),
          });
          const target =
            manualView.current?.focus ??
            (following
              ? pawns[game.currentPlayer]!.position.clone().setY(0.6)
              : new THREE.Vector3());
          const factor = reduced ? 1 : 1 - Math.exp(-Math.min(100, now - previousTime) / 170);
          previousTime = now;
          if (manualView.current) focus.copy(target);
          else focus.lerp(target, factor);
          const frameAll =
            live.current.overview ||
            live.current.selecting ||
            live.current.auctionTile !== undefined ||
            game.phase === 'auction' ||
            live.current.strategicTiles.length > 0 ||
            Boolean(game.winner);
          const zoomTarget = manualView.current
            ? (manualView.current.zoomBase * live.current.zoomPercent) / 100
            : cameraZoom(
                framingHalfWidth,
                following,
                live.current.zoomPercent,
                live.current.mobile && frameAll,
              );
          camera.zoom = THREE.MathUtils.lerp(camera.zoom, zoomTarget, factor);
          panEnabled.current = !demo && (!live.current.mobile || (!frameAll && camera.zoom > 1.01));
          element.parentElement?.classList.toggle('board-can-pan', panEnabled.current);
          camera.position.copy(cameraOffset).add(focus);
          camera.lookAt(focus);
          project();
          camera.updateMatrixWorld();
          // The character art sits above DOM labels. Project it every frame so hops and
          // camera transitions stay as smooth as the original WebGL billboards.
          pawns.forEach((pawn, i) => {
            const foreground = foregroundPawns.current[i];
            const character = pawn.children[0] as THREE.Sprite;
            character.visible = !foreground;
            if (!foreground) return;
            const v = pawn.position.clone().project(camera);
            foreground.style.left = (v.x + 1) * 50 + '%';
            foreground.style.top = (1 - v.y) * 50 + '%';
            foreground.style.width =
              ((2.55 * pawn.scale.x * camera.zoom) / (camera.right - camera.left)) * 100 + '%';
            foreground.style.height =
              ((2.55 * pawn.scale.y * camera.zoom) / (camera.top - camera.bottom)) * 100 + '%';
            foreground.style.opacity = String(character.material.opacity);
            foreground.style.visibility = pawn.visible ? 'visible' : 'hidden';
            foreground.style.zIndex = game.currentPlayer === i ? '10' : String(i);
          });
          const pawnKey = [
            camera.right,
            camera.top,
            camera.zoom,
            focus.x,
            focus.z,
            ...pawns.flatMap((p) => [p.position.x, p.position.y, p.position.z, p.scale.x]),
          ]
            .map((n) => n.toFixed(2))
            .join(':');
          if (pawnKey !== pawnSignature && now - lastPawnProjection > 40) {
            setPawnAnchors(
              pawns.map((pawn) => {
                const v = pawn.position.clone().project(camera);
                return {
                  x: (v.x + 1) * 50,
                  y: (1 - v.y) * 50,
                  width: ((2.55 * pawn.scale.x * camera.zoom) / (camera.right - camera.left)) * 100,
                  height:
                    ((2.55 * pawn.scale.y * camera.zoom) / (camera.top - camera.bottom)) * 100,
                };
              }),
            );
            pawnSignature = pawnKey;
            lastPawnProjection = now;
          }
          // DOM labels and touch polygons share the exact camera projection, including during hops.
          const signature = [
            focus.x,
            focus.z,
            camera.zoom,
            camera.right,
            camera.top,
            element.clientWidth,
            element.clientHeight,
          ]
            .map((v) => v.toFixed(3))
            .join(':');
          if (signature !== projectionSignature && now - lastProjection > 32) {
            projectLabels();
            element.parentElement?.style.setProperty(
              '--camera-label-scale',
              String((camera.zoom * 36) / (camera.right - camera.left)),
            );
            element.parentElement?.setAttribute(
              'data-camera',
              manualView.current ? 'manual' : following ? 'follow' : 'overview',
            );
            projectionSignature = signature;
            lastProjection = now;
          }
          wealth.forEach((units, i) => {
            const target = game.players[i]?.eliminated ? 0 : (game.players[i]?.cash ?? 0);
            shownWealth[i] = reduced ? target : THREE.MathUtils.lerp(shownWealth[i]!, target, 0.12);
            const amount = Math.min(24, shownWealth[i]! / scaledAmount(state.config, 100000));
            units.children.forEach((unit, k) => {
              const fill = THREE.MathUtils.clamp(amount - k, 0, 1);
              unit.visible = fill > 0.01;
              unit.scale.y = Math.max(0.01, fill);
            });
            units.scale.setScalar(
              1 +
                Math.max(
                  0,
                  Math.log2(Math.max(1, shownWealth[i]! / scaledAmount(state.config, 2400000))),
                ) *
                  0.1,
            );
          });
          dice.forEach((die, i) => {
            const value = (activeCue?.kind === 'dice' ? activeCue.dice?.[i] : game.dice[i]) ?? 1;
            const final = new THREE.Quaternion().setFromUnitVectors(faceNormals[value - 1]!, up);
            if (activeCue?.kind === 'dice' && !reduced && progress < 1) {
              const spin = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                  (1 - progress) * Math.PI * 8,
                  (1 - progress) * Math.PI * 6,
                  (1 - progress) * Math.PI * 4,
                ),
              );
              die.quaternion.copy(final).multiply(spin);
              die.position.set(
                (i ? 0.78 : -0.78) + Math.sin(progress * 8 + i) * 0.5 * (1 - progress),
                0.52 + Math.abs(Math.sin(progress * Math.PI * 3)) * 1.25 * (1 - progress),
                (i ? -0.25 : 0.25) + Math.sin(progress * 5) * 0.4,
              );
            } else {
              die.quaternion.copy(final);
              die.position.set(i ? 0.78 : -0.78, 0.52, i ? -0.25 : 0.25);
            }
          });
          buildings.forEach((g, i) => {
            const occupied = game.players.some((p) => !p.eliminated && p.position === i);
            g.traverse((node) => {
              if (node instanceof THREE.Sprite) {
                node.material.opacity = occupied ? 0.4 : 1;
                node.material.alphaTest = 0.7 * node.material.opacity;
              }
            });
            g.scale.y =
              activeCue?.kind === 'build' && activeCue.tile === i && !reduced
                ? Math.max(
                    0.02,
                    1 - Math.pow(1 - progress, 3) + Math.sin(progress * Math.PI) * 0.12,
                  )
                : 1;
          });
          confetti.forEach((shower, i) => {
            shower.visible = championships[i]!.visible && !reduced;
            if (!shower.visible) return;
            shower.children.forEach((flake, k) => {
              flake.position.y = 0.1 + (1 - ((now / 2900 + k / 18) % 1)) * 1.55;
              flake.rotation.set(now / 700 + k, now / 900, k + now / 1200);
            });
          });
          borders.forEach((b) => {
            (b.material as THREE.MeshStandardMaterial).opacity =
              0.42 + (reduced ? 0 : Math.sin(now / 240) * 0.18);
          });
          const fullSize = renderer!.getSize(new THREE.Vector2());
          renderer!.setViewport(0, 0, fullSize.x, fullSize.y);
          renderer!.render(scene, camera);
          festivalRenderer!.render(festivalScene, camera);
          if (activeCue?.kind === 'dice') diceVisibleUntil = now + 450;
          element.parentElement?.classList.toggle('dice-overlay', now < diceVisibleUntil);
          if (now < diceVisibleUntil) {
            const width = Math.min(390, fullSize.x * 0.8),
              height = width * 0.72;
            renderer!.autoClear = false;
            renderer!.clearDepth();
            renderer!.setViewport(
              (fullSize.x - width) / 2,
              (fullSize.y - height) / 2,
              width,
              height,
            );
            renderer!.render(diceScene, diceCamera);
            renderer!.autoClear = true;
          }
        });
        cleanup = () => {
          observer?.disconnect();
          const geometries = new Set<THREE.BufferGeometry>(),
            materials = new Set<THREE.Material>(),
            textures = new Set<THREE.Texture>();
          const gather = (o: THREE.Object3D) =>
            o.traverse((n) => {
              if (n instanceof THREE.Mesh || n instanceof THREE.Sprite) {
                if (n instanceof THREE.Mesh) geometries.add(n.geometry);
                for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
                  materials.add(m);
                  const tex = (m as THREE.MeshStandardMaterial).map;
                  if (tex) textures.add(tex);
                }
              }
            });
          gather(resources);
          gather(festivalScene);
          gather(diceScene);
          gather(gltf.scene);
          gather(boardGltf.scene);
          gather(wealthGltf.scene);
          gather(fortuneGltf.scene);
          gather(note);
          gather(ingot);
          templates.forEach(gather);
          loadedTextures.forEach((texture) => textures.add(texture));
          detached.forEach(gather);
          geometries.forEach((g) => g.dispose());
          materials.forEach((m) => m.dispose());
          textures.forEach((t) => t.dispose());
        };
        // Texture decoding and shader linking can outlive the glTF load on WebKit.
        // Keep the loading state until the GPU programs and a drawn frame are ready.
        await renderer.compileAsync(scene, camera);
        if (disposed) return;
        await festivalRenderer.compileAsync(festivalScene, camera);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (!disposed) setReady(true);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : 'Rendu 3D indisponible');
      }
    };
    void initialize();
    return () => {
      disposed = true;
      update.current = () => {};
      pan.current = () => {};
      panEnabled.current = false;
      if (manualView.current) {
        manualView.current = null;
        panCallback.current?.(false);
      }
      renderer?.setAnimationLoop(null);
      observer?.disconnect();
      cleanup();
      renderer?.dispose();
      renderer?.domElement.remove();
      festivalRenderer?.dispose();
      festivalRenderer?.domElement.remove();
    };
  }, []);
  useEffect(() => {
    if (ready || error) onReady?.();
  }, [ready, error, onReady]);
  const maskId = useId().replace(/:/g, '');
  const visualKey = JSON.stringify([state.properties, state.festivals, choices]);
  useEffect(() => {
    update.current();
  }, [visualKey]);
  return (
    <div
      ref={shell}
      className={`board-shell board-3d ${!demo && onZoomChange ? (mobile ? 'board-pinch-zoom' : 'board-mouse-controls') : ''} ${demo ? 'board-demo' : ''} ${cue?.reason === 'earthquake' && !reducedMotion ? 'board-earthquake' : ''}`}
    >
      <div
        ref={host}
        className="board-canvas"
        role="img"
        aria-label={translate('Plateau 3D Money Tour')}
      />
      {!ready && !error && (
        <div className="board-loading">{translate('Construction de votre archipel…')}</div>
      )}
      {ready && (
        <>
          <div className="pawn-foreground-layer" aria-hidden="true">
            {state.players.map((player, i) => (
              <span
                key={player.id}
                ref={(element) => {
                  foregroundPawns.current[i] = element;
                }}
                className="pawn-foreground"
                style={{
                  backgroundImage: `url(${import.meta.env.BASE_URL}textures/travelers-v3.webp)`,
                  backgroundPosition: `${i % 2 ? 100 : 0}% ${i < 2 ? 0 : 100}%`,
                }}
              />
            ))}
          </div>
          {insuranceFocus && choices.length > 0 && (
            <svg
              className="insurance-spotlight"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
                  <rect width="100" height="100" fill="white" />
                  {choices.map((id) => (
                    <polygon key={id} points={anchors[id]?.points} fill="black" />
                  ))}
                </mask>
              </defs>
              <rect
                width="100"
                height="100"
                fill="#071f2c"
                fillOpacity="0.76"
                mask={`url(#${maskId})`}
              />
            </svg>
          )}
          {!demo && (
            <svg
              className="board-hit-polygons"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-label={translate('Cases du plateau')}
            >
              {state.config.board.map((t, i) => (
                <polygon
                  key={t.id}
                  points={anchors[i]?.points}
                  tabIndex={0}
                  role="button"
                  aria-label={
                    translate(choices.includes(t.id) ? 'Choisir ' : 'Voir ') +
                    translate(tileTitle(t)) +
                    translate(
                      state.players.some(
                        (p) =>
                          p.insurance?.tile === t.id && p.id === state.properties[t.id]?.ownerId,
                      )
                        ? ' · Propriété assurée'
                        : '',
                    ) +
                    translate(auctionTile === t.id ? ' · Aux enchères' : '')
                  }
                  className={`${reservedCity(state, t.id) ? 'market-reserved ' : ''}${
                    auctionTile === t.id
                      ? 'auction-highlight'
                      : strategicTiles.includes(t.id) && !selecting
                        ? 'strategy-highlight'
                        : badgeStyle === 'outline' &&
                            !inspectedOwner &&
                            !selecting &&
                            auctionTile === undefined &&
                            state.players.some(
                              (p) =>
                                p.insurance?.tile === t.id &&
                                p.id === state.properties[t.id]?.ownerId,
                            )
                          ? 'insured-outline'
                          : inspectedOwner
                            ? state.properties[t.id]?.ownerId === inspectedOwner
                              ? 'profile-highlight'
                              : 'choice-dimmed'
                            : choices.includes(t.id)
                              ? 'selectable'
                              : selecting
                                ? 'choice-dimmed'
                                : ''
                  }`}
                  data-market-reserved={reservedCity(state, t.id) || undefined}
                  style={
                    {
                      '--insurance-color':
                        colors[
                          state.players.findIndex((p) => p.id === state.properties[t.id]?.ownerId)
                        ],
                    } as React.CSSProperties
                  }
                  onClick={() => onTile(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onTile(t.id);
                    }
                  }}
                />
              ))}
            </svg>
          )}
          {!demo &&
            !selecting &&
            state.players.map(
              (player, i) =>
                !player.eliminated &&
                pawnAnchors[i] && (
                  <button
                    key={player.id}
                    className="pawn-hit"
                    aria-label={formatText('Taunts de {0}', player.name)}
                    disabled={!onPlayer}
                    onClick={() => onPlayer?.(player.id)}
                    style={
                      {
                        left: pawnAnchors[i]!.x + '%',
                        top: pawnAnchors[i]!.y + '%',
                        width: pawnAnchors[i]!.width + '%',
                        height: pawnAnchors[i]!.height + '%',
                        '--pawn-color': colors[i],
                        '--pawn-position': `${i % 2 ? 100 : 0}% ${i < 2 ? 0 : 100}%`,
                      } as React.CSSProperties
                    }
                  >
                    <span
                      className="pawn-outline"
                      style={{
                        backgroundImage: `url(${import.meta.env.BASE_URL}textures/travelers-v3.webp)`,
                      }}
                    />
                  </button>
                ),
            )}
          {!demo &&
            taunt &&
            (() => {
              const i = state.players.findIndex((p) => p.id === taunt.playerId),
                a = pawnAnchors[i];
              return a ? (
                <img
                  className="pawn-taunt"
                  src={tauntAsset(i, taunt.kind)}
                  alt=""
                  style={{ left: a.x + '%', top: a.y - a.height + '%' }}
                />
              ) : null;
            })()}
          <div className="board-labels" aria-hidden="true">
            {!demo &&
              state.players.map((p, i) => (
                <div
                  className="bank-label"
                  key={p.id}
                  style={{
                    left: bankAnchors[i]?.x + '%',
                    top: bankAnchors[i]?.y + '%',
                    borderColor: colors[i],
                  }}
                >
                  <b>{p.name}</b>
                  <strong>{new Intl.NumberFormat(numberLocale()).format(p.cash)} 💵</strong>
                </div>
              ))}
            <div className="board-watermark">
              {translate('MONEY')}
              <br />
              {translate('TOUR ')}
              <span>✦</span>
            </div>
            {state.players.map((player, i) => {
              const id = player.insurance?.tile;
              if (id == null || state.properties[id]?.ownerId !== player.id || !anchors[id])
                return null;
              return (
                <InsuranceBadge
                  key={player.id}
                  tile={id}
                  color={colors[i]!}
                  matrix={anchors[id]!.labels.insurance}
                  variant={badgeStyle}
                />
              );
            })}
            {state.config.board.map((t, i) => {
              return (
                <TileLabel
                  key={t.id}
                  id={t.id}
                  name={translate(boardTileTitle(t))}
                  insured={
                    badgeStyle !== 'outline' &&
                    state.players.some(
                      (p) => p.insurance?.tile === t.id && p.id === state.properties[t.id]?.ownerId,
                    )
                  }
                  anchors={anchors[i]?.labels}
                  dimmed={
                    !!(inspectedOwner
                      ? state.properties[t.id]?.ownerId !== inspectedOwner
                      : selecting && !choices.includes(t.id))
                  }
                  conditions={[
                    ...(state.properties[t.id]?.roachTurns
                      ? [`−50 % · ${state.properties[t.id]?.roachTurns} tours`]
                      : []),
                  ]}
                  rent={
                    state.properties[t.id]?.ownerId
                      ? new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 3 }).format(
                          getRent(state, t.id),
                        )
                      : undefined
                  }
                />
              );
            })}
          </div>
        </>
      )}
      {error && (
        <div className="board-fallback">
          <p>
            {translate('Le rendu 3D n’a pas pu démarrer : ')}
            {translate(error)}
          </p>
          <div className="tile-list">
            {state.config.board.map((t) => (
              <button key={t.id} onClick={() => onTile(t.id)}>
                {translate(tileTitle(t))}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
