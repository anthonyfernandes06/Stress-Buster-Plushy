import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { PARTICLES } from '../../config';
import { runtime } from '../../state/runtime';
import { softDot } from '../textures';
import { ParticleSystem } from './ParticleSystem';

const _v = new Vector3();

/** Soft grey wisps that rise and spread. */
export function SmokeParticles() {
  const sys = useMemo(() => new ParticleSystem(PARTICLES.smoke, softDot(), false, 0.15), []);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  useEffect(() => {
    runtime.fx.smoke = (point, count, scale) => {
      for (let i = 0; i < count; i++) {
        _v.set((Math.random() - 0.5) * 0.35, 0.45 + Math.random() * 0.45, (Math.random() - 0.5) * 0.35).multiplyScalar(Math.sqrt(scale));
        const g = 0.32 + Math.random() * 0.12;
        sys.emit({
          position: point,
          velocity: _v,
          life: 1.3 + Math.random() * 0.9,
          size0: 0.12 * scale,
          size1: (0.5 + Math.random() * 0.3) * scale,
          color: [g, g * 0.95, g * 0.9],
          color1: [g * 1.4, g * 1.35, g * 1.3],
          alpha: 0.42,
          gravity: 0.25,
          drag: 0.8,
          spin: 0.8,
        });
      }
    };
  }, [sys]);

  useFrame((_, dt) => sys.update(Math.min(dt, 0.05), size.height * dpr));
  return <primitive object={sys.points} renderOrder={11} />;
}
