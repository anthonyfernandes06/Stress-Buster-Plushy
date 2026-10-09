import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, TubeGeometry, Vector3 } from 'three';
import { ROOM } from '../../config';
import { runtime } from '../../state/runtime';

const SWAGS = 3;
const PER_SWAG = 13;
const SPAN = 6.4; // across the back wall
const TOP = ROOM.height - 0.3;
const SAG = 0.3;

/** A string of warm bulbs swagged along the top of the back wall. */
export function FairyLights() {
  const bulbs = useRef<InstancedMesh>(null);
  const z = ROOM.back + 0.05;

  const { wire, points } = useMemo(() => {
    const pts: Vector3[] = [];
    const curvePts: Vector3[] = [];
    const x0 = -SPAN / 2;
    const w = SPAN / SWAGS;
    for (let s = 0; s < SWAGS; s++) {
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        const x = x0 + w * (s + u);
        // a soft catenary-ish dip between pins
        const y = TOP - SAG * Math.sin(u * Math.PI) ** 1.4;
        if (s === 0 || i > 0) curvePts.push(new Vector3(x, y, z));
      }
      for (let i = 0; i < PER_SWAG; i++) {
        const u = (i + 0.5) / PER_SWAG;
        pts.push(new Vector3(x0 + w * (s + u), TOP - SAG * Math.sin(u * Math.PI) ** 1.4 - 0.03, z + 0.02));
      }
    }
    return { wire: new TubeGeometry(new CatmullRomCurve3(curvePts), 160, 0.006, 4, false), points: pts };
  }, [z]);

  const wireMat = useMemo(() => new MeshStandardMaterial({ color: '#4A3F36', roughness: 0.7 }), []);
  const bulbMat = useMemo(() => new MeshBasicMaterial(), []);
  const base = useMemo(() => new Color(2.1, 1.05, 0.34), []);
  const phases = useMemo(() => points.map(() => Math.random() * Math.PI * 2), [points]);

  useLayoutEffect(() => {
    const m = bulbs.current;
    if (!m) return;
    const o = new Object3D();
    points.forEach((p, i) => {
      o.position.copy(p);
      o.scale.set(1, 1.35, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, base);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [points, base]);

  const c = useMemo(() => new Color(), []);
  useFrame(({ clock }) => {
    const m = bulbs.current;
    if (!m || !m.instanceColor) return;
    const t = clock.elapsedTime;
    // slow, gentle twinkle; flicker a little while the octopus is on fire nearby
    const fire = Math.min(1, runtime.fireGlow / 6);
    for (let i = 0; i < points.length; i++) {
      const k = 0.82 + 0.18 * Math.sin(t * 0.9 + phases[i]) - fire * 0.25 * Math.random();
      m.setColorAt(i, c.copy(base).multiplyScalar(k));
    }
    m.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <mesh geometry={wire} material={wireMat} />
      <instancedMesh ref={bulbs} args={[undefined, undefined, points.length]} material={bulbMat}>
        <sphereGeometry args={[0.028, 10, 8]} />
      </instancedMesh>
    </group>
  );
}
