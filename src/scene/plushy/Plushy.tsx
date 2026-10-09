import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CapsuleCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier';
import type { ImpulseJoint } from '@dimforge/rapier3d-compat';
import { Color, ExtrudeGeometry, Group, MeshBasicMaterial, Object3D, PointLight, Quaternion, Ray, Shape, Sphere, Vector3 } from 'three';
import { FIRE, GUN, IDLE, IMPACT, METER, PLUSHY, POUF_BOUNCE, ROOM } from '../../config';
import { addTrauma, haptic, hitStop, runtime, type PlushyHandle, type PlushyHit, type PlushyPart, type ReactionLevel } from '../../state/runtime';
import { useStore } from '../../state/store';
import { sound } from '../../audio/SoundManager';
import { Spring } from '../spring';
import { bodyKind, contactNormal, contactPoint, impactSpeed, track, untrack } from '../physicsUtils';
import { onRug } from '../props/Rug';
import { POUF } from '../props/Pouf';
import { buildLayout, spawnQuaternion } from './layout';
import { buildHeadGeometry, headSurface } from './headShape';
import { createPlushyMaterial } from './PlushyMaterial';
import { TentacleTube } from './Tentacle';
import { Eyes, type EyeController } from './Eyes';

const TC = PLUSHY.tentacle.count;
const SEG = PLUSHY.tentacle.segments;
const NSEG = TC * SEG;
const NPARTS = NSEG + 1;
const segIndex = (t: number, k: number) => t * SEG + k;
const ANG_AXES = [3, 4, 5]; // RawJointAxis.AngX/AngY/AngZ

interface Impact {
  part: number;
  speed: number;
  kind: string;
  point: Vector3;
  normal: Vector3;
}

interface RawJointSet {
  jointSetLimits(h: number, axis: number, min: number, max: number): void;
  jointConfigureMotorPosition(h: number, axis: number, target: number, stiffness: number, damping: number): void;
}

const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _qi = new Quaternion();
const _qTurn = new Quaternion();
const _sphere = new Sphere();
const UP = new Vector3(0, 1, 0);
const FRONT = new Vector3(0, 0, 1);
const SMOKE_LIFT = new Vector3(0, 0.2, 0);
const LIGHT_LIFT = new Vector3(0, 0.25, 0);

function starGeometry() {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 0.035 : 0.08;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
  g.center();
  return g;
}

