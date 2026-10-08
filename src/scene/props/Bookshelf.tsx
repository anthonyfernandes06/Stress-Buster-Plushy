import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier';
import { Group, LatheGeometry, MeshStandardMaterial, Vector2, Vector3 } from 'three';
import { ROOM } from '../../config';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';
import { sound } from '../../audio/SoundManager';
import { Spring } from '../spring';
import { impactSpeed, track, untrack } from '../physicsUtils';

const H = ROOM.half;
export const SHELF = {
  depth: 0.42,
  width: 1.5,
  height: 2.42,
  zc: -2.05,
  board: 0.04,
  side: 0.045,
  levels: [0.1, 0.6, 1.1, 1.6, 2.1],
};
const xc = -H + SHELF.depth / 2;

const BOOK_COLORS = ['#C0704F', '#8FA58A', '#D4A24C', '#7D93A8', '#E6D8C0', '#4A4541', '#9C7484', '#B8865B', '#6F8A7A'];

interface BookSpec {
  id: number;
  pos: [number, number, number];
  size: [number, number, number]; // x(depth) y(height) z(thickness)
  color: string;
  label: string;
  rotX: number;
  kind: 'book' | 'vase' | 'box';
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeBooks(): BookSpec[] {
  const r = rng(42);
  const out: BookSpec[] = [];
  const zStart = SHELF.zc - SHELF.width / 2 + SHELF.side + 0.03;
  const zEnd = SHELF.zc + SHELF.width / 2 - SHELF.side - 0.03;
  const perLevel = [5, 4, 5, 4];
  let id = 0;
  for (let li = 0; li < 4; li++) {
    const y0 = SHELF.levels[li];
    // start position alternates so the rows don't line up
    let z = li % 2 ? zStart + 0.35 + r() * 0.2 : zStart + r() * 0.12;
    for (let b = 0; b < perLevel[li]; b++) {
      const t = 0.07 + r() * 0.05;
      const hgt = 0.28 + r() * 0.13;
      const dep = 0.25 + r() * 0.06;
      if (z + t > zEnd) break;
      out.push({
        id: id++,
        pos: [xc + 0.02, y0 + hgt / 2 + 0.002, z + t / 2],
        size: [dep, hgt, t],
        color: BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)],
        label: r() > 0.5 ? '#F3E9D8' : '#2E2A26',
        rotX: 0,
        kind: 'book',
      });
      z += t + 0.006 + (b === 2 ? 0.18 : 0);
    }
  }
  // top shelf decor
  const y4 = SHELF.levels[4];
  out.push({ id: id++, pos: [xc + 0.02, y4 + 0.11, SHELF.zc - 0.35], size: [0.16, 0.22, 0.16], color: '#C77A55', label: '', rotX: 0, kind: 'vase' });
  out.push({ id: id++, pos: [xc + 0.03, y4 + 0.06, SHELF.zc + 0.25], size: [0.16, 0.12, 0.2], color: '#9DB08F', label: '', rotX: 0, kind: 'box' });
  out.push({ id: id++, pos: [xc + 0.02, y4 + 0.15, SHELF.zc + 0.5], size: [0.24, 0.3, 0.09], color: '#D4A24C', label: '#F3E9D8', rotX: 0, kind: 'book' });
  return out;
}

let lastClatter = 0;
function clatter(speed: number) {
  const now = performance.now();
  if (now - lastClatter < 70 || speed < 1.1) return;
  lastClatter = now;
  sound.play('clatter', { intensity: Math.min(1, speed / 6), pitch: 0.9 + Math.random() * 0.25 });
}

