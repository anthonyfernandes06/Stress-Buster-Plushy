import { useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { BoxGeometry, MeshStandardMaterial, type Texture } from 'three';
import { ROOM } from '../config';
import { useStore } from '../state/store';
import { floorTexture, plasterTexture } from './textures';
import { WINDOW } from './props/Window';

const W = ROOM.halfWidth;
const T = ROOM.wallThickness;
const H = ROOM.height;
const BACK = ROOM.back;
const FRONT = ROOM.front;

export const WALL_COLOR = '#EFE6DA';

/** Box geometry with UVs scaled to world size, so tiled textures keep their scale. */
function worldBox(w: number, h: number, d: number, tile: number) {
  const g = new BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i));
    const ny = Math.abs(n.getY(i));
    // pick the two box dimensions spanning this face
    const [su, sv] = nx > 0.5 ? [d, h] : ny > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  return g;
}

function wallMaterial(map: Texture) {
  return new MeshStandardMaterial({ color: WALL_COLOR, map, roughness: 0.94 });
}

/** Invisible walls along the visible edge of the floor, recomputed on resize. */
function ViewBounds() {
  const segments = useStore((s) => s.viewBounds);
  const key = segments.map((s) => `${s.a.join()}:${s.b.join()}`).join('|');
  if (!segments.length) return null;
  return (
    <RigidBody key={key} type="fixed" colliders={false} userData={{ kind: 'screen' }}>
      {segments.map((s, i) => {
        const dx = s.b[0] - s.a[0];
        const dz = s.b[1] - s.a[1];
        const len = Math.hypot(dx, dz);
        // outward normal (away from the middle of the room)
        let nx = dz / len;
        let nz = -dx / len;
        const mx = (s.a[0] + s.b[0]) / 2;
        const mz = (s.a[1] + s.b[1]) / 2;
        if (nx * mx + nz * (mz + 1) < 0) {
          nx = -nx;
          nz = -nz;
        }
        return (
          <CuboidCollider
            key={i}
            args={[len / 2 + 0.6, H, 0.5]}
            position={[mx + nx * 0.5, H, mz + nz * 0.5]}
            rotation={[0, -Math.atan2(dz, dx), 0]}
            restitution={ROOM.restitution.wall}
            friction={ROOM.friction.wall}
          />
        );
      })}
    </RigidBody>
  );
}

/**
 * The room shell: floor, back / left / right walls (the left wall has a real
 * window opening so the low sun throws a light patch), ceiling with crown
 * molding, skirting, and every collider that keeps things inside.
 */
