import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody, type CollisionEnterPayload, type RapierRigidBody } from '@react-three/rapier';
import { DoubleSide, MeshStandardMaterial, PointLight } from 'three';
import { ROOM } from '../../config';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';
import { sound } from '../../audio/SoundManager';
import { bodyKind, impactSpeed, track, untrack } from '../physicsUtils';

export const LAMP = { x: -ROOM.halfWidth + 0.62, z: ROOM.back + 0.62 };
const BASE_INTENSITY = 5.5;

/** Floor lamp with a heavy base: wobbles, can topple, flickers when hit. */
export function Lamp() {
  const body = useRef<RapierRigidBody>(null);
  const light = useRef<PointLight>(null);
  const flicker = useRef(0);
  const warmBoost = useRef(0);
  const lastClank = useRef(0);

  const brass = useMemo(() => new MeshStandardMaterial({ color: '#B88E52', roughness: 0.35, metalness: 0.75 }), []);
  const base = useMemo(() => new MeshStandardMaterial({ color: '#33302C', roughness: 0.5, metalness: 0.3 }), []);
  const shade = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#F5EBDB',
        roughness: 0.95,
        side: DoubleSide,
        emissive: '#FFC88A',
        emissiveIntensity: 0.55,
      }),
    [],
  );

  useEffect(() => {
    const b = body.current;
    if (b) track(b);
    runtime.props.lamp = {
      flicker(strength) {
        flicker.current = Math.max(flicker.current, 0.35 + Math.min(0.6, strength * 0.06));
      },
      setWarmBoost(v) {
        warmBoost.current = v;
      },
    };
    return () => {
      if (b) untrack(b);
      delete runtime.props.lamp;
    };
  }, []);

  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.resetToken === prev.resetToken || !body.current) return;
        const b = body.current;
        b.setTranslation({ x: LAMP.x, y: 0, z: LAMP.z }, true);
        b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }),
    [],
  );

  useFrame((_, dt) => {
    const l = light.current;
    if (!l) return;
    let k = 1;
    if (flicker.current > 0) {
      flicker.current -= dt;
      k = Math.random() < 0.35 ? 0.15 + Math.random() * 0.3 : 0.8 + Math.random() * 0.4;
    }
    l.intensity = BASE_INTENSITY * k;
    shade.emissiveIntensity = 0.55 * k;
  });

  const onHit = (e: CollisionEnterPayload) => {
    const kind = bodyKind(e.other);
    if (kind === 'plushy') return; // the plushy side handles that
    const s = impactSpeed(e);
    const now = performance.now();
    if (s > 1.4 && now - lastClank.current > 180) {
      lastClank.current = now;
      sound.play('clank', { intensity: Math.min(1, s / 5), pitch: 0.95 + Math.random() * 0.1 });
      flicker.current = Math.max(flicker.current, 0.4);
    }
  };

  return (
    <RigidBody
      ref={body}
      position={[LAMP.x, 0, LAMP.z]}
      colliders={false}
      userData={{ kind: 'lamp' }}
      linearDamping={0.2}
      angularDamping={0.8}
      onCollisionEnter={onHit}
    >
      <CylinderCollider args={[0.035, 0.25]} position={[0, 0.035, 0]} mass={3.2} friction={0.8} restitution={0.1} />
      <CylinderCollider args={[0.78, 0.03]} position={[0, 0.85, 0]} mass={0.2} />
      <CylinderCollider args={[0.18, 0.28]} position={[0, 1.78, 0]} mass={0.25} restitution={0.3} />
      {/* weighted base */}
      <mesh position={[0, 0.035, 0]} material={base} castShadow receiveShadow>
        <cylinderGeometry args={[0.23, 0.26, 0.07, 40]} />
      </mesh>
      {/* pole */}
      <mesh position={[0, 0.86, 0]} material={brass} castShadow>
        <cylinderGeometry args={[0.018, 0.022, 1.6, 12]} />
      </mesh>
      {/* bulb + shade */}
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.07, 16, 12]} />
        <meshBasicMaterial color={[3.2, 2.4, 1.4]} />
      </mesh>
      <mesh position={[0, 1.78, 0]} material={shade} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 0.36, 40, 1, true]} />
      </mesh>
      <pointLight ref={light} position={[0, 1.66, 0]} color="#FFC27A" intensity={BASE_INTENSITY} distance={5.5} decay={1.6} />
    </RigidBody>
  );
}