function Book({ spec, register }: { spec: BookSpec; register: (id: number, b: RapierRigidBody | null, g: Group | null) => void }) {
  const body = useRef<RapierRigidBody>(null);
  const vis = useRef<Group>(null);
  const [dx, dy, dz] = spec.size;
  const mat = useMemo(() => new MeshStandardMaterial({ color: spec.color, roughness: 0.75 }), [spec.color]);
  const labelMat = useMemo(() => new MeshStandardMaterial({ color: spec.label || '#fff', roughness: 0.8 }), [spec.label]);
  const vaseGeo = useMemo(() => {
    if (spec.kind !== 'vase') return null;
    const pts = [
      [0.0, -dy / 2],
      [0.06, -dy / 2],
      [0.08, -dy / 2 + 0.05],
      [0.075, 0.02],
      [0.04, dy / 2 - 0.03],
      [0.045, dy / 2],
      [0.035, dy / 2],
    ].map(([x, y]) => new Vector2(x, y));
    return new LatheGeometry(pts, 20);
  }, [spec.kind, dy]);

  useEffect(() => {
    const b = body.current;
    if (b) {
      track(b);
      b.sleep();
    }
    register(spec.id, b, vis.current);
    return () => {
      if (b) untrack(b);
      register(spec.id, null, null);
    };
  }, [register, spec.id]);

  const onHit = (e: CollisionEnterPayload) => {
    const s = impactSpeed(e);
    clatter(s);
  };

  return (
    <RigidBody
      ref={body}
      position={spec.pos}
      colliders={false}
      canSleep
      linearDamping={0.1}
      angularDamping={0.3}
      userData={{ kind: 'book' }}
      onCollisionEnter={onHit}
    >
      {spec.kind === 'vase' ? (
        <CylinderCollider args={[dy / 2, dx / 2]} mass={0.3} friction={0.7} restitution={0.2} />
      ) : (
        <CuboidCollider args={[dx / 2, dy / 2, dz / 2]} mass={spec.kind === 'box' ? 0.15 : 0.22} friction={0.75} restitution={0.15} />
      )}
      <group ref={vis}>
        {spec.kind === 'vase' ? (
          <mesh castShadow receiveShadow geometry={vaseGeo!}>
            <meshStandardMaterial color={spec.color} roughness={0.6} />
          </mesh>
        ) : (
          <>
            <RoundedBox args={[dx, dy, dz]} radius={Math.min(0.012, dz * 0.2)} smoothness={2} material={mat} castShadow receiveShadow />
            {spec.kind === 'book' && (
              <mesh position={[dx / 2 + 0.001, dy * 0.28, 0]} rotation={[0, Math.PI / 2, 0]} material={labelMat}>
                <planeGeometry args={[dz * 0.62, dy * 0.12]} />
              </mesh>
            )}
          </>
        )}
      </group>
    </RigidBody>
  );
}

