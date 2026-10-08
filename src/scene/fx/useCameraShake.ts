import { useRef } from 'react';
import { Vector3 } from 'three';
import { runtime } from '../../state/runtime';

/** Smooth pseudo-noise from a few incommensurate sines. */
function wobble(t: number, seed: number) {
  return (
    Math.sin(t * 1.0 + seed) * 0.5 +
    Math.sin(t * 2.31 + seed * 1.7) * 0.3 +
    Math.sin(t * 4.13 + seed * 3.1) * 0.2
  );
}

/**
 * Trauma-based camera shake. Trauma (0..1) is added by hits in runtime and
 * decays here; shake strength is trauma squared.
 */
export function useCameraShake() {
  const offset = useRef(new Vector3());
  const roll = useRef(0);
  const time = useRef(0);
  return {
    offset: offset.current,
    get roll() {
      return roll.current;
    },
    update(dt: number) {
      runtime.trauma = Math.max(0, runtime.trauma - dt * 1.6);
      if (runtime.reducedMotion) runtime.trauma = 0;
      const s = runtime.trauma * runtime.trauma;
      time.current += dt * 28;
      const t = time.current;
      offset.current.set(wobble(t, 1) * 0.22 * s, wobble(t, 7) * 0.22 * s, wobble(t, 13) * 0.12 * s);
      roll.current = wobble(t, 21) * 0.025 * s;
    },
  };
}
