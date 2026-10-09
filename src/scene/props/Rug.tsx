import { useMemo } from 'react';
import { MeshStandardMaterial, Vector2 } from 'three';
import { fabricNormal, rugTexture } from '../textures';

export const RUG = { x: -0.15, z: -0.85, r: 1.75 };

/** Round woven rug. Visual only: it is part of the floor physics-wise. */
export function Rug() {
  const mat = useMemo(() => {
    const n = fabricNormal().clone();
    n.repeat.set(6, 6);
    n.needsUpdate = true;
    return new MeshStandardMaterial({ map: rugTexture(), roughness: 1, normalMap: n, normalScale: new Vector2(0.6, 0.6) });
  }, []);
  return (
    <mesh position={[RUG.x, 0.005, RUG.z]} material={mat} receiveShadow>
      <cylinderGeometry args={[RUG.r, RUG.r, 0.01, 96]} />
    </mesh>
  );
}

export function onRug(x: number, z: number) {
  return Math.hypot(x - RUG.x, z - RUG.z) < RUG.r;
}
