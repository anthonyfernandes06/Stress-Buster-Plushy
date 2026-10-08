import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BallCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { Group, LatheGeometry, MeshStandardMaterial, Vector2 } from 'three';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';
import { Spring } from '../spring';
import { track, untrack } from '../physicsUtils';

export const PLANT = { x: 3.3, z: -3.25 };

const LEAVES = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.3;
  return {
    yaw: a,
    tilt: 0.45 + (i % 3) * 0.2,
    len: 0.55 + ((i * 37) % 10) / 40,
    color: ['#6F9161', '#5E8253', '#86A673'][i % 3],
  };
});

/** Potted plant: heavy dynamic pot, leaves sway on a spring. */
export function Plant() {
  const body = useRef<RapierRigidBody>(null);
  const leaves = useRef<Group>(null);
  const swayX = useMemo(() => new Spring(60, 3.2), []);
  const swayZ = useMemo(() => new Spring(60, 3.2), []);

  const potGeo = useMemo(() => {
    const pts = [
      [0, 0],
      [0.19, 0],
      [0.205, 0.02],
      [0.25, 0.38],
      [0.285, 0.4],
      [0.29, 0.46],
      [0.255, 0.46],
      [0.245, 0.42],
      [0.0, 0.42],
    ].map(([x, y]) => new Vector2(x, y));
    return new LatheGeometry(pts, 40);
  }, []);
  const terracotta = useMemo(() => new MeshStandardMaterial({ color: '#C46E4E', roughness: 0.85 }), []);
  const soil = useMemo(() => new MeshStandardMaterial({ color: '#4A3628', roughness: 1 }), []);
  const leafMats = useMemo(() => {
    const m = new Map<string, MeshStandardMaterial>();
    for (const l of LEAVES) if (!m.has(l.color)) m.set(l.color, new MeshStandardMaterial({ color: l.color, roughness: 0.6 }));
    return m;
  }, []);
  const stemMat = useMemo(() => new MeshStandardMaterial({ color: '#5C7A4A', roughness: 0.7 }), []);

  useEffect(() => {
    const b = body.current;
    if (b) track(b);
    runtime.props.plant = {
      wobble(strength) {
        const a = Math.random() * Math.PI * 2;
        const k = Math.min(3, 0.6 + strength * 0.35);
        swayX.kick(Math.cos(a) * k);
        swayZ.kick(Math.sin(a) * k);
      },
    };
    return () => {
      if (b) untrack(b);
      delete runtime.props.plant;
    };
  }, [swayX, swayZ]);

  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.resetToken === prev.resetToken || !body.current) return;
        const b = body.current;
        b.setTranslation({ x: PLANT.x, y: 0, z: PLANT.z }, true);
        b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }),
    [],
  );

  useFrame(({ clock }, dt) => {
    const d = Math.min(dt, 0.05);
    const b = body.current;
    if (b && !b.isSleeping()) {
      // leaves lag behind the pot's motion
      const w = b.angvel();
      const v = b.linvel();
      swayX.v += (-w.z * 0.9 - v.x * 0.6) * d * 6;
      swayZ.v += (w.x * 0.9 - v.z * 0.6) * d * 6;
    }
    const sx = swayX.step(d);
    const sz = swayZ.step(d);
    const t = clock.elapsedTime;
    if (leaves.current) {
      leaves.current.rotation.z = sx * 0.25 + Math.sin(t * 0.7) * 0.015;
      leaves.current.rotation.x = sz * 0.25 + Math.sin(t * 0.55 + 1) * 0.015;
    }
  });

  return (
    <RigidBody ref={body} position={[PLANT.x, 0, PLANT.z]} colliders={false} userData={{ kind: 'plant' }} angularDamping={1.2}>
      <CylinderCollider args={[0.23, 0.27]} position={[0, 0.23, 0]} mass={7} friction={0.9} restitution={0.15} />
      <BallCollider args={[0.42]} position={[0, 0.9, 0]} mass={0.2} friction={0.3} restitution={0.2} />
      <mesh geometry={potGeo} material={terracotta} castShadow receiveShadow />
      <mesh position={[0, 0.425, 0]} rotation={[-Math.PI / 2, 0, 0]} material={soil}>
        <circleGeometry args={[0.25, 32]} />
      </mesh>
      <group ref={leaves} position={[0, 0.42, 0]}>
        {LEAVES.map((l, i) => (
          <group key={i} rotation={[0, l.yaw, 0]}>
            <group rotation={[l.tilt, 0, 0]}>
              <mesh position={[0, l.len * 0.35, 0]} material={stemMat} castShadow>
                <cylinderGeometry args={[0.008, 0.012, l.len * 0.7, 6]} />
              </mesh>
              <mesh
                position={[0, l.len * 0.72, 0.02]}
                rotation={[0.35, 0, 0]}
                scale={[0.13, l.len * 0.36, 0.022]}
                material={leafMats.get(l.color)}
                castShadow
              >
                <sphereGeometry args={[1, 16, 12]} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}
