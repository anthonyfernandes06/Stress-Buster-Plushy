import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CoefficientCombineRule, RigidBody, RoundCylinderCollider } from '@react-three/rapier';
import { Group, MeshPhysicalMaterial, Vector2 } from 'three';
import { runtime } from '../../state/runtime';
import { Spring } from '../spring';
import { fabricNormal } from '../textures';

export const POUF = { x: 2.35, z: 2.05, r: 0.7, h: 0.84 };

/** Big soft sage pouf. Fixed, very bouncy, squashes when hit. */
export function Pouf() {
  const vis = useRef<Group>(null);
  const squash = useMemo(() => new Spring(260, 9), []);
  const mat = useMemo(() => {
    const n = fabricNormal().clone();
    n.repeat.set(5, 3);
    n.needsUpdate = true;
    return new MeshPhysicalMaterial({
      color: '#9DB08F',
      roughness: 0.9,
      sheen: 0.8,
      sheenColor: '#DDE8CF',
      sheenRoughness: 0.55,
      normalMap: n,
      normalScale: new Vector2(0.5, 0.5),
    });
  }, []);
  const seamMat = useMemo(() => new MeshPhysicalMaterial({ color: '#869A79', roughness: 0.9, sheen: 0.5, sheenColor: '#CFDCC2' }), []);

  useEffect(() => {
    runtime.props.pouf = {
      squash(strength) {
        squash.kick(Math.min(4.5, 0.6 + strength * 0.45));
      },
    };
    return () => {
      delete runtime.props.pouf;
    };
  }, [squash]);

  useFrame((_, dt) => {
    const s = squash.step(Math.min(dt, 0.05));
    if (vis.current) {
      vis.current.scale.set(1 + s * 0.09, 1 - s * 0.16, 1 + s * 0.09);
    }
  });

  const { x, z, r, h } = POUF;
  return (
    <group position={[x, 0, z]}>
      <group ref={vis}>
        <mesh position={[0, h / 2, 0]} scale={[1, h / (2 * r), 1]} material={mat} castShadow receiveShadow>
          <sphereGeometry args={[r, 48, 32]} />
        </mesh>
        {/* top seam and button */}
        <mesh position={[0, h - 0.035, 0]} rotation={[Math.PI / 2, 0, 0]} material={seamMat}>
          <torusGeometry args={[0.26, 0.018, 8, 48]} />
        </mesh>
        <mesh position={[0, h - 0.02, 0]} scale={[1, 0.5, 1]} material={seamMat}>
          <sphereGeometry args={[0.05, 16, 12]} />
        </mesh>
        {/* equator piping */}
        <mesh position={[0, h / 2, 0]} rotation={[Math.PI / 2, 0, 0]} material={seamMat}>
          <torusGeometry args={[r * 0.995, 0.016, 8, 64]} />
        </mesh>
      </group>
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'pouf' }}>
        <RoundCylinderCollider
          args={[h / 2 - 0.22, r - 0.22, 0.22]}
          position={[0, h / 2, 0]}
          restitution={1.1}
          restitutionCombineRule={CoefficientCombineRule.Max}
          friction={0.6}
        />
      </RigidBody>
    </group>
  );
}