export function Plushy() {
  const layout = useMemo(buildLayout, []);
  const q0 = useMemo(spawnQuaternion, []);
  const yaw0 = useMemo(() => 2 * Math.atan2(q0.y, q0.w), [q0]);
  const spawn = useMemo(() => new Vector3(...PLUSHY.spawn), []);
  const { world, rapier } = useRapier();

  const headRef = useRef<RapierRigidBody>(null);
  const segRefs = useRef<(RapierRigidBody | null)[]>(new Array(NSEG).fill(null));
  const headAnchor = useRef<Group>(null);
  const segAnchors = useRef<(Group | null)[]>(new Array(NSEG).fill(null));
  const breathRef = useRef<Group>(null);
  const alignRef = useRef<Group>(null);
  const scaleRef = useRef<Group>(null);
  const unalignRef = useRef<Group>(null);
  const starsRef = useRef<Group>(null);
  const fireLight = useRef<PointLight>(null);

  const uniforms = useMemo(() => ({ uHitFlash: { value: 0 }, uTime: { value: 0 } }), []);
  const headMat = useMemo(() => createPlushyMaterial(uniforms, [7, 4]), [uniforms]);
  const tentMat = useMemo(() => createPlushyMaterial(uniforms, [1, 1]), [uniforms]);
  const headGeo = useMemo(buildHeadGeometry, []);
  const tubes = useMemo(() => Array.from({ length: TC }, () => new TentacleTube()), []);
  const starGeo = useMemo(starGeometry, []);
  const starMat = useMemo(() => new MeshBasicMaterial({ color: new Color(1.5, 0.95, 0.12) }), []);

  /** Spawn transforms for every segment, plushy space -> world. */
  const segSpawn = useMemo(
    () =>
      layout.tentacles.flatMap((tn) =>
        tn.segments.map((s) => s.center.clone().applyQuaternion(q0).add(spawn).toArray() as [number, number, number]),
      ),
    [layout, q0, spawn],
  );

  /** Mutable simulation / visual state. */
  const sim = useMemo(() => {
    const headCount = headGeo.attributes.position.count;
    return {
      time: 0,
      charSeg: new Float32Array(NSEG),
      heatSeg: new Float32Array(NSEG),
      headChar: headGeo.attributes.aChar.array as Float32Array,
      headHeat: headGeo.attributes.aHeat.array as Float32Array,
      headRest: (headGeo.attributes.position.array as Float32Array).slice(),
      headCount,
      headActive: false,
      frames: layout.tentacles.map(() => ({
        points: Array.from({ length: SEG + 2 }, () => new Vector3()),
        downs: Array.from({ length: SEG }, () => new Vector3()),
      })),
      squash: new Spring(420, 15),
      squashAxis: new Vector3(0, 1, 0),
      flash: 0,
      eye: { mode: 'normal', blink: 0 } as EyeController,
      nextBlink: 2.5,
      blinkT: -1,
      squeezeUntil: 0,
      xUntil: 0,
      dizzyUntil: 0,
      held: false,
      combo: 0,
      lastPunch: -10,
      lastCounted: -10,
      shotCombo: 0,
      lastShot: -10,
      lastBoing: -10,
      quietUntil: 0, // self-caused motion (wave, hop): don't react to the landing
      impacts: [] as Impact[],
      lastImpact: new Float64Array(NPARTS),
      lastReaction: 0,
      heatTimer: 0,
      lastHeated: -10,
      heatPart: -1,
      heatLocal: new Vector3(),
      lastSmokeWisp: 0,
      fire: {
        active: false,
        start: 0,
        burn: new Float64Array(NPARTS).fill(-1),
        headAnchors: [] as Vector3[],
        lastSpread: 0,
        lastFlail: 0,
        lastSmoke: 0,
        lastMeter: 0,
      },
      stillTime: 0,
      waveTimer: 3,
      swayAmt: 0,
      settleUntil: performance.now() + 1500,
    };
  }, [headGeo, layout]);

  // ------------------------------------------------------------------ joints
  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const joints: ImpulseJoint[] = [];
    const J = PLUSHY.joints;
    const make = (b1: RapierRigidBody, b2: RapierRigidBody, a1: Vector3, a2: Vector3, limit: number, stiffness: number) => {
      const data = rapier.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z });
      const j = world.createImpulseJoint(data, b1, b2, true);
      j.setContactsEnabled(false);
      const raw = (j as unknown as { rawSet: RawJointSet }).rawSet;
      for (const ax of ANG_AXES) {
        raw.jointSetLimits(j.handle, ax, -limit, limit);
        raw.jointConfigureMotorPosition(j.handle, ax, 0, stiffness, J.damping);
      }
      joints.push(j);
    };
    for (const tn of layout.tentacles) {
      for (const s of tn.segments) {
        const body = segRefs.current[segIndex(tn.t, s.k)];
        if (!body) continue;
        if (s.k === 0) {
          make(head, body, s.start, _v.copy(s.start).sub(s.center).clone(), J.rootLimit, J.rootStiffness);
        } else {
          const prev = segRefs.current[segIndex(tn.t, s.k - 1)];
          const ps = tn.segments[s.k - 1];
          if (!prev) continue;
          const tip = s.k >= SEG - 3;
          make(
            prev,
            body,
            s.start.clone().sub(ps.center),
            s.start.clone().sub(s.center),
            tip ? J.tipLimit : J.limit,
            tip ? J.tipStiffness : J.stiffness,
          );
        }
      }
    }
    return () => {
      for (const j of joints) {
        try {
          if (j.isValid()) world.removeImpulseJoint(j, true);
        } catch {
          /* body already gone */
        }
      }
    };
  }, [layout, rapier, world]);

  // ------------------------------------------------------------------ helpers
  const parts = useRef<PlushyPart[]>([]);

  const partObject = (i: number): Object3D | null => {
    const g = i === 0 ? headAnchor.current : segAnchors.current[i - 1];
    return g?.parent ?? null;
  };

  const allBodies = () => [headRef.current, ...segRefs.current].filter(Boolean) as RapierRigidBody[];

  const setEye = (now: number) => {
    const s = sim;
    let mode: EyeController['mode'] = 'normal';
    if (s.fire.active) mode = 'panic';
    else if (now < s.xUntil) mode = 'x';
    else if (now < s.dizzyUntil) mode = 'dizzy';
    else if (now < s.squeezeUntil) mode = 'squeeze';
    else if (s.held) mode = 'wide';
    s.eye.mode = mode;
    const store = useStore.getState();
    store.setPlushyState(
      mode === 'panic' ? 'burning' : mode === 'x' || mode === 'dizzy' ? 'dizzy' : mode === 'squeeze' ? 'hit' : s.held ? 'held' : 'idle',
    );
  };

  const kickSquash = (worldDir: Vector3, amount: number) => {
    const head = partObject(0);
    if (!head) return;
    // impact axis in head-local space
    _qi.copy(head.quaternion).invert();
    sim.squashAxis.copy(worldDir).applyQuaternion(_qi).normalize();
    if (sim.squashAxis.lengthSq() < 0.5) sim.squashAxis.set(0, 1, 0);
    sim.squash.v = Math.max(sim.squash.v, 0) + amount;
  };

  const extinguish = (withPuff: boolean) => {
    const f = sim.fire;
    if (!f.active) return;
    f.active = false;
    f.burn.fill(-1);
    f.headAnchors.length = 0;
    sound.stopCrackle();
    if (withPuff) {
      sound.play('puff', { intensity: 0.8 });
      const p = new Vector3();
      for (let i = 0; i < 6; i++) {
        const o = partObject(i === 0 ? 0 : 1 + Math.floor(Math.random() * NSEG));
        if (o) runtime.fx.smoke(p.copy(o.position), 3, 1.4);
      }
    }
  };

  const react = (level: ReactionLevel, point: Vector3, dir: Vector3, strength = 0.6) => {
    const now = sim.time;
    const store = useStore.getState();
    // light bumps (e.g. its own idle tentacle wave) don't count as interaction
    if (level !== 'light') {
      runtime.idleTime = 0;
      sim.stillTime = 0;
    }
    switch (level) {
      case 'light':
        kickSquash(dir, 1.1);
        break;
      case 'medium':
        kickSquash(dir, 3.1);
        sim.squeezeUntil = Math.max(sim.squeezeUntil, now + 0.4);
        runtime.fx.fluff(point, 5, 0.8);
        runtime.fx.ring(point, dir, 0.5, 'ring');
        if (now - sim.lastCounted > METER.impactHitGap) {
          sim.lastCounted = now;
          store.registerHit(0.35, 'impact');
        }
        break;
      case 'heavy':
        kickSquash(dir, 5.2);
        sim.xUntil = now + 1.0;
        sim.dizzyUntil = now + 3.0;
        runtime.fx.fluff(point, 14, 1.4);
        runtime.fx.ring(point, dir, 0.9, 'ring');
        sim.flash = Math.max(sim.flash, 0.6);
        addTrauma(0.38);
        hitStop(IMPACT.hitStopHeavy, IMPACT.hitStopScale);
        haptic(30);
        if (now - sim.lastCounted > METER.impactHitGap) {
          sim.lastCounted = now;
          store.registerHit(0.85, 'impact');
        }
        break;
      case 'punch': {
        sim.combo = now - sim.lastPunch < 1.1 ? sim.combo + 1 : 1;
        sim.lastPunch = now;
        kickSquash(dir, 2.7 + Math.min(1.5, sim.combo * 0.15));
        if (sim.combo >= 6) {
          sim.xUntil = now + 0.9;
          sim.dizzyUntil = now + 2.6;
          sim.combo = 0;
        } else sim.squeezeUntil = Math.max(sim.squeezeUntil, now + 0.4);
        sound.play('thud', { intensity: 0.45 + Math.random() * 0.2, pitch: 0.9 + Math.random() * 0.3 });
        if (Math.random() < 0.8) sound.play('squeak', { intensity: 0.6, pitch: 0.9 + Math.min(0.6, sim.combo * 0.06) + Math.random() * 0.15 });
        runtime.fx.fluff(point, 3 + Math.min(5, sim.combo), 0.9);
        runtime.fx.ring(point, dir, 0.55, 'pow');
        sim.flash = Math.max(sim.flash, 0.3);
        addTrauma(0.1);
        haptic(15);
        store.registerHit(0.4, 'punch');
        break;
      }
      case 'shot': {
        sim.shotCombo = now - sim.lastShot < GUN.comboWindow ? sim.shotCombo + 1 : 1;
        sim.lastShot = now;
        kickSquash(dir, 1.6);
        if (sim.shotCombo >= GUN.comboDizzy) {
          sim.xUntil = now + 0.9;
          sim.dizzyUntil = now + 2.6;
          sim.shotCombo = 0;
        } else sim.squeezeUntil = Math.max(sim.squeezeUntil, now + 0.3);
        if (Math.random() < 0.35) sound.play('squeak', { intensity: 0.45, pitch: 1 + Math.random() * 0.4 });
        runtime.fx.fluff(point, Math.random() < 0.5 ? 2 : 3, 0.7);
        runtime.fx.ring(point, dir, 0.34, 'pow');
        sim.flash = Math.max(sim.flash, 0.15);
        addTrauma(0.02);
        haptic(10);
        store.registerHit(0.25, 'shot');
        break;
      }
      case 'bat':
        kickSquash(dir, 6.2);
        sim.xUntil = now + 1.0;
        sim.dizzyUntil = now + 3.0;
        sound.play('thwack', { intensity: strength, pitch: 0.92 + Math.random() * 0.16 });
        sound.play('squeak', { intensity: 0.8, pitch: 1.1 + Math.random() * 0.3 });
        runtime.fx.fluff(point, 12 + Math.round(strength * 12), 1.8);
        runtime.fx.ring(point, dir, 1.1, 'pow');
        sim.flash = 1;
        addTrauma(0.35 + strength * 0.35);
        hitStop(IMPACT.hitStopBat, IMPACT.hitStopScale);
        haptic(40);
        store.registerHit(strength, 'bat');
        break;
    }
    setEye(now);
  };

  const ignite = (part: number, headLocal?: Vector3) => {
    const f = sim.fire;
    if (f.active) return;
    f.active = true;
    f.start = sim.time;
    f.lastSpread = sim.time;
    f.lastMeter = sim.time;
    f.burn.fill(-1);
    f.burn[part] = sim.time;
    f.headAnchors.length = 0;
    if (part === 0 && headLocal) f.headAnchors.push(headLocal.clone());
    sound.play('ignite', { intensity: 0.9 });
    sound.startCrackle();
    addTrauma(0.15);
    useStore.getState().registerHit(0.9, 'burn');
    runtime.idleTime = 0;
    setEye(sim.time);
  };

  // ------------------------------------------------------------------ handle
  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const list: PlushyPart[] = [
      { index: 0, kind: 'head', t: -1, k: -1, body: head, obj: partObject(0)!, radius: PLUSHY.head.radius },
    ];
    for (const tn of layout.tentacles)
      for (const s of tn.segments) {
        const i = segIndex(tn.t, s.k);
        list.push({ index: i + 1, kind: 'seg', t: tn.t, k: s.k, body: segRefs.current[i]!, obj: partObject(i + 1)!, radius: s.radius });
      }
    parts.current = list;
    const bodies = allBodies();
    bodies.forEach(track);

    const segEnds = (i: number, a: Vector3, b: Vector3) => {
      const s = layout.tentacles[Math.floor(i / SEG)].segments[i % SEG];
      const o = partObject(i + 1)!;
      a.copy(s.start).sub(s.center).applyQuaternion(o.quaternion).add(o.position);
      b.copy(s.end).sub(s.center).applyQuaternion(o.quaternion).add(o.position);
    };
    const A = new Vector3();
    const B = new Vector3();
    const onRay = new Vector3();
    const onSeg = new Vector3();

    const handle: PlushyHandle = {
      head,
      parts: list,
      bodies,
      get totalMass() {
        return bodies.reduce((m, b) => m + b.mass(), 0);
      },
      raycast(ray: Ray): PlushyHit | null {
        let best: PlushyHit | null = null;
        const ho = partObject(0);
        if (ho) {
          _sphere.center.copy(ho.position);
          _sphere.radius = PLUSHY.head.radius * 1.12;
          if (ray.intersectSphere(_sphere, _v)) {
            best = { part: list[0], point: _v.clone(), distance: _v.distanceTo(ray.origin) };
          }
        }
        for (let i = 0; i < NSEG; i++) {
          segEnds(i, A, B);
          const r = list[i + 1].radius * 1.5 + 0.04;
          const d2 = ray.distanceSqToSegment(A, B, onRay, onSeg);
          if (d2 < r * r) {
            const dist = onRay.distanceTo(ray.origin);
            if (!best || dist < best.distance - 0.05) best = { part: list[i + 1], point: onSeg.clone(), distance: dist };
          }
        }
        return best;
      },
      react,
      setHeld(held) {
        if (sim.held === held) return;
        sim.held = held;
        const gs = held ? PLUSHY.heldGravityScale : 1;
        for (const b of bodies) b.setGravityScale(gs, true);
        runtime.idleTime = 0;
        setEye(sim.time);
      },
      heatAt(point, dt) {
        let heated = false;
        let bestD = Infinity;
        let bestPart = -1;
        const R = FIRE.heatRadius;
        // head: distance to the deformed surface
        const ho = partObject(0);
        if (ho) {
          _qi.copy(ho.quaternion).invert();
          const local = _v.copy(point).sub(ho.position).applyQuaternion(_qi);
          const surf = headSurface(_v2.copy(local).normalize(), _v2);
          const d = local.length() - surf.length();
          if (d < R) {
            heated = true;
            bestD = d;
            bestPart = 0;
            sim.heatLocal.copy(surf);
            // heat head vertices around the projected point
            const P = sim.headRest;
            const rr = 0.32;
            for (let v = 0; v < sim.headCount; v++) {
              const dx = P[v * 3] - surf.x;
              const dy = P[v * 3 + 1] - surf.y;
              const dz = P[v * 3 + 2] - surf.z;
              const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (dd < rr) {
                const w = 1 - dd / rr;
                sim.headHeat[v] = Math.min(1, sim.headHeat[v] + FIRE.heatRate * dt * w * 1.3);
                sim.headChar[v] = Math.min(1, sim.headChar[v] + FIRE.heatCharRate * dt * w * sim.headHeat[v]);
              }
            }
            sim.headActive = true;
          }
        }
        for (let i = 0; i < NSEG; i++) {
          const o = partObject(i + 1);
          if (!o) continue;
          const d = o.position.distanceTo(point) - list[i + 1].radius;
          if (d < R) {
            heated = true;
            const w = 1 - Math.max(0, d) / R;
            sim.heatSeg[i] = Math.min(1, sim.heatSeg[i] + FIRE.heatRate * dt * w);
            sim.charSeg[i] = Math.min(1, sim.charSeg[i] + FIRE.heatCharRate * dt * w * sim.heatSeg[i]);
            if (d < bestD) {
              bestD = d;
              bestPart = i + 1;
            }
          }
        }
        if (heated) {
          sim.lastHeated = sim.time;
          sim.heatTimer += dt;
          sim.heatPart = bestPart;
          runtime.idleTime = 0;
          if (sim.time - sim.lastSmokeWisp > 0.16) {
            sim.lastSmokeWisp = sim.time;
            runtime.fx.smoke(point, 1, 0.6);
          }
          if (!sim.fire.active && sim.heatTimer >= FIRE.igniteTime) ignite(bestPart, bestPart === 0 ? sim.heatLocal : undefined);
        }
        return heated;
      },
      isBurning: () => sim.fire.active,
      extinguish,
      centerOfMass(out) {
        const o = partObject(0);
        return o ? out.copy(o.position) : out.set(0, 0, 0);
      },
      noteInteraction() {
        runtime.idleTime = 0;
        sim.stillTime = 0;
      },
    };
    runtime.plushy = handle;
    return () => {
      bodies.forEach(untrack);
      if (runtime.plushy === handle) runtime.plushy = null;
      sound.stopCrackle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // ------------------------------------------------------------------ reset
  const resetPoseRef = useRef<() => void>(() => {});
  const outside = useRef(0);
  useEffect(() => {
    const resetPose = () => {
      const base = new Vector3(spawn.x, 0.75 + PLUSHY.resetDropHeight, spawn.z);
      const rot = { x: q0.x, y: q0.y, z: q0.z, w: q0.w };
      const zero = { x: 0, y: 0, z: 0 };
      const head = headRef.current;
      if (head) {
        head.setTranslation(base, true);
        head.setRotation(rot, true);
        head.setLinvel(zero, true);
        head.setAngvel(zero, true);
        head.setGravityScale(1, true);
      }
      for (const tn of layout.tentacles)
        for (const s of tn.segments) {
          const b = segRefs.current[segIndex(tn.t, s.k)];
          if (!b) continue;
          const p = s.center.clone().applyQuaternion(q0).add(base);
          b.setTranslation(p, true);
          b.setRotation(rot, true);
          b.setLinvel(zero, true);
          b.setAngvel(zero, true);
          b.setGravityScale(1, true);
        }
      extinguish(false);
      sim.charSeg.fill(0);
      sim.heatSeg.fill(0);
      sim.headChar.fill(0);
      sim.headHeat.fill(0);
      headGeo.attributes.aChar.needsUpdate = true;
      headGeo.attributes.aHeat.needsUpdate = true;
      sim.headActive = false;
      sim.held = false;
      sim.heatTimer = 0;
      sim.xUntil = sim.dizzyUntil = sim.squeezeUntil = 0;
      sim.settleUntil = performance.now() + 900;
      runtime.idleTime = 0;
      setEye(sim.time);
    };
    resetPoseRef.current = resetPose;
    return useStore.subscribe((s, prev) => {
      if (s.resetToken !== prev.resetToken) resetPose();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, q0, spawn]);

  // ------------------------------------------------------------------ collisions
  const onCollision = (e: CollisionEnterPayload) => {
    const part = (e.target.rigidBody?.userData as { part?: number } | undefined)?.part;
    if (part === undefined) return;
    const kind = bodyKind(e.other);
    if (kind === 'plushy' || kind === 'bat') return;
    const speed = impactSpeed(e);
    if (speed < 0.7) return;
    const now = performance.now() / 1000;
    if (now - sim.lastImpact[part] < IMPACT.bodyDebounce) return;
    sim.lastImpact[part] = now;
    if (sim.impacts.length > 40) return;
    sim.impacts.push({
      part,
      speed,
      kind,
      point: contactPoint(e, new Vector3()),
      normal: contactNormal(e, new Vector3()),
    });
  };

  const processImpacts = () => {
    if (!sim.impacts.length) return;
    const settling = performance.now() < sim.settleUntil;
    let best: Impact | null = null;
    let bestScore = 0;
    const propMax = new Map<string, Impact>();
    for (const im of sim.impacts) {
      const score = im.speed * (im.part === 0 ? 1 : IMPACT.tentacleWeight);
      if (score > bestScore) {
        bestScore = score;
        best = im;
      }
      const pm = propMax.get(im.kind);
      if (!pm || im.speed > pm.speed) propMax.set(im.kind, im);
    }
    sim.impacts.length = 0;

    for (const [kind, im] of propMax) {
      const s = im.speed;
      switch (kind) {
        case 'pouf': {
          runtime.props.pouf?.squash(s);
          if (s > 1.2) sound.play('boing', { intensity: Math.min(1, s / 8), pitch: 0.9 + Math.random() * 0.2 });
          // landing on top: relaunch the whole plushy (the joints would otherwise soak up the bounce)
          const now = sim.time;
          if (s > 2 && im.point.y > POUF.h * 0.7 && now - sim.lastBoing > 0.35) {
            sim.lastBoing = now;
            const up = Math.min(POUF_BOUNCE.max, POUF_BOUNCE.base + s * POUF_BOUNCE.gain);
            for (const b of allBodies()) {
              const v = b.linvel();
              b.setLinvel({ x: v.x * 0.85, y: Math.max(v.y, up), z: v.z * 0.85 }, true);
            }
          }
          break;
        }
        case 'tv':
          if (s > 1.8) runtime.props.tv?.glitch(s);
          break;
        case 'shelf':
          if (s > 1.5) runtime.props.shelf?.rattle(s, im.point);
          break;
        case 'console':
          if (s > 2) runtime.props.console?.thump(s, im.point);
          break;
        case 'lamp':
          runtime.props.lamp?.flicker(s);
          if (s > 1.5) sound.play('clank', { intensity: Math.min(1, s / 7) });
          break;
        case 'plant':
          runtime.props.plant?.wobble(s);
          break;
        case 'book':
          if (s > 1.5) sound.play('clatter', { intensity: Math.min(1, s / 7) });
          break;
        case 'screen':
          // it smacked into the "glass" between the room and you
          if (s > 3.5) {
            addTrauma(Math.min(0.5, s * 0.05));
            sound.play('thud', { intensity: Math.min(1, s / 8), pitch: 1.25 });
          }
          break;
      }
    }

    if (!best) return;
    const now = sim.time;
    // landings from its own idle wave or hop are just soft flumps
    if (now < sim.quietUntil && bestScore < IMPACT.heavy) {
      if (bestScore > 1.2) sound.play('squish', { intensity: 0.25, pitch: 1.1 });
      return;
    }
    if (now - sim.lastReaction < IMPACT.reactionDebounce && bestScore < IMPACT.heavy) return;
    sim.lastReaction = now;
    if (bestScore >= IMPACT.light) {
      runtime.idleTime = 0;
      sim.stillTime = 0;
    }

    const muffled = best.kind === 'floor' && onRug(best.point.x, best.point.z);
    const pitch = 0.88 + Math.random() * 0.3;
    if (bestScore < IMPACT.light) {
      if (bestScore > 0.9) sound.play('squish', { intensity: bestScore / 2, pitch });
      react('light', best.point, best.normal);
    } else {
      const heavy = bestScore >= IMPACT.heavy;
      if (best.kind !== 'pouf' || heavy) {
        sound.play('thud', {
          intensity: heavy ? 1 : 0.3 + ((bestScore - IMPACT.light) / (IMPACT.heavy - IMPACT.light)) * 0.55,
          pitch,
          muffled,
        });
      }
      if (Math.random() < (heavy ? 1 : 0.7)) sound.play('squeak', { intensity: heavy ? 0.85 : 0.55, pitch: 0.9 + Math.random() * 0.4 });
      if (!settling) react(heavy ? 'heavy' : 'medium', best.point, best.normal);
      else kickSquash(best.normal, 3);
      if (sim.fire.active && bestScore > FIRE.extinguishSpeed && (best.kind === 'floor' || best.kind === 'pouf')) extinguish(true);
    }
  };

  // ------------------------------------------------------------------ physics-rate behaviours
  useBeforePhysicsStep(() => {
    const head = headRef.current;
    if (!head) return;
    const dt = 1 / 60;
    const f = sim.fire;
    // flailing while on fire
    if (f.active && sim.time - f.lastFlail > FIRE.flailInterval) {
      f.lastFlail = sim.time;
      for (let n = 0; n < 3; n++) {
        const b = segRefs.current[segIndex(Math.floor(Math.random() * TC), 3 + Math.floor(Math.random() * (SEG - 3)))];
        if (!b) continue;
        const m = b.mass();
        b.applyImpulse(
          { x: (Math.random() - 0.5) * FIRE.flailImpulse * m * 30, y: FIRE.flailImpulse * m * 18, z: (Math.random() - 0.5) * FIRE.flailImpulse * m * 30 },
          true,
        );
      }
      if (Math.random() < 0.25 && !sim.held) head.applyImpulse({ x: (Math.random() - 0.5) * 0.8, y: 1.6, z: (Math.random() - 0.5) * 0.8 }, true);
    }
    if (sim.held || f.active) return;

    // self-righting after a beating: wobble upright once settled
    const r = head.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const up = _v.copy(UP).applyQuaternion(_q);
    const tilt = Math.acos(Math.min(1, Math.max(-1, up.y)));
    const lv = head.linvel();
    const speed = Math.hypot(lv.x, lv.y, lv.z);
    if (speed < 0.6) sim.stillTime += dt;
    else sim.stillTime = 0;
    const av = head.angvel();
    if (tilt > 0.3 && sim.stillTime > 1.2) {
      const axis = _v2.crossVectors(up, UP);
      if (axis.lengthSq() > 1e-6) {
        axis.normalize();
        const k = PLUSHY.selfRightStrength * Math.min(1.4, tilt);
        head.applyTorqueImpulse(
          { x: (axis.x * k - av.x * 0.25) * dt, y: (axis.y * k - av.y * 0.25) * dt, z: (axis.z * k - av.z * 0.25) * dt },
          true,
        );
        if (tilt > 1.2 && Math.random() < 0.01) {
          head.applyImpulse({ x: 0, y: 2.2, z: 0 }, true);
          sim.quietUntil = sim.time + 1.2;
        }
      }
    }

    // idle charm: slowly turn to face the cursor, and wave now and then
    if (runtime.idleTime > IDLE.after && tilt < 0.5 && speed < 0.3) {
      const face = _v.copy(FRONT).applyQuaternion(_q);
      const hp = head.translation();
      const target = cursorFloor(_v2);
      if (target) {
        const want = Math.atan2(target.x - hp.x, target.z - hp.z);
        const have = Math.atan2(face.x, face.z);
        let err = want - have;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;
        if (Math.abs(err) > 0.12) {
          // shuffle the whole plushy around its head: a tiny rigid rotation per step,
          // so the tentacles come along instead of anchoring it to the floor
          const dTheta = Math.max(-1, Math.min(1, err)) * PLUSHY.idleTurnSpeed * dt;
          _qTurn.setFromAxisAngle(UP, dTheta);
          for (const b of allBodies()) {
            const p = b.translation();
            const r = b.rotation();
            _v.set(p.x - hp.x, p.y - hp.y, p.z - hp.z).applyQuaternion(_qTurn);
            b.setTranslation({ x: hp.x + _v.x, y: hp.y + _v.y, z: hp.z + _v.z }, true);
            _q.set(r.x, r.y, r.z, r.w).premultiply(_qTurn);
            b.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
          }
        }
      }
      sim.waveTimer -= dt;
      if (sim.waveTimer <= 0) {
        sim.waveTimer = 2.5 + Math.random() * 2;
        sim.quietUntil = sim.time + 1.4;
        const t = Math.floor(Math.random() * TC);
        for (let k = SEG - 3; k < SEG; k++) {
          const b = segRefs.current[segIndex(t, k)];
          b?.applyImpulse({ x: 0, y: b.mass() * (2.2 + (k - (SEG - 3)) * 0.6), z: 0 }, true);
        }
      }
    }
  });

  // ------------------------------------------------------------------ per frame
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    sim.time += dt;
    const now = sim.time;
    uniforms.uTime.value = now;
    runtime.idleTime += dt;
    const head = partObject(0);
    if (!head) return;

    processImpacts();

    // safety net: if it ever ends up outside the visible room (e.g. the window
    // was resized and the screen boundary moved past it), drop it back in
    const hpos = head.position;
    const out =
      hpos.z > runtime.view.frontZ + 0.9 ||
      Math.abs(hpos.x) > ROOM.halfWidth + 0.2 ||
      hpos.y < -0.6 ||
      hpos.y > ROOM.height + 0.6 ||
      hpos.z < ROOM.back - 0.4;
    outside.current = out && !sim.held ? outside.current + dt : 0;
    if (outside.current > 0.6) {
      outside.current = 0;
      resetPoseRef.current();
    }

    // held: tentacles wiggle
    if (sim.held && Math.random() < dt * 6) {
      const b = segRefs.current[segIndex(Math.floor(Math.random() * TC), SEG - 1 - Math.floor(Math.random() * 2))];
      b?.applyImpulse({ x: (Math.random() - 0.5) * 0.05, y: 0.03, z: (Math.random() - 0.5) * 0.05 }, true);
    }

    // ---- fire
    const f = sim.fire;
    let fireCount = 0;
    const firePos = _v2.set(0, 0, 0);
    if (f.active) {
      const age = now - f.start;
      // spread to neighbours during the first ~1.2 s
      if (age < 1.3 && now - f.lastSpread > FIRE.spreadDelay) {
        f.lastSpread = now;
        const burning: number[] = [];
        for (let i = 0; i < NPARTS; i++) if (f.burn[i] >= 0 && now - f.burn[i] >= FIRE.spreadDelay * 0.9) burning.push(i);
        for (const i of burning) {
          if (i === 0) {
            for (let t = 0; t < TC; t++) if (Math.random() < 0.3 && f.burn[1 + segIndex(t, 0)] < 0) f.burn[1 + segIndex(t, 0)] = now;
            if (f.headAnchors.length < 4 && f.headAnchors.length > 0) {
              const a = f.headAnchors[Math.floor(Math.random() * f.headAnchors.length)];
              const d = a.clone().normalize().add(new Vector3((Math.random() - 0.5) * 0.7, Math.random() * 0.5, (Math.random() - 0.5) * 0.7)).normalize();
              f.headAnchors.push(headSurface(d, new Vector3()));
            }
          } else {
            const si = i - 1;
            const t = Math.floor(si / SEG);
            const k = si % SEG;
            const nb = [k > 0 ? 1 + segIndex(t, k - 1) : 0, k < SEG - 1 ? 1 + segIndex(t, k + 1) : -1];
            for (const n of nb) {
              if (n < 0 || f.burn[n] >= 0) continue;
              if (Math.random() < 0.75) {
                f.burn[n] = now;
                if (n === 0 && f.headAnchors.length === 0) {
                  // fire climbs up from this tentacle's root
                  const root = layout.tentacles[t].points[0];
                  f.headAnchors.push(headSurface(root.clone().setY(root.y * 0.6).normalize(), new Vector3()));
                }
              }
            }
          }
        }
      }
      // emit flames, accumulate char
      const burning: number[] = [];
      for (let i = 0; i < NPARTS; i++) if (f.burn[i] >= 0) burning.push(i);
      const emits = Math.min(5, Math.max(1, Math.round(dt * 60 * 3.5)));
      for (let e = 0; e < emits && burning.length; e++) {
        const i = burning[Math.floor(Math.random() * burning.length)];
        let p: Vector3;
        let size: number;
        if (i === 0 && f.headAnchors.length) {
          const a = f.headAnchors[Math.floor(Math.random() * f.headAnchors.length)];
          p = _v.copy(a).multiplyScalar(1.04).applyQuaternion(head.quaternion).add(head.position);
          size = 1.5;
        } else {
          const o = partObject(i === 0 ? 1 : i);
          if (!o) continue;
          p = _v.copy(o.position);
          size = i === 0 ? 1.3 : 0.7 + parts.current[i].radius * 5;
        }
        runtime.fx.fire(p, 1, size);
        firePos.add(p);
        fireCount++;
      }
      for (const i of burning) {
        if (i === 0) continue;
        sim.charSeg[i - 1] = Math.min(1, sim.charSeg[i - 1] + FIRE.charRate * dt);
        sim.heatSeg[i - 1] = 0.75 + Math.random() * 0.25;
      }
      if (f.headAnchors.length) {
        const P = sim.headRest;
        for (const a of f.headAnchors) {
          for (let v = 0; v < sim.headCount; v++) {
            const dx = P[v * 3] - a.x;
            const dy = P[v * 3 + 1] - a.y;
            const dz = P[v * 3 + 2] - a.z;
            const dd = dx * dx + dy * dy + dz * dz;
            if (dd < 0.09) {
              const w = 1 - Math.sqrt(dd) / 0.3;
              sim.headHeat[v] = Math.max(sim.headHeat[v], 0.85 * w);
              sim.headChar[v] = Math.min(1, sim.headChar[v] + FIRE.charRate * dt * w);
            }
          }
        }
        sim.headActive = true;
      }
      if (now - f.lastSmoke > 0.12 && burning.length) {
        f.lastSmoke = now;
        const o = partObject(burning[Math.floor(Math.random() * burning.length)] || 1);
        if (o) runtime.fx.smoke(_v.copy(o.position).add(SMOKE_LIFT), 1, 1);
      }
      if (now - f.lastMeter > 1.2) {
        f.lastMeter = now;
        useStore.getState().registerHit(0.4, 'burn');
      }
      if (age > FIRE.burnDuration) extinguish(true);
    }
    // the fire light follows the flames
    const fl = fireLight.current;
    if (fl) {
      if (fireCount > 0) {
        firePos.divideScalar(fireCount);
        fl.position.lerp(firePos.add(LIGHT_LIFT), 0.35);
        fl.intensity = 3.2 + Math.random() * 1.8;
      } else fl.intensity = Math.max(0, fl.intensity - dt * 40);
      runtime.fireGlow = fl.intensity;
      runtime.fireGlowPos.copy(fl.position);
    }

    // ---- heat / char recovery
    const heatingNow = now - sim.lastHeated < 0.12;
    if (!heatingNow) sim.heatTimer = Math.max(0, sim.heatTimer - dt * 2);
    const charDecay = dt / PLUSHY.charRecovery;
    for (let i = 0; i < NSEG; i++) {
      const burningPart = f.active && f.burn[i + 1] >= 0;
      if (!burningPart) {
        if (!heatingNow) sim.heatSeg[i] = Math.max(0, sim.heatSeg[i] - FIRE.heatDecay * dt);
        if (!f.active) sim.charSeg[i] = Math.max(0, sim.charSeg[i] - charDecay);
      }
    }
    if (sim.headActive) {
      let any = false;
      const decayHeat = !heatingNow && !(f.active && f.headAnchors.length);
      for (let v = 0; v < sim.headCount; v++) {
        if (decayHeat && sim.headHeat[v] > 0) sim.headHeat[v] = Math.max(0, sim.headHeat[v] - FIRE.heatDecay * dt);
        if (!f.active && sim.headChar[v] > 0) sim.headChar[v] = Math.max(0, sim.headChar[v] - charDecay);
        if (sim.headHeat[v] > 0 || sim.headChar[v] > 0) any = true;
      }
      headGeo.attributes.aChar.needsUpdate = true;
      headGeo.attributes.aHeat.needsUpdate = true;
      sim.headActive = any;
    }

    // ---- tentacle tubes
    const hp = head.position;
    const hq = head.quaternion;
    const lv = headRef.current?.linvel();
    const restSpeed = lv ? Math.hypot(lv.x, lv.y, lv.z) : 0;
    sim.swayAmt += ((restSpeed < 0.25 && !sim.held && !f.active ? 1 : 0) - sim.swayAmt) * Math.min(1, dt * 1.5);
    const t = state.clock.elapsedTime;
    for (const tn of layout.tentacles) {
      const fr = sim.frames[tn.t];
      fr.points[0].copy(tn.innerRoot).applyQuaternion(hq).add(hp);
      for (let k = 0; k < SEG; k++) {
        const o = partObject(1 + segIndex(tn.t, k));
        const s = tn.segments[k];
        if (!o) continue;
        // start joint: average of this segment's start and the previous segment's end
        const start = _v.copy(s.start).sub(s.center).applyQuaternion(o.quaternion).add(o.position);
        if (k === 0) fr.points[1].copy(start);
        else fr.points[1 + k].add(start).multiplyScalar(0.5);
        fr.points[2 + k].copy(s.end).sub(s.center).applyQuaternion(o.quaternion).add(o.position);
        fr.downs[k].copy(s.down).applyQuaternion(o.quaternion);
      }
      // gentle idle sway (visual only)
      if (sim.swayAmt > 0.01) {
        const ph = t * 0.8 + tn.t * 1.7;
        const sx = Math.sin(ph);
        const sz = Math.cos(ph * 0.83);
        const sy = Math.max(0, Math.sin(ph * 0.61));
        for (let k = 4; k <= SEG; k++) {
          const w = Math.pow((k - 3) / (SEG - 3), 2) * 0.04 * sim.swayAmt;
          fr.points[1 + k].x += sx * w;
          fr.points[1 + k].z += sz * w;
          fr.points[1 + k].y += sy * w * 0.8;
        }
      }
      tubes[tn.t].update({ points: fr.points, downs: fr.downs, char: sim.charSeg, heat: sim.heatSeg, offset: tn.t * SEG });
    }

    // ---- head squash & stretch + breathing
    const sq = Math.max(-0.28, Math.min(0.32, sim.squash.step(dt)));
    if (alignRef.current && scaleRef.current && unalignRef.current) {
      _q.setFromUnitVectors(UP, sim.squashAxis);
      alignRef.current.quaternion.copy(_q);
      unalignRef.current.quaternion.copy(_q).invert();
      scaleRef.current.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    }
    if (breathRef.current) {
      const b = Math.sin(t * 1.7) * 0.014 * (sim.held ? 0.3 : 1);
      breathRef.current.scale.set(1 - b * 0.4, 1 + b, 1 - b * 0.4);
    }
    sim.flash = Math.max(0, sim.flash - dt * 8);
    uniforms.uHitFlash.value = sim.flash;

    // ---- eyes: blink + expression
    sim.nextBlink -= dt;
    if (sim.nextBlink <= 0 && sim.blinkT < 0) {
      sim.blinkT = 0;
      sim.nextBlink = IDLE.blinkMin + Math.random() * (IDLE.blinkMax - IDLE.blinkMin);
    }
    if (sim.blinkT >= 0) {
      sim.blinkT += dt;
      const bt = sim.blinkT / 0.16;
      sim.eye.blink = bt < 1 ? Math.sin(bt * Math.PI) : 0;
      if (bt >= 1) {
        sim.blinkT = -1;
        if (runtime.idleTime > IDLE.after && Math.random() < 0.4) sim.nextBlink = 0.25; // double blink
      }
    }
    setEye(now);

    // ---- dizzy stars
    const stars = starsRef.current;
    if (stars) {
      const show = sim.eye.mode === 'dizzy' || sim.eye.mode === 'x';
      stars.visible = show;
      if (show) {
        const top = _v.set(0, PLUSHY.head.radius * PLUSHY.head.heightScale + 0.22, 0).applyQuaternion(hq).add(hp);
        stars.position.copy(top);
        stars.children.forEach((c, i) => {
          const a = t * 3.2 + (i / stars.children.length) * Math.PI * 2;
          c.position.set(Math.cos(a) * 0.42, Math.sin(a * 2) * 0.04, Math.sin(a) * 0.42);
          c.rotation.set(0.3, -a + t * 2, 0);
        });
      }
    }
  });

  const J = PLUSHY.material;
  return (
    <group>
      <RigidBody
        ref={headRef}
        position={PLUSHY.spawn}
        rotation={[0, yaw0, 0]}
        colliders={false}
        ccd
        canSleep
        linearDamping={J.linearDamping}
        angularDamping={J.angularDamping}
        additionalSolverIterations={4}
        userData={{ kind: 'plushy', part: 0 }}
        onCollisionEnter={onCollision}
      >
        <CapsuleCollider
          args={[PLUSHY.head.colliderHalfHeight, PLUSHY.head.colliderRadius]}
          mass={PLUSHY.head.mass}
          friction={J.friction}
          restitution={J.restitution}
        />
        <group ref={headAnchor}>
          <group ref={breathRef}>
            <group ref={alignRef}>
              <group ref={scaleRef}>
                <group ref={unalignRef}>
                  <mesh geometry={headGeo} material={headMat} castShadow receiveShadow />
                  <Eyes ctrl={sim.eye} />
                </group>
              </group>
            </group>
          </group>
        </group>
      </RigidBody>

      {layout.tentacles.flatMap((tn) =>
        tn.segments.map((s) => {
          const i = segIndex(tn.t, s.k);
          return (
            <RigidBody
              key={i}
              ref={(b) => {
                segRefs.current[i] = b;
              }}
              position={segSpawn[i]}
              rotation={[0, yaw0, 0]}
              colliders={false}
              canSleep
              linearDamping={J.linearDamping}
              angularDamping={J.segmentAngularDamping}
              additionalSolverIterations={4}
              userData={{ kind: 'plushy', part: i + 1 }}
              onCollisionEnter={onCollision}
            >
              <CapsuleCollider
                args={[s.halfHeight, s.colliderRadius]}
                quaternion={s.colliderQuat}
                mass={PLUSHY.tentacle.segmentMass}
                friction={J.friction}
                restitution={J.restitution}
              />
              <group
                ref={(g) => {
                  segAnchors.current[i] = g;
                }}
              />
            </RigidBody>
          );
        }),
      )}

      {tubes.map((tb, i) => (
        <mesh key={i} geometry={tb.geometry} material={tentMat} castShadow receiveShadow frustumCulled={false} />
      ))}

      <group ref={starsRef} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={starGeo} material={starMat} />
        ))}
      </group>
      <pointLight ref={fireLight} color="#FF8A2A" intensity={0} distance={6} decay={1.4} />
    </group>
  );
}

/** Where the pointer ray hits the floor (for idle look-at). */
const _cursorRay = new Ray();
function cursorFloor(out: Vector3): Vector3 | null {
  const cam = runtime.camera;
  if (!cam || !runtime.pointer.inside) return null;
  _cursorRay.origin.setFromMatrixPosition(cam.matrixWorld);
  _cursorRay.direction.set(runtime.pointer.ndc.x, runtime.pointer.ndc.y, 0.5).unproject(cam).sub(_cursorRay.origin).normalize();
  const t = -_cursorRay.origin.y / _cursorRay.direction.y;
  if (!(t > 0)) return null;
  return _cursorRay.at(t, out);
}
