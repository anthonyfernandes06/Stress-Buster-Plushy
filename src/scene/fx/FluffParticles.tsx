import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Vector3 } from 'three';
import { PARTICLES } from '../../config';
import { runtime } from '../../state/runtime';
import { fluffSprite } from '../textures';
import { ParticleSystem } from './ParticleSystem';

const _v = new Vector3();
const _c = new Color();

/** Cotton tufts that burst out of the plushy on hits. */
export function FluffParticles() {
  const sys = useMemo(() => new ParticleSystem(PARTICLES.fluff, fluffSprite(), false, 0.04), []);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  useEffect(() => {
    runtime.fx.fluff = (point, count, power, color) => {
      _c.set(color ?? '#FFFFFF');
      const col: [number, number, number] = color ? [_c.r * 1.1, _c.g * 1.1, _c.b * 1.1] : [1.3, 1.27, 1.22];
      for (let i = 0; i < count; i++) {
        _v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
        const sp = (1.2 + Math.random() * 2.4) * power;
        sys.emit({
          position: point,
          velocity: _v.multiplyScalar(sp),
          life: 0.9 + Math.random() * 0.8,
          size0: 0.07 + Math.random() * 0.06,
          size1: 0.1 + Math.random() * 0.06,
          color: col,
          gravity: -4.2,
          drag: 2.2,
          spin: 4,
        });
      }
    };
  }, [sys]);

  useFrame((_, dt) => sys.update(Math.min(dt, 0.05), size.height * dpr));
  return <primitive object={sys.points} renderOrder={10} />;
}
