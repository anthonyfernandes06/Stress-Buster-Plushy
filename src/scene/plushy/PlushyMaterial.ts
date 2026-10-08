import { Color, MeshPhysicalMaterial, Vector2 } from 'three';
import { fabricNormal } from '../textures';

/**
 * Velvet plush material: MeshPhysicalMaterial with sheen, a fabric normal
 * map and three injected terms:
 *  - aChar (per-vertex 0..1): blends toward soot, kills sheen, roughens
 *  - aHeat (per-vertex 0..1): orange emissive glow while heated / burning
 *  - uHitFlash (uniform 0..1): brief white flash on hard hits
 *  - aUnder (per-vertex 0..1): cream underside blend for the tentacles
 */
export interface PlushyUniforms {
  uHitFlash: { value: number };
  uTime: { value: number };
}

export function createPlushyMaterial(uniforms: PlushyUniforms, normalRepeat: [number, number]) {
  const normal = fabricNormal().clone();
  normal.repeat.set(...normalRepeat);
  normal.needsUpdate = true;

  const mat = new MeshPhysicalMaterial({
    color: '#F2A516',
    roughness: 0.85,
    sheen: 1.0,
    sheenColor: new Color('#FFE3A1'),
    sheenRoughness: 0.5,
    normalMap: normal,
    normalScale: new Vector2(0.38, 0.38),
    envMapIntensity: 0.6,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHitFlash = uniforms.uHitFlash;
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uCharColor = { value: new Color('#2A2018') };
    shader.uniforms.uUnderColor = { value: new Color('#F8E2A6') };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aChar;
        attribute float aHeat;
        attribute float aUnder;
        varying float vChar;
        varying float vHeat;
        varying float vUnder;
        varying vec2 vSootUv;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vChar = aChar;
        vHeat = aHeat;
        vUnder = aUnder;
        vSootUv = uv;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uHitFlash;
        uniform float uTime;
        uniform vec3 uCharColor;
        uniform vec3 uUnderColor;
        varying float vChar;
        varying float vHeat;
        varying float vUnder;
        varying vec2 vSootUv;
        float sootHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sootNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(sootHash(i), sootHash(i + vec2(1.0, 0.0)), u.x), mix(sootHash(i + vec2(0.0, 1.0)), sootHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float sootFbm(vec2 p) { return sootNoise(p) * 0.55 + sootNoise(p * 2.3 + 7.1) * 0.3 + sootNoise(p * 5.1 + 3.7) * 0.15; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, uUnderColor, clamp(vUnder, 0.0, 1.0));
        // blotchy soot: noise anchored to the fabric UVs so it never swims
        float soot = sootFbm(vSootUv * vec2(9.0, 7.0));
        float charAmt = smoothstep(0.18, 0.8, vChar + (soot - 0.5) * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, uCharColor, charAmt * (0.82 + soot * 0.15));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 1.0, charAmt);`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_SHEEN
          material.sheenColor *= (1.0 - charAmt * 0.9);
        #endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float flick = 0.75 + 0.25 * sin(uTime * 17.0 + vViewPosition.x * 9.0 + vViewPosition.y * 7.0);
        totalEmissiveRadiance += vec3(1.0, 0.26, 0.03) * clamp(vHeat, 0.0, 1.0) * flick * 1.3;
        totalEmissiveRadiance += vec3(1.0, 0.93, 0.82) * uHitFlash * 0.22;`,
      );
  };
  // separate cache key: the injected code differs from a stock physical material
  mat.customProgramCacheKey = () => 'plushy-velvet-v2';
  return mat;
}
