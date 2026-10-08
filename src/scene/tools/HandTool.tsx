import { useEffect, useRef } from 'react';
import { useBeforePhysicsStep } from '@react-three/rapier';
import { Quaternion, Vector3 } from 'three';
import { HAND } from '../../config';
import { runtime, type PlushyPart } from '../../state/runtime';
import { sound } from '../../audio/SoundManager';
import { rayPlaneY, type PointerInfo, type RegisterTool } from './Tools';

interface Grab {
  part: PlushyPart;
  local: Vector3; // grab point in body-local space
  hitPoint: Vector3;
  downX: number;
  downY: number;
  downTime: number;
  engaged: boolean;
  target: Vector3;
  targetVel: Vector3;
  history: { t: number; p: Vector3 }[];
  rayDir: Vector3;
  planeY: number;
}

const _q = new Quaternion();
const _v = new Vector3();
const _a = new Vector3();
const _f = new Vector3();
const _throw = new Vector3();

/** Grab, drag, pull, flick-throw and punch. */
export function HandTool({ register }: { register: RegisterTool }) {
  const grab = useRef<Grab | null>(null);
  const hovering = useRef(false);

  useEffect(() => {
    const engage = (g: Grab) => {
      g.engaged = true;
      runtime.plushy?.setHeld(true);
      runtime.plushy?.noteInteraction();
      sound.play('squish', { intensity: 0.4, pitch: 1.2 });
    };

    const release = (doThrow: boolean) => {
      const g = grab.current;
      grab.current = null;
      if (!g) return;
      const plushy = runtime.plushy;
      if (!plushy || !g.engaged) return;
      plushy.setHeld(false);
      if (!doThrow) return;
      // average cursor velocity over the last ~80 ms
      const now = performance.now() / 1000;
      const recent = g.history.filter((h) => now - h.t <= HAND.throwWindow + 0.02);
      if (recent.length < 2) return;
      const a = recent[0];
      const b = recent[recent.length - 1];
      const dt = Math.max(0.016, b.t - a.t);
      _throw.subVectors(b.p, a.p).divideScalar(dt).multiplyScalar(HAND.throwScale);
      const flat = Math.hypot(_throw.x, _throw.z);
      if (flat < 1.5) return; // a gentle release just drops it
      _throw.y += flat * HAND.throwUpBias;
      if (_throw.length() > HAND.maxThrowSpeed) _throw.setLength(HAND.maxThrowSpeed);
      for (const body of plushy.bodies) {
        const v = body.linvel();
        body.setLinvel({ x: v.x + (_throw.x - v.x) * 0.75, y: v.y + (_throw.y - v.y) * 0.75, z: v.z + (_throw.z - v.z) * 0.75 }, true);
      }
      const k = Math.min(1, _throw.length() / HAND.maxThrowSpeed);
      sound.play('whoosh', { intensity: k, pitch: 0.9 + k * 0.3 });
      if (k > 0.5) sound.play('squeak', { intensity: 0.6, pitch: 1.25 });
    };

    const punch = (g: Grab) => {
      const plushy = runtime.plushy;
      if (!plushy) return;
      const dir = _f.copy(g.rayDir).setY(0).normalize().multiplyScalar(1).add(_v.set(0, HAND.punchUp, 0)).normalize();
      const isHead = g.part.kind === 'head';
      const imp = HAND.punchImpulse * (isHead ? 1 : 0.4);
      g.part.body.applyImpulseAtPoint(
        { x: dir.x * imp, y: dir.y * imp, z: dir.z * imp },
        { x: g.hitPoint.x, y: g.hitPoint.y, z: g.hitPoint.z },
        true,
      );
      if (!isHead) plushy.head.applyImpulse({ x: dir.x * imp * 0.6, y: dir.y * imp * 0.6, z: dir.z * imp * 0.6 }, true);
      plushy.react('punch', g.hitPoint, g.rayDir.clone().negate());
    };

    const updateTarget = (g: Grab, p: PointerInfo) => {
      const hit = rayPlaneY(p.ray, g.planeY, _a);
      if (!hit) return;
      hit.x = Math.max(-HAND.bounds, Math.min(HAND.bounds, hit.x));
      hit.z = Math.max(-HAND.bounds, Math.min(HAND.bounds, hit.z));
      const last = g.history[g.history.length - 1];
      if (last && p.time > last.t) g.targetVel.subVectors(hit, last.p).divideScalar(p.time - last.t).clampLength(0, 25);
      g.target.copy(hit);
      g.history.push({ t: p.time, p: hit.clone() });
      if (g.history.length > 12) g.history.shift();
    };

    register('hand', {
      down(p) {
        const plushy = runtime.plushy;
        if (!plushy) return;
        const hit = plushy.raycast(p.ray);
        if (!hit) return;
        const body = hit.part.body;
        const t = body.translation();
        const r = body.rotation();
        _q.set(r.x, r.y, r.z, r.w).invert();
        const local = hit.point.clone().sub(_v.set(t.x, t.y, t.z)).applyQuaternion(_q);
        // tentacles: grab at the segment centre so pulls feel like a tug on the chain
        if (hit.part.kind === 'seg') local.set(0, 0, 0);
        grab.current = {
          part: hit.part,
          local,
          hitPoint: hit.point.clone(),
          downX: p.x,
          downY: p.y,
          downTime: p.time,
          engaged: false,
          target: new Vector3(t.x, t.y, t.z),
          targetVel: new Vector3(),
          history: [],
          rayDir: p.ray.direction.clone(),
          // carry the body centre at a fixed height, so the grabbed point's plane sits above it
          planeY: (hit.part.kind === 'head' ? HAND.liftHead : HAND.liftSegment) + (hit.part.kind === 'head' ? hit.point.y - t.y : 0),
        };
        updateTarget(grab.current, p);
        plushy.noteInteraction();
      },
      move(p) {
        const g = grab.current;
        if (!g) {
          // hover test for the open-hand cursor
          hovering.current = !!runtime.plushy?.raycast(p.ray);
          return;
        }
        updateTarget(g, p);
        if (!g.engaged) {
          const moved = Math.hypot(p.x - g.downX, p.y - g.downY);
          if (moved > HAND.punchMaxPx || p.time - g.downTime > HAND.punchMaxTime) engage(g);
        }
      },
      up(p) {
        const g = grab.current;
        if (!g) return;
        const quick = p.time - g.downTime < HAND.punchMaxTime && Math.hypot(p.x - g.downX, p.y - g.downY) < HAND.punchMaxPx;
        if (!g.engaged && quick) {
          grab.current = null;
          punch(g);
          return;
        }
        updateTarget(g, p);
        release(true);
        hovering.current = !!runtime.plushy?.raycast(p.ray);
      },
      cancel() {
        release(false);
      },
      cursor() {
        if (grab.current) return 'grabbing';
        return hovering.current ? 'grab' : 'default';
      },
    });
    return () => {
      release(false);
      register('hand', null);
    };
  }, [register]);

  // engage a still press after the punch window even without movement
  useBeforePhysicsStep(() => {
    const g = grab.current;
    const plushy = runtime.plushy;
    if (!g || !plushy) return;
    if (!g.engaged) {
      if (performance.now() / 1000 - g.downTime > HAND.punchMaxTime) {
        g.engaged = true;
        plushy.setHeld(true);
        sound.play('squish', { intensity: 0.4, pitch: 1.2 });
      } else return;
    }
    const body = g.part.body;
    const t = body.translation();
    const r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const anchor = _a.copy(g.local).applyQuaternion(_q).add(_v.set(t.x, t.y, t.z));
    const lv = body.linvel();
    const dt = 1 / 60;
    // critically-damped-ish spring towards the cursor target
    _f.subVectors(g.target, anchor).multiplyScalar(HAND.springK);
    _f.x -= (lv.x - g.targetVel.x) * HAND.springDamping;
    _f.y -= lv.y * HAND.springDamping;
    _f.z -= (lv.z - g.targetVel.z) * HAND.springDamping;
    _f.multiplyScalar(g.part.kind === 'head' ? HAND.effectiveMassHead : HAND.effectiveMassSegment);
    if (_f.length() > HAND.maxForce) _f.setLength(HAND.maxForce);
    body.applyImpulseAtPoint({ x: _f.x * dt, y: _f.y * dt, z: _f.z * dt }, { x: anchor.x, y: anchor.y, z: anchor.z }, true);
    // the cursor velocity estimate decays when the pointer stops moving
    g.targetVel.multiplyScalar(0.85);
  });

  return null;
}
