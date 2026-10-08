import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { PARTICLES } from '../../config';
import { runtime } from '../../state/runtime';
import { flameSprite, softDot } from '../textures';
import { ParticleSystem } from './ParticleSystem';

const _v = new Vector3();
const _p = new Vector3();

/** Bloom-heavy cartoon flames + flint sparks (both additive). */
export function FireParticles() {
  const fire = useMemo(() => new ParticleSystem(PARTICLES.fire, flameSprite(), false, 0.12), []);
  const sparks = useMemo(() => new ParticleSystem(PARTICLES.spark, softDot(), true, 0.02), []);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  useEffect(() => {
    runtime.fx.fire = (point, count, scale) => {
      for (let i = 0; i < count; i++) {
        _p.set(point.x + (Math.random() - 0.5) * 0.08 * scale, point.y + (Math.random() - 0.3) * 0.05 * scale, point.z + (Math.random() - 0.5) * 0.08 * scale);
        _v.set((Math.random() - 0.5) * 0.35, 1.0 + Math.random() * 0.9, (Math.random() - 0.5) * 0.35).multiplyScalar(Math.sqrt(scale));
        fire.emit({
          position: _p,
          velocity: _v,
          life: (0.4 + Math.random() * 0.35) * Math.sqrt(scale),
          size0: (0.34 + Math.random() * 0.18) * scale,
          size1: 0.08 * scale,
          // HDR tint over the coloured sprite so the flames bloom
          color: [2.6, 2.0, 1.6],
          color1: [2.0, 0.8, 0.5],
          alpha: 1,
          gravity: 1.2,
          drag: 1.5,
          rotation: (Math.random() - 0.5) * 0.35,
        });
      }
    };
    runtime.fx.sparks = (point, count) => {
      for (let i = 0; i < count; i++) {
        _v.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(1.2 + Math.random() * 2);
        sparks.emit({
          position: point,
          velocity: _v,
          life: 0.18 + Math.random() * 0.22,
          size0: 0.035,
          size1: 0.01,
          color: [4, 2.6, 0.9],
          color1: [3, 0.8, 0.1],
          gravity: -7,
          drag: 1,
        });
      }
    };
  }, [fire, sparks]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    const h = size.height * dpr;
    fire.update(d, h);
    sparks.update(d, h);
  });
  return (
    <>
      <primitive object={fire.points} renderOrder={12} />
      <primitive object={sparks.points} renderOrder={13} />
    </>
  );
}
