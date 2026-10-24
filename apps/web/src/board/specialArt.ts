import * as THREE from 'three';

export function illustratedSprite(map: THREE.Texture, size: number, base = 0.05) {
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  sprite.center.set(0.5, base);
  sprite.scale.set(size, size, 1);
  return sprite;
}

/** Slow, smooth speaker excursion. Pause and reduced motion leave the art still. */
export function festivalBeat(time: number, reducedMotion: boolean) {
  return reducedMotion ? 0 : Math.pow((Math.sin((time * Math.PI) / 325) + 1) / 2, 3);
}

export function concertSprite(map: THREE.Texture, size: number) {
  const sprite = illustratedSprite(map, size, 0.15);
  const beat = { value: 0 };
  sprite.material.onBeforeCompile = (shader) => {
    shader.uniforms.concertBeat = beat;
    shader.fragmentShader =
      `
      uniform float concertBeat;
      vec2 pulseCone(vec2 uv, vec2 center) {
        float mask = 1.0 - smoothstep(0.034, 0.060, length(uv - center));
        return center + (uv - center) / (1.0 + concertBeat * 0.16 * mask);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec2 concertUv = vMapUv;
      concertUv = pulseCone(concertUv, vec2(0.124, 0.558));
      concertUv = pulseCone(concertUv, vec2(0.124, 0.450));
      concertUv = pulseCone(concertUv, vec2(0.877, 0.558));
      concertUv = pulseCone(concertUv, vec2(0.877, 0.450));
      ${THREE.ShaderChunk.map_fragment.replaceAll('vMapUv', 'concertUv')}
    `,
    );
  };
  sprite.material.customProgramCacheKey = () => 'festival-cones-v2';
  return { sprite, beat };
}
