import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { MeshStandardMaterial } from 'three';
import { ROOM } from '../config';
import { floorTexture } from './textures';
import { WINDOW } from './props/Window';

const H = ROOM.half;
const T = ROOM.wallThickness;
const WH = ROOM.wallHeight;
const FT = ROOM.floorThickness;

export const WALL_COLOR = '#EFE6DA';

/**
 * Floor slab, back + left walls (the left wall has a window opening so the
 * low sun throws a real light patch), skirting, and the invisible colliders
 * that keep everything inside the room.
 */
export function Room() {
  const floorMats = useMemo(() => {
    const edge = new MeshStandardMaterial({ color: '#C79E73', roughness: 0.8 });
    const top = new MeshStandardMaterial({ map: floorTexture(), roughness: 0.48, metalness: 0, envMapIntensity: 0.8 });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    return [edge, edge, top, edge, edge, edge];
  }, []);

  const wallMat = useMemo(() => new MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.94 }), []);
  const capMat = useMemo(() => new MeshStandardMaterial({ color: '#E2D6C5', roughness: 0.9 }), []);
  const skirtMat = useMemo(() => new MeshStandardMaterial({ color: '#F6F0E6', roughness: 0.6 }), []);

  const fx0 = -H - T;
  const fullX = 2 * H + T;
  const wallY = (WH - FT) / 2;
  const wallFullH = WH + FT;

  // left wall pieces around the window opening (z0..z1, y0..y1)
  const { z0, z1, y0, y1 } = WINDOW;
  const leftPieces: { z: [number, number]; y: [number, number] }[] = [
    { z: [-H - T, z0], y: [-FT, WH] },
    { z: [z1, H], y: [-FT, WH] },
    { z: [z0, z1], y: [-FT, y0] },
    { z: [z0, z1], y: [y1, WH] },
  ];

  return (
    <group>
      {/* floor slab */}
      <mesh position={[fx0 + fullX / 2, -FT / 2, fx0 + fullX / 2]} material={floorMats} receiveShadow>
        <boxGeometry args={[fullX, FT, fullX]} />
      </mesh>

      {/* back wall */}
      <RoundedBox
        args={[fullX, wallFullH, T]}
        radius={0.03}
        smoothness={2}
        position={[fx0 + fullX / 2, wallY, -H - T / 2]}
        material={wallMat}
        castShadow
        receiveShadow
      />
      {/* left wall, built around the window */}
      {leftPieces.map((p, i) => (
        <mesh
          key={i}
          position={[-H - T / 2, (p.y[0] + p.y[1]) / 2, (p.z[0] + p.z[1]) / 2]}
          material={wallMat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[T, p.y[1] - p.y[0], p.z[1] - p.z[0]]} />
        </mesh>
      ))}
      {/* soft caps on the cut wall tops */}
      <mesh position={[-H - T / 2, WH + 0.006, (fx0 + H) / 2]} material={capMat}>
        <boxGeometry args={[T + 0.004, 0.012, fullX]} />
      </mesh>
      <mesh position={[fx0 + fullX / 2, WH + 0.006, -H - T / 2]} material={capMat}>
        <boxGeometry args={[fullX, 0.012, T + 0.004]} />
      </mesh>

      {/* skirting boards */}
      <mesh position={[0, 0.06, -H + 0.018]} material={skirtMat} receiveShadow>
        <boxGeometry args={[2 * H, 0.12, 0.036]} />
      </mesh>
      <mesh position={[-H + 0.018, 0.06, 0]} material={skirtMat} receiveShadow>
        <boxGeometry args={[0.036, 0.12, 2 * H]} />
      </mesh>

      {/* Invisible shadow-only ceiling so the sun only enters through the window. */}
      <mesh position={[0.3, WH + 0.05, 0.3]} castShadow>
        <boxGeometry args={[2 * H + 1.2, 0.05, 2 * H + 1.2]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>

      {/* ---- physics shell ---- */}
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'floor' }}>
        <CuboidCollider
          args={[H + 1, 0.5, H + 1]}
          position={[0, -0.5, 0]}
          restitution={ROOM.restitution.floor}
          friction={ROOM.friction.floor}
        />
      </RigidBody>
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'wall' }}>
        {/* back + left (visible) */}
        <CuboidCollider args={[H + 1, 4, 0.5]} position={[0, 3, -H - 0.5]} restitution={ROOM.restitution.wall} friction={ROOM.friction.wall} />
        <CuboidCollider args={[0.5, 4, H + 1]} position={[-H - 0.5, 3, 0]} restitution={ROOM.restitution.wall} friction={ROOM.friction.wall} />
        {/* front + right (invisible, open to the camera) */}
        <CuboidCollider args={[H + 1, 4, 0.5]} position={[0, 3, H + 0.5]} restitution={ROOM.restitution.wall} friction={ROOM.friction.wall} />
        <CuboidCollider args={[0.5, 4, H + 1]} position={[H + 0.5, 3, 0]} restitution={ROOM.restitution.wall} friction={ROOM.friction.wall} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'ceiling' }}>
        <CuboidCollider args={[H + 1, 0.5, H + 1]} position={[0, ROOM.ceiling + 0.5, 0]} restitution={0.3} />
      </RigidBody>
    </group>
  );
}
