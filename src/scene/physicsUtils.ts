import { Vector3 } from 'three';
import type { RapierRigidBody } from '@react-three/rapier';
import type { CollisionEnterPayload } from '@react-three/rapier';

/**
 * Velocities from *before* the latest physics step, keyed by body handle.
 * Collision events are processed after the step, so these are the true
 * pre-impact velocities.
 */
export const prevVel = new Map<number, Vector3>();
const tracked = new Set<RapierRigidBody>();

export function track(body: RapierRigidBody) {
  tracked.add(body);
  if (!prevVel.has(body.handle)) prevVel.set(body.handle, new Vector3());
}

export function untrack(body: RapierRigidBody) {
  tracked.delete(body);
}

/** Call once before every physics step. */
export function snapshotVelocities() {
  for (const b of tracked) {
    try {
      const v = b.linvel();
      prevVel.get(b.handle)?.set(v.x, v.y, v.z);
    } catch {
      // the body was freed (e.g. a remount); forget it
      tracked.delete(b);
    }
  }
}

const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();

export function bodyKind(p: CollisionEnterPayload['other']): string {
  const ud = (p.rigidBody?.userData ?? p.rigidBodyObject?.userData) as { kind?: string } | undefined;
  return ud?.kind ?? 'unknown';
}

/** Normal impact speed between target and other at the start of contact. */
export function impactSpeed(e: CollisionEnterPayload): number {
  const self = e.target.rigidBody;
  const other = e.other.rigidBody;
  if (!self) return 0;
  const pv = prevVel.get(self.handle);
  if (pv) _a.copy(pv);
  else {
    const v = self.linvel();
    _a.set(v.x, v.y, v.z);
  }
  if (other && other.isDynamic()) {
    const ov = prevVel.get(other.handle);
    if (ov) _b.copy(ov);
    else {
      const v = other.linvel();
      _b.set(v.x, v.y, v.z);
    }
  } else if (other && other.isKinematic()) {
    const v = other.linvel();
    _b.set(v.x, v.y, v.z);
  } else _b.set(0, 0, 0);
  _a.sub(_b);
  const n = e.manifold?.normal();
  if (n && (n.x || n.y || n.z)) {
    _n.set(n.x, n.y, n.z).normalize();
    return Math.abs(_a.dot(_n));
  }
  return _a.length();
}

export function contactPoint(e: CollisionEnterPayload, out: Vector3): Vector3 {
  const m = e.manifold;
  if (m && m.numSolverContacts() > 0) {
    const p = m.solverContactPoint(0);
    return out.set(p.x, p.y, p.z);
  }
  const t = e.target.rigidBody?.translation();
  return t ? out.set(t.x, t.y, t.z) : out;
}

export function contactNormal(e: CollisionEnterPayload, out: Vector3): Vector3 {
  const n = e.manifold?.normal();
  if (n) {
    out.set(n.x, n.y, n.z);
    if (out.lengthSq() > 0) {
      out.normalize();
      if (e.flipped) out.negate();
      return out;
    }
  }
  return out.set(0, 1, 0);
}
