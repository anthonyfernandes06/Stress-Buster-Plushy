import { useEffect, useRef } from 'react';
import { useBeforePhysicsStep } from '@react-three/rapier';
import { Plane, Quaternion, Ray, Vector2, Vector3 } from 'three';
import { HAND, PHYSICS } from '../../config';
import { runtime, type PlushyPart } from '../../state/runtime';
import { sound } from '../../audio/SoundManager';
import { clampToPlay, forwardFlat, rayFromNdc, rayRoom, type PointerInfo, type RegisterTool } from './Tools';

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
  history: { t: number; p: Vector3; ndc: Vector2 }[];
  rayDir: Vector3;
  /** Vertical plane facing the viewer, through the grab point: drags move left/right/up/down. */
  plane: Plane;
  /** Lowest height the grab point may be pulled to (keeps it lifted off the floor). */
  minY: number;
}

const _q = new Quaternion();
const _v = new Vector3();
const _a = new Vector3();
const _f = new Vector3();
const _throw = new Vector3();
const _ray = new Ray();
const _plane = new Plane();
const _ndc = new Vector2();
const _aim = new Vector3();

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
      // flick velocity in the viewer-facing drag plane
      _throw.subVectors(b.p, a.p).divideScalar(dt).multiplyScalar(HAND.throwScale);
      const speed = Math.min(HAND.maxThrowSpeed, _throw.length());
      if (speed < 1.5) return; // a gentle release just drops it
      // 1) Screen direction: where the flick's start and end land on a
      //    floor-parallel plane through the grab point (perspective-correct,
      //    so flicking up the screen sends it into the room).
      // 2) Aim: the room surface just past the release point. A shelf looks
      //    "up" on screen partly because it is tall, so when the surface the
      //    flick points at agrees with the screen direction, throw at it.
      const cam = runtime.camera;
      const upFlick = Math.max(0, _throw.y);
      let aimed = false;
      if (cam) {
        _plane.set(_v.set(0, 1, 0), -a.p.y);
        const pa = _a;
        const ok =
          rayFromNdc(cam, a.ndc, _ray).intersectPlane(_plane, pa) !== null &&
          rayFromNdc(cam, b.ndc, _ray).intersectPlane(_plane, _f) !== null;
        const dir = _f.sub(pa).setY(0);
        if (ok && dir.lengthSq() > 1e-4) {
          dir.normalize();
          const flat = speed * (1 - HAND.throwKeepUp * Math.min(1, upFlick / speed));
          _throw.copy(dir).multiplyScalar(flat);
          _throw.y = upFlick * HAND.throwKeepUp + speed * HAND.throwLift;
          aimed = true;

          const reach = _ndc.subVectors(b.ndc, a.ndc);
          if (reach.lengthSq() > 1e-8) {
            reach.normalize().multiplyScalar(HAND.throwAimReach).add(b.ndc).clampScalar(-1, 1);
            if (rayRoom(rayFromNdc(cam, reach, _ray), _aim) !== null) {
              const from = g.part.body.translation();
              const to = _aim.sub(_v.set(from.x, from.y, from.z));
              const flatTo = Math.hypot(to.x, to.z);
              const cos = flatTo > 1e-3 ? (to.x * dir.x + to.z * dir.z) / flatTo : -1;
              if (flatTo > 0.8 && cos > Math.cos((HAND.throwAimMaxAngle * Math.PI) / 180)) {
                const dist = to.length();
                _throw.copy(to).divideScalar(dist).multiplyScalar(speed);
                _throw.y += Math.min(speed * 0.6, 0.5 * Math.abs(PHYSICS.gravity) * (dist / speed) * HAND.throwArc);
              }
            }
          }
        }
      }
      if (!aimed) _throw.setLength(speed);
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
      const hit = p.ray.intersectPlane(g.plane, _a);
      if (!hit) return;
      clampToPlay(hit, g.minY);
      const last = g.history[g.history.length - 1];
      if (last && p.time > last.t) g.targetVel.subVectors(hit, last.p).divideScalar(p.time - last.t).clampLength(0, 25);
      g.target.copy(hit);
      g.history.push({ t: p.time, p: hit.clone(), ndc: p.ndc.clone() });
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
          plane: new Plane().setFromNormalAndCoplanarPoint(forwardFlat(new Vector3()), hit.point),
          // keep a held head clear of the floor, measured at the grab point
          minY: hit.part.kind === 'head' ? HAND.minHeadHeight + (hit.point.y - t.y) : HAND.minSegmentHeight,
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
