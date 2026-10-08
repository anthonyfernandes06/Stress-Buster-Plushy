import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, Color, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { runtime } from '../../state/runtime';
import { powSprite, ringSprite } from '../textures';
import { FX_LAYER } from '../layers';

const POOL = 10;
const DURATION = 0.26;
const Z = new Vector3(0, 0, 1);
const _n = new Vector3();

interface Ring {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  t: number;
  size: number;
  billboard: boolean;
}

/** Flat expanding rings (contacts) and comic "pow" bursts (punches, bat). */
export function ImpactRings() {
  const camera = useThree((s) => s.camera);
  const geo = useMemo(() => new PlaneGeometry(1, 1), []);
  const rings = useRef<Ring[]>([]);
  const cursor = useRef(0);

  const pool = useMemo(() => {
    const list: Ring[] = [];
    for (let i = 0; i < POOL; i++) {
      const mat = new MeshBasicMaterial({
        map: ringSprite(),
        color: new Color(1.6, 1.55, 1.45),
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        opacity: 0,
      });
      const mesh = new Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 14;
      mesh.layers.set(FX_LAYER);
      list.push({ mesh, mat, t: 1, size: 1, billboard: false });
    }
    return list;
  }, [geo]);

  useEffect(() => {
    rings.current = pool;
    const q = new Quaternion();
    runtime.fx.ring = (point, normal, size, kind = 'ring') => {
      const r = pool[cursor.current];
      cursor.current = (cursor.current + 1) % POOL;
      r.t = 0;
      r.size = size;
      r.billboard = kind === 'pow';
      r.mat.map = kind === 'pow' ? powSprite() : ringSprite();
      r.mesh.position.copy(point);
      _n.copy(normal);
      if (_n.lengthSq() < 0.5) _n.set(0, 1, 0);
      // floor-ish contacts lie flat; others face along the contact normal
      r.mesh.quaternion.copy(q.setFromUnitVectors(Z, _n.normalize()));
      r.mesh.position.addScaledVector(_n, 0.03);
      r.mesh.visible = true;
    };
  }, [pool]);

  useFrame((_, dt) => {
    for (const r of pool) {
      if (!r.mesh.visible) continue;
      r.t += Math.min(dt, 0.05) / DURATION;
      if (r.t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - r.t, 3);
      const s = r.size * (0.25 + e * (r.billboard ? 0.9 : 1.1));
      r.mesh.scale.set(s, s, s);
      r.mat.opacity = (1 - r.t) * (r.billboard ? 1 : 0.85);
      if (r.billboard) r.mesh.quaternion.copy(camera.quaternion);
    }
  });

  return (
    <>
      {pool.map((r, i) => (
        <primitive key={i} object={r.mesh} />
      ))}
    </>
  );
}
