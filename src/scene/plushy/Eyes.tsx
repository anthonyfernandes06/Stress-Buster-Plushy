import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CapsuleGeometry,
  Curve,
  Group,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { headNormal, headSurface } from './headShape';

export type EyeMode = 'normal' | 'squeeze' | 'x' | 'dizzy' | 'panic' | 'wide';

/** Mutable expression state written by the plushy every frame. */
export interface EyeController {
  mode: EyeMode;
  blink: number; // 0 open, 1 closed
}

class SpiralCurve extends Curve<Vector3> {
  constructor() {
    super();
  }
  getPoint(t: number, target = new Vector3()) {
    const turns = 2.4;
    const a = t * turns * Math.PI * 2;
    const r = 0.006 + t * 0.052;
    return target.set(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
}

const EYE_YAW = 0.37;
const EYE_PITCH = -0.07;

function placeOnHead(yaw: number, pitch: number, inset: number) {
  const dir = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const p = headSurface(dir, new Vector3());
  const n = headNormal(dir, new Vector3());
  p.addScaledVector(n, -inset);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n);
  return { p, q };
}

function Stroke({ from, to, mat, geo }: { from: [number, number]; to: [number, number]; mat: MeshBasicMaterial; geo: CapsuleGeometry }) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  return (
    <mesh
      geometry={geo}
      material={mat}
      position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 0.012]}
      rotation={[0, 0, Math.atan2(dy, dx) - Math.PI / 2]}
      scale={[1, len / 0.08, 0.6]}
    />
  );
}

function Eye({ side, ctrl, mats }: { side: 1 | -1; ctrl: EyeController; mats: ReturnType<typeof useEyeMaterials> }) {
  const { p, q } = useMemo(() => placeOnHead(side * EYE_YAW, EYE_PITCH, 0.012), [side]);
  const normal = useRef<Group>(null);
  const squeeze = useRef<Group>(null);
  const x = useRef<Group>(null);
  const spiral = useRef<Group>(null);
  const panic = useRef<Group>(null);
  const pupil = useRef<Group>(null);

  useFrame(({ clock }) => {
    const m = ctrl.mode;
    const t = clock.elapsedTime;
    if (normal.current) {
      const show = m === 'normal' || m === 'wide';
      normal.current.visible = show;
      if (show) {
        const s = m === 'wide' ? 1.28 : 1;
        normal.current.scale.set(s, s * Math.max(0.08, 1 - ctrl.blink), s);
      }
    }
    if (squeeze.current) squeeze.current.visible = m === 'squeeze';
    if (x.current) x.current.visible = m === 'x';
    if (spiral.current) {
      spiral.current.visible = m === 'dizzy';
      spiral.current.rotation.z = -t * 7 * side;
    }
    if (panic.current) {
      panic.current.visible = m === 'panic';
      if (pupil.current && m === 'panic') {
        pupil.current.position.x = Math.sin(t * 23 + side) * 0.012;
        pupil.current.position.y = Math.cos(t * 19) * 0.01;
      }
    }
  });

  // ">" on the viewer's left eye, "<" on the right
  const dir = side === 1 ? -1 : 1;
  return (
    <group position={p} quaternion={q}>
      <group ref={normal}>
        <mesh geometry={mats.eyeGeo} material={mats.gloss} scale={[0.95, 1.15, 0.5]} />
        <mesh geometry={mats.dotGeo} material={mats.white} position={[0.022, 0.034, 0.03]} scale={0.2} />
        <mesh geometry={mats.dotGeo} material={mats.white} position={[-0.02, -0.026, 0.03]} scale={0.09} />
      </group>
      <group ref={squeeze} visible={false}>
        <Stroke from={[-0.034 * dir, 0.03]} to={[0.03 * dir, 0]} mat={mats.ink} geo={mats.strokeGeo} />
        <Stroke from={[-0.034 * dir, -0.03]} to={[0.03 * dir, 0]} mat={mats.ink} geo={mats.strokeGeo} />
      </group>
      <group ref={x} visible={false}>
        <Stroke from={[-0.038, 0.038]} to={[0.038, -0.038]} mat={mats.ink} geo={mats.strokeGeo} />
        <Stroke from={[-0.038, -0.038]} to={[0.038, 0.038]} mat={mats.ink} geo={mats.strokeGeo} />
      </group>
      <group ref={spiral} visible={false} position={[0, 0, 0.012]}>
        <mesh geometry={mats.spiralGeo} material={mats.ink} />
      </group>
      <group ref={panic} visible={false}>
        <mesh geometry={mats.eyeGeo} material={mats.sclera} scale={[1.2, 1.32, 0.45]} />
        <group ref={pupil}>
          <mesh geometry={mats.eyeGeo} material={mats.gloss} position={[0, 0, 0.02]} scale={[0.42, 0.48, 0.3]} />
        </group>
      </group>
    </group>
  );
}

function useEyeMaterials() {
  return useMemo(
    () => ({
      gloss: new MeshPhysicalMaterial({ color: '#0E0B09', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
      white: new MeshBasicMaterial({ color: '#FFFFFF' }),
      sclera: new MeshPhysicalMaterial({ color: '#FFFDF8', roughness: 0.25, clearcoat: 0.6 }),
      ink: new MeshBasicMaterial({ color: '#1E1812' }),
      blush: new MeshBasicMaterial({ color: '#F28C6B', transparent: true, opacity: 0.32, depthWrite: false }),
      eyeGeo: new SphereGeometry(0.078, 24, 16),
      dotGeo: new SphereGeometry(0.1, 12, 8),
      strokeGeo: new CapsuleGeometry(0.011, 0.058, 4, 8),
      spiralGeo: new TubeGeometry(new SpiralCurve(), 90, 0.0075, 6, false),
    }),
    [],
  );
}

/** Eyes + blush, in head-local space (inside the squash group). */
export function Eyes({ ctrl }: { ctrl: EyeController }) {
  const mats = useEyeMaterials();
  const cheeks = useMemo(() => [-1, 1].map((s) => placeOnHead(s * 0.6, -0.24, -0.004)), []);
  return (
    <group>
      <Eye side={-1} ctrl={ctrl} mats={mats} />
      <Eye side={1} ctrl={ctrl} mats={mats} />
      {cheeks.map((c, i) => (
        <mesh key={i} position={c.p} quaternion={c.q} material={mats.blush} scale={[1, 0.62, 1]}>
          <circleGeometry args={[0.06, 24]} />
        </mesh>
      ))}
    </group>
  );
}