export function Room() {
  const mats = useMemo(() => {
    const plaster = plasterTexture();
    const edge = new MeshStandardMaterial({ color: '#C79E73', roughness: 0.8 });
    const top = new MeshStandardMaterial({ map: floorTexture(), roughness: 0.48, metalness: 0, envMapIntensity: 0.8 });
    return {
      // BoxGeometry face order: +x, -x, +y, -y, +z, -z
      floor: [edge, edge, top, edge, edge, edge],
      wall: wallMaterial(plaster),
      // the ceiling only sees the hemisphere's warm "ground" colour, so fake some bounce light
      ceiling: new MeshStandardMaterial({ color: '#F6F1EA', map: plaster, roughness: 0.96, emissive: '#B8AA98', emissiveIntensity: 0.35 }),
      trim: new MeshStandardMaterial({ color: '#F7F2EA', roughness: 0.6 }),
    };
  }, []);

  const depth = FRONT - BACK + T;
  const zMid = (FRONT + BACK - T) / 2;
  const fullW = 2 * (W + T);

  const geos = useMemo(() => {
    const { z0, z1, y0, y1 } = WINDOW;
    const left: { z: [number, number]; y: [number, number] }[] = [
      { z: [BACK - T, z0], y: [0, H] },
      { z: [z1, FRONT], y: [0, H] },
      { z: [z0, z1], y: [0, y0] },
      { z: [z0, z1], y: [y1, H] },
    ];
    return {
      back: worldBox(fullW, H, T, 3.2),
      right: worldBox(T, H, depth, 3.2),
      ceiling: worldBox(fullW, T, depth, 3),
      left: left.map((p) => ({
        geo: worldBox(T, p.y[1] - p.y[0], p.z[1] - p.z[0], 3.2),
        pos: [-W - T / 2, (p.y[0] + p.y[1]) / 2, (p.z[0] + p.z[1]) / 2] as [number, number, number],
      })),
    };
  }, [depth, fullW]);

  const wallRest = ROOM.restitution.wall;
  const wallFric = ROOM.friction.wall;

  return (
    <group>
      {/* floor slab */}
      <mesh position={[0, -0.15, zMid]} material={mats.floor} receiveShadow>
        <boxGeometry args={[fullW, 0.3, depth]} />
      </mesh>

      {/* walls + ceiling */}
      <mesh geometry={geos.back} position={[0, H / 2, BACK - T / 2]} material={mats.wall} castShadow receiveShadow />
      <mesh geometry={geos.right} position={[W + T / 2, H / 2, zMid]} material={mats.wall} castShadow receiveShadow />
      {geos.left.map((p, i) => (
        <mesh key={i} geometry={p.geo} position={p.pos} material={mats.wall} castShadow receiveShadow />
      ))}
      <mesh geometry={geos.ceiling} position={[0, H + T / 2, zMid]} material={mats.ceiling} castShadow receiveShadow />

      {/* crown molding */}
      <mesh position={[0, H - 0.05, BACK + 0.03]} material={mats.trim}>
        <boxGeometry args={[2 * W, 0.1, 0.06]} />
      </mesh>
      <mesh position={[-W + 0.03, H - 0.05, zMid]} material={mats.trim}>
        <boxGeometry args={[0.06, 0.1, depth]} />
      </mesh>
      <mesh position={[W - 0.03, H - 0.05, zMid]} material={mats.trim}>
        <boxGeometry args={[0.06, 0.1, depth]} />
      </mesh>

      {/* skirting boards */}
      <mesh position={[0, 0.07, BACK + 0.018]} material={mats.trim} receiveShadow>
        <boxGeometry args={[2 * W, 0.14, 0.036]} />
      </mesh>
      <mesh position={[-W + 0.018, 0.07, zMid]} material={mats.trim} receiveShadow>
        <boxGeometry args={[0.036, 0.14, depth]} />
      </mesh>
      <mesh position={[W - 0.018, 0.07, zMid]} material={mats.trim} receiveShadow>
        <boxGeometry args={[0.036, 0.14, depth]} />
      </mesh>

      {/* ---- physics shell ---- */}
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'floor' }}>
        <CuboidCollider
          args={[W + 1, 0.5, (depth + 2) / 2]}
          position={[0, -0.5, zMid]}
          restitution={ROOM.restitution.floor}
          friction={ROOM.friction.floor}
        />
      </RigidBody>
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'wall' }}>
        <CuboidCollider args={[W + 1, H, 0.5]} position={[0, H, BACK - 0.5]} restitution={wallRest} friction={wallFric} />
        <CuboidCollider args={[0.5, H, (depth + 2) / 2]} position={[-W - 0.5, H, zMid]} restitution={wallRest} friction={wallFric} />
        <CuboidCollider args={[0.5, H, (depth + 2) / 2]} position={[W + 0.5, H, zMid]} restitution={wallRest} friction={wallFric} />
      </RigidBody>
      {/* last-resort front stop, well out of frame (part of the "screen") */}
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'screen' }}>
        <CuboidCollider args={[W + 1, H, 0.5]} position={[0, H, FRONT - 1]} restitution={wallRest} friction={wallFric} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'ceiling' }}>
        <CuboidCollider args={[W + 1, 0.5, (depth + 2) / 2]} position={[0, H + 0.5, zMid]} restitution={0.3} />
      </RigidBody>
      <ViewBounds />
    </group>
  );
}
