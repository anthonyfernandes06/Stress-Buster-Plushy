import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Group, InstancedMesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { ROOM } from '../../config';
import { runtime } from '../../state/runtime';
import { Spring } from '../spring';

export const CONSOLE = { w: 2.6, h: 0.52, d: 0.6, legH: 0.1 };

/** Low oak media console with two slatted doors. Fixed collider. */
export function MediaConsole() {
  const { w, h, d, legH } = CONSOLE;
  const z = ROOM.back + d / 2 + 0.02;
  const bodyY = legH + h / 2;
  const group = useRef<Group>(null);
  const jolt = useMemo(() => new Spring(900, 22), []);

  const oak = useMemo(() => new MeshStandardMaterial({ color: '#C89463', roughness: 0.62 }), []);
  const oakDark = useMemo(() => new MeshStandardMaterial({ color: '#A8774A', roughness: 0.7 }), []);
  const metal = useMemo(() => new MeshStandardMaterial({ color: '#3A3430', roughness: 0.45, metalness: 0.4 }), []);

  const slatsRef = useRef<InstancedMesh>(null);
  const slatCount = 32;
  useLayoutEffect(() => {
    const m = slatsRef.current;
    if (!m) return;
    const o = new Object3D();
    const doorW = w / 2 - 0.08;
    const perDoor = slatCount / 2;
    const step = doorW / perDoor;
    let i = 0;
    for (const side of [-1, 1]) {
      const cx = side * (w / 4);
      for (let k = 0; k < perDoor; k++) {
        o.position.set(cx - doorW / 2 + step * (k + 0.5), bodyY - 0.01, z + d / 2 + 0.008);
        o.updateMatrix();
        m.setMatrixAt(i++, o.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }, [w, d, z, bodyY]);

  useEffect(() => {
    const p = new Vector3();
    runtime.props.console = {
      thump(strength, point) {
        jolt.kick(strength * 0.35);
        p.copy(point);
        p.y = Math.max(p.y, legH + h + 0.02);
        runtime.fx.fluff(p, 4 + Math.round(strength * 6), 0.6, '#D9CDBE');
      },
    };
    return () => {
      delete runtime.props.console;
    };
  }, [jolt, legH, h]);

  useFrame((_, dt) => {
    const y = jolt.step(Math.min(dt, 0.05));
    if (group.current) group.current.position.y = -Math.abs(y) * 0.02;
  });

  const legs: [number, number][] = [
    [-w / 2 + 0.14, z - d / 2 + 0.1],
    [w / 2 - 0.14, z - d / 2 + 0.1],
    [-w / 2 + 0.14, z + d / 2 - 0.1],
    [w / 2 - 0.14, z + d / 2 - 0.1],
  ];

  return (
    <group>
      <group ref={group}>
        <RoundedBox args={[w, h, d]} radius={0.035} smoothness={3} position={[0, bodyY, z]} material={oak} castShadow receiveShadow />
        {/* door recess + divider */}
        <mesh position={[0, bodyY - 0.01, z + d / 2 + 0.001]} material={oakDark}>
          <boxGeometry args={[w - 0.1, h - 0.1, 0.004]} />
        </mesh>
        <instancedMesh ref={slatsRef} args={[undefined, undefined, slatCount]} material={oak} castShadow>
          <boxGeometry args={[0.042, h - 0.12, 0.016]} />
        </instancedMesh>
        {/* small pulls */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.07, bodyY + 0.02, z + d / 2 + 0.03]} material={metal} castShadow>
            <capsuleGeometry args={[0.012, 0.09, 4, 8]} />
          </mesh>
        ))}
        {legs.map(([x, lz], i) => (
          <mesh key={i} position={[x, legH / 2, lz]} material={oakDark} castShadow>
            <cylinderGeometry args={[0.032, 0.022, legH, 10]} />
          </mesh>
        ))}
      </group>
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'console' }}>
        <CuboidCollider args={[w / 2, (legH + h) / 2, d / 2]} position={[0, (legH + h) / 2, z]} restitution={0.25} friction={0.7} />
      </RigidBody>
    </group>
  );
}
