import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  MeshStandardMaterial,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { ROOM } from '../../config';
import { skyTexture, softDot } from '../textures';
import { FX_LAYER } from '../layers';

/** Window opening in the left wall (world units). */
export const WINDOW = { z0: -1.3, z1: 0.3, y0: 1.1, y1: 2.75 };

/** Direction *towards* the low afternoon sun. */
export const SUN_DIR = new Vector3(-8, 5, -1.6).normalize();

const H = ROOM.halfWidth;
const T = ROOM.wallThickness;

/**
 * Window: frame, glowing sky pane and faint volumetric light shafts.
 * Light only — no collider beyond the wall itself.
 */
export function Window() {
  const { z0, z1, y0, y1 } = WINDOW;
  const zc = (z0 + z1) / 2;
  const yc = (y0 + y1) / 2;
  const w = z1 - z0;
  const h = y1 - y0;
  const xIn = -H; // inner wall face
  const xMid = -H - T / 2;

  const frameMat = useMemo(() => new MeshStandardMaterial({ color: '#F8F3EA', roughness: 0.55 }), []);

  const shaft = useMemo(() => {
    // Extrude the window outline along the sun direction down to the floor.
    const corners = [
      new Vector3(xIn - 0.02, y0, z0),
      new Vector3(xIn - 0.02, y0, z1),
      new Vector3(xIn - 0.02, y1, z1),
      new Vector3(xIn - 0.02, y1, z0),
    ];
    const down = SUN_DIR.clone().negate();
    const floorPts = corners.map((c) => c.clone().addScaledVector(down, c.y / -down.y));
    const pos: number[] = [];
    const tt: number[] = [];
    const edge: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const fa = floorPts[i];
      const fb = floorPts[(i + 1) % 4];
      const quad = [a, b, fb, a, fb, fa];
      const qt = [0, 0, 1, 0, 1, 1];
      const qe = [0, 1, 1, 0, 1, 0];
      quad.forEach((p, j) => {
        pos.push(p.x, p.y, p.z);
        tt.push(qt[j]);
        edge.push(qe[j]);
      });
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aT', new BufferAttribute(new Float32Array(tt), 1));
    g.setAttribute('aEdge', new BufferAttribute(new Float32Array(edge), 1));
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uOpacity: { value: 0.075 }, uColor: { value: new Vector3(1.0, 0.86, 0.66) } },
      vertexShader: /* glsl */ `
        attribute float aT; attribute float aEdge;
        varying float vT; varying float vEdge;
        void main(){ vT = aT; vEdge = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform vec3 uColor;
        varying float vT; varying float vEdge;
        void main(){
          float a = pow(1.0 - vT, 1.6) * smoothstep(0.0, 0.25, vEdge) * smoothstep(1.0, 0.75, vEdge);
          gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
        }
      `,
    });
    return { g, m, floorPts };
  }, [xIn, y0, y1, z0, z1]);

  // floating dust motes inside the beam
  const motes = useMemo(() => {
    const n = 36;
    const base = new Float32Array(n * 3);
    const down = SUN_DIR.clone().negate();
    for (let i = 0; i < n; i++) {
      const p = new Vector3(xIn, y0 + Math.random() * h, z0 + Math.random() * w);
      p.addScaledVector(down, Math.random() * (p.y / -down.y) * 0.85);
      base.set([p.x, p.y, p.z], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(base.slice(), 3));
    return { g, base, n };
  }, [xIn, y0, h, z0, w]);
  const motesRef = useRef<Points>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const attr = motes.g.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < motes.n; i++) {
      const o = i * 3;
      attr.array[o] = motes.base[o] + Math.sin(t * 0.21 + i * 1.7) * 0.12;
      attr.array[o + 1] = motes.base[o + 1] + Math.sin(t * 0.17 + i) * 0.15;
      attr.array[o + 2] = motes.base[o + 2] + Math.cos(t * 0.19 + i * 2.3) * 0.12;
    }
    attr.needsUpdate = true;
  });

  return (
    <group>
      {/* sky pane, set back in the wall so the jambs show depth */}
      <mesh position={[xMid - 0.03, yc, zc]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={skyTexture()} color={[1.18, 1.16, 1.12]} />
      </mesh>
      {/* jambs */}
      <mesh position={[xMid, y0 + 0.02, zc]} material={frameMat} receiveShadow>
        <boxGeometry args={[T + 0.02, 0.04, w]} />
      </mesh>
      <mesh position={[xMid, y1 - 0.02, zc]} material={frameMat} castShadow>
        <boxGeometry args={[T + 0.02, 0.04, w]} />
      </mesh>
      <mesh position={[xMid, yc, z0 + 0.02]} material={frameMat} castShadow>
        <boxGeometry args={[T + 0.02, h, 0.04]} />
      </mesh>
      <mesh position={[xMid, yc, z1 - 0.02]} material={frameMat} castShadow>
        <boxGeometry args={[T + 0.02, h, 0.04]} />
      </mesh>
      {/* sill sticking into the room */}
      <mesh position={[xIn + 0.05, y0 - 0.03, zc]} material={frameMat} castShadow receiveShadow>
        <boxGeometry args={[0.16, 0.05, w + 0.16]} />
      </mesh>
      {/* inner trim */}
      <mesh position={[xIn + 0.008, y1 + 0.04, zc]} material={frameMat}>
        <boxGeometry args={[0.016, 0.08, w + 0.16]} />
      </mesh>
      <mesh position={[xIn + 0.008, yc, z0 - 0.04]} material={frameMat}>
        <boxGeometry args={[0.016, h + 0.08, 0.08]} />
      </mesh>
      <mesh position={[xIn + 0.008, yc, z1 + 0.04]} material={frameMat}>
        <boxGeometry args={[0.016, h + 0.08, 0.08]} />
      </mesh>
      {/* muntins (cast the cross shadow in the sun patch) */}
      <mesh position={[xMid - 0.01, yc, zc]} material={frameMat} castShadow>
        <boxGeometry args={[0.04, h, 0.035]} />
      </mesh>
      <mesh position={[xMid - 0.01, yc + h * 0.08, zc]} material={frameMat} castShadow>
        <boxGeometry args={[0.04, 0.035, w]} />
      </mesh>

      {/* light shafts */}
      <mesh geometry={shaft.g} material={shaft.m} renderOrder={5} layers={FX_LAYER} />
      <points ref={motesRef} geometry={motes.g} renderOrder={6} layers={FX_LAYER}>
        <pointsMaterial
          map={softDot()}
          size={0.035}
          color={[1.4, 1.2, 0.9]}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  );
}
