import { Ray, Vector2, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import type { RapierRigidBody } from '@react-three/rapier';

/**
 * Mutable, non-React runtime shared between the scene systems.
 * Anything that changes every frame lives here instead of in zustand.
 */

export type ReactionLevel = 'light' | 'medium' | 'heavy' | 'punch' | 'bat';

export interface PlushyPart {
  index: number;
  kind: 'head' | 'seg';
  t: number; // tentacle index (-1 for head)
  k: number; // segment index along the tentacle (-1 for head)
  body: RapierRigidBody;
  obj: Object3D;
  radius: number;
}

export interface PlushyHit {
  part: PlushyPart;
  point: Vector3;
  distance: number;
}

export interface PlushyHandle {
  head: RapierRigidBody;
  parts: PlushyPart[];
  bodies: RapierRigidBody[];
  totalMass: number;
  raycast(ray: Ray): PlushyHit | null;
  react(level: ReactionLevel, point: Vector3, dir: Vector3, strength?: number): void;
  setHeld(held: boolean): void;
  /** Heat any part within range of the flame tip. Returns true if something heated. */
  heatAt(point: Vector3, dt: number): boolean;
  isBurning(): boolean;
  extinguish(withPuff: boolean): void;
  centerOfMass(out: Vector3): Vector3;
  noteInteraction(): void;
}

export interface PropHandles {
  tv?: { glitch(strength: number): void };
  pouf?: { squash(strength: number): void };
  shelf?: { rattle(strength: number, point: Vector3): void };
  lamp?: { flicker(strength: number): void; setWarmBoost(v: number): void };
  plant?: { wobble(strength: number): void };
  console?: { thump(strength: number, point: Vector3): void };
}

export interface FxEmitters {
  fluff(point: Vector3, count: number, power: number, color?: string): void;
  ring(point: Vector3, normal: Vector3, size: number, kind?: 'ring' | 'pow'): void;
  fire(point: Vector3, count: number, scale: number): void;
  smoke(point: Vector3, count: number, scale: number): void;
  sparks(point: Vector3, count: number): void;
}

const noop = () => {};

export const runtime = {
  /** Multiplies the frame delta for every useFrame consumer (hit-stop). */
  timeScale: 1,
  hitStopUntil: 0,
  trauma: 0,
  reducedMotion: false,
  isMobile: false,
  /** Seconds since last user interaction with the plushy. */
  idleTime: 0,
  pointer: {
    ndc: new Vector2(0, 0),
    client: new Vector2(0, 0),
    inside: false,
    down: false,
  },
  camera: null as PerspectiveCamera | null,
  plushy: null as PlushyHandle | null,
  props: {} as PropHandles,
  fx: {
    fluff: noop,
    ring: noop,
    fire: noop,
    smoke: noop,
    sparks: noop,
  } as FxEmitters,
  /** Extra warm light contributed by fire, read by props/lights. */
  fireGlow: 0,
  fireGlowPos: new Vector3(),
};

export function hitStop(seconds: number, scale: number) {
  if (runtime.reducedMotion) seconds *= 0.5;
  runtime.timeScale = scale;
  runtime.hitStopUntil = Math.max(runtime.hitStopUntil, performance.now() + seconds * 1000);
}

export function addTrauma(amount: number) {
  if (runtime.reducedMotion) return;
  runtime.trauma = Math.min(1, runtime.trauma + amount);
}

export function haptic(ms: number) {
  try {
    if (runtime.isMobile && 'vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    /* unsupported */
  }
}