/** Tall oak bookshelf on the left wall, with knockable books. */
export function Bookshelf() {
  const books = useMemo(makeBooks, []);
  const frame = useRef<Group>(null);
  const rattle = useMemo(() => new Spring(700, 9), []);
  const bodies = useRef(new Map<number, { body: RapierRigidBody; vis: Group | null }>());
  const popIn = useRef(0);

  const oak = useMemo(() => new MeshStandardMaterial({ color: '#D0A472', roughness: 0.62 }), []);
  const back = useMemo(() => new MeshStandardMaterial({ color: '#B7C2A6', roughness: 0.9 }), []);

  const register = useMemo(
    () => (id: number, b: RapierRigidBody | null, g: Group | null) => {
      if (b) bodies.current.set(id, { body: b, vis: g });
      else bodies.current.delete(id);
    },
    [],
  );

  useEffect(() => {
    const tmp = new Vector3();
    runtime.props.shelf = {
      rattle(strength, point) {
        rattle.kick(Math.min(1.6, strength * 0.22));
        const heavy = strength >= 6;
        for (const spec of books) {
          const entry = bodies.current.get(spec.id);
          if (!entry) continue;
          const t = entry.body.translation();
          tmp.set(t.x, t.y, t.z);
          const dz = Math.abs(tmp.z - point.z);
          const dy = Math.abs(tmp.y - point.y);
          const near = dz < 1.0 && dy < 1.4;
          if (!near) continue;
          const m = entry.body.mass();
          if (heavy) {
            const k = (1 - dz / 1.0) * 0.6 + 0.4;
            entry.body.applyImpulse(
              { x: m * (0.9 + Math.random() * 1.4) * k * Math.min(1.6, strength / 7), y: m * (0.4 + Math.random() * 0.8), z: m * (Math.random() - 0.5) * 1.2 },
              true,
            );
            entry.body.applyTorqueImpulse(
              { x: (Math.random() - 0.5) * 0.004, y: (Math.random() - 0.5) * 0.004, z: -(0.002 + Math.random() * 0.006) },
              true,
            );
          } else if (strength > 2.5 && Math.random() < 0.4) {
            entry.body.applyImpulse({ x: m * 0.35, y: m * 0.2, z: 0 }, true);
          }
        }
        if (heavy) sound.play('clatter', { intensity: Math.min(1, strength / 9) });
      },
    };
    return () => {
      delete runtime.props.shelf;
    };
  }, [books, rattle]);

  // room reset: put every book back and pop it in
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.resetToken === prev.resetToken) return;
        for (const spec of books) {
          const e = bodies.current.get(spec.id);
          if (!e) continue;
          // keep them awake so the meshes sync; they fall asleep again once settled
          e.body.setTranslation({ x: spec.pos[0], y: spec.pos[1], z: spec.pos[2] }, true);
          e.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
          e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
        popIn.current = 0.0001;
      }),
    [books],
  );

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    const x = rattle.step(d);
    if (frame.current) {
      frame.current.position.z = x * 0.03;
      frame.current.rotation.x = x * 0.01;
    }
    if (popIn.current > 0) {
      popIn.current = Math.min(1, popIn.current + d * 3.2);
      const p = popIn.current;
      // ease-out-back pop
      const c1 = 1.70158;
      const s = 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
      for (const e of bodies.current.values()) e.vis?.scale.setScalar(Math.max(0.001, s));
      if (p >= 1) {
        for (const e of bodies.current.values()) e.vis?.scale.setScalar(1);
        popIn.current = 0;
      }
    }
  });

  const { depth, width, height, zc, board, side, levels } = SHELF;
  const zL = zc - width / 2 + side / 2;
  const zR = zc + width / 2 - side / 2;

  return (
    <group>
      <group ref={frame}>
        {/* sides */}
        {[zL, zR].map((z, i) => (
          <RoundedBox key={i} args={[depth, height, side]} radius={0.012} smoothness={2} position={[xc, height / 2, z]} material={oak} castShadow receiveShadow />
        ))}
        {/* back panel */}
        <mesh position={[-H + 0.012, height / 2, zc]} material={back} receiveShadow>
          <boxGeometry args={[0.02, height - 0.02, width - side * 2]} />
        </mesh>
        {/* shelves + top */}
        {[...levels, height].map((y, i) => (
          <RoundedBox
            key={i}
            args={[depth, board, width - side * 2 + 0.002]}
            radius={0.008}
            smoothness={2}
            position={[xc, y - board / 2, zc]}
            material={oak}
            castShadow
            receiveShadow
          />
        ))}
        {/* kick plate */}
        <mesh position={[xc + depth / 2 - 0.02, 0.04, zc]} material={oak} castShadow>
          <boxGeometry args={[0.03, 0.08, width - side * 2]} />
        </mesh>
      </group>

      <RigidBody type="fixed" colliders={false} userData={{ kind: 'shelf' }}>
        {[zL, zR].map((z, i) => (
          <CuboidCollider key={i} args={[depth / 2, height / 2, side / 2]} position={[xc, height / 2, z]} restitution={0.25} />
        ))}
        {[...levels, height].map((y, i) => (
          <CuboidCollider key={`s${i}`} args={[depth / 2, board / 2, width / 2 - side]} position={[xc, y - board / 2, zc]} restitution={0.2} />
        ))}
        <CuboidCollider args={[0.01, height / 2, width / 2]} position={[-H + 0.01, height / 2, zc]} />
      </RigidBody>

      {books.map((b) => (
        <Book key={b.id} spec={b} register={register} />
      ))}
    </group>
  );
}
