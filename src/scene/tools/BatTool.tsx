import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import { BAT } from '../../config';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';
import { sound } from '../../audio/SoundManager';
import { rayPlaneY, type PointerInfo, type RegisterTool } from './Tools';
import { FX_LAYER } from '../layers';

const UP = new Vector3(0, 1, 0);
const PARK = { x: 0, y: -30, z: 0 };
const TRAIL = 14;
const PITCH = -0.12; // barrel dips slightly during the swing
const BARREL_START = BAT.barrelStart; // the hitting part of the bat starts here
const LEN = BAT.length;
const GS = BAT.length / 1.153; // lathe profile below is authored for a 1.15 bat

interface Swing {
  active: boolean;
  theta: number;
  theta1: number;
  omega: number;
  pivot: Vector3;
  dir: Vector3;
  hit: boolean;
  follow: number; // follow-through hold time left
  started: number;
}

const _u = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _q = new Quaternion();
const _hitDir = new Vector3();

function batDir(theta: number, out: Vector3) {
  return out.set(Math.sin(theta) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(theta) * Math.cos(PITCH));
}

function closestOnSegment(p: Vector3, a: Vector3, b: Vector3, out: Vector3) {
  const ab = _p.subVectors(b, a);
  const t = Math.max(0, Math.min(1, out.subVectors(p, a).dot(ab) / ab.lengthSq()));
  return { point: out.copy(a).addScaledVector(ab, t), t };
}

/** Baseball bat: follows the cursor, swipe to swing a kinematic sweep. */
export function BatTool({ register }: { register: RegisterTool }) {
  const tool = useStore((s) => s.tool);
  const active = tool === 'bat';
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const group = useRef<Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const cursor = useRef(new Vector3(1.5, BAT.hoverY, 1.5));
  const press = useRef<{ x: number; y: number; t: number; world: Vector3; height: number } | null>(null);
  const lastSwing = useRef(0);
  const swing = useRef<Swing>({
    active: false,
    theta: 0,
    theta1: 0,
    omega: 0,
    pivot: new Vector3(),
    dir: new Vector3(1, 0, 0),
    hit: false,
    follow: 0,
    started: 0,
  });
  const idle = useRef({ pos: new Vector3(1.5, BAT.hoverY, 1.5), quat: new Quaternion() });

  const geo = useMemo(() => {
    const pts = [
      [0, 0],
      [0.034, 0],
      [0.036, 0.012],
      [0.03, 0.03],
      [0.019, 0.05],
      [0.018, 0.4],
      [0.024, 0.55],
      [0.042, 0.78],
      [0.05, 0.98],
      [0.05, 1.1],
      [0.045, 1.135],
      [0.03, 1.15],
      [0, 1.153],
    ].map(([x, y]) => new Vector2(x * GS * 1.05, y * GS));
    return new LatheGeometry(pts, 28);
  }, []);
  const wood = useMemo(() => new MeshStandardMaterial({ color: '#E2C08F', roughness: 0.45 }), []);
  const grip = useMemo(() => new MeshStandardMaterial({ color: '#2E2A27', roughness: 0.85 }), []);

  // motion trail ribbon (tip + mid point history)
  const trail = useMemo(() => {
    const g = new BufferGeometry();
    const pos = new BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3).setUsage(DynamicDrawUsage);
    const alpha = new BufferAttribute(new Float32Array(TRAIL * 2), 1).setUsage(DynamicDrawUsage);
    g.setAttribute('position', pos);
    g.setAttribute('color', new BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3).setUsage(DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    const m = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    const mesh = new Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 9;
    mesh.layers.set(FX_LAYER);
    return { mesh, pos, alpha, samples: [] as { tip: Vector3; mid: Vector3; age: number }[] };
  }, []);

  useEffect(() => {
    const startSwing = (dirWorld: Vector3, omega: number, center: Vector3) => {
      const now = performance.now() / 1000;
      if (now - lastSwing.current < BAT.cooldown) return;
      lastSwing.current = now;
      const s = swing.current;
      const d = _a.copy(dirWorld).setY(0);
      if (d.lengthSq() < 1e-6) d.set(1, 0, 0);
      d.normalize();
      s.dir.copy(d);
      // at mid-swing the barrel's velocity points along the drag direction
      const thetaMid = Math.atan2(-d.z, d.x);
      const sweep = (BAT.sweepDeg * Math.PI) / 180;
      s.theta = thetaMid - sweep / 2;
      s.theta1 = thetaMid + sweep / 2;
      s.omega = omega;
      batDir(thetaMid, _u);
      s.pivot.copy(center).addScaledVector(_u, -BAT.sweetSpot);
      s.active = true;
      s.hit = false;
      s.follow = 0;
      s.started = now;
      trail.samples.length = 0;
      const b = body.current;
      if (b) {
        batDir(s.theta, _u);
        _q.setFromUnitVectors(UP, _u);
        b.setTranslation(s.pivot, true);
        b.setRotation(_q, true);
      }
      const k = Math.min(1, omega / BAT.maxAngVel);
      sound.play('whoosh', { intensity: 0.35 + k * 0.65, pitch: 0.85 + k * 0.4 });
      runtime.plushy?.noteInteraction();
    };

    /**
     * Aim assist: if the swipe line passes near the plushy, centre the arc on
     * it so swipes "through" the octopus connect. Otherwise swing around the
     * current pointer position.
     */
    const aimCenter = (start: Vector3, drag: Vector3, fallback: Vector3) => {
      const plushy = runtime.plushy;
      const d = _a.copy(drag).setY(0);
      if (!plushy || d.lengthSq() < 1e-6) return fallback.clone();
      d.normalize();
      const hp = plushy.head.translation();
      const rel = _b.set(hp.x - start.x, 0, hp.z - start.z);
      const along = rel.dot(d);
      const perp = rel.addScaledVector(d, -along).length();
      if (perp < BAT.aimAssist && along > -0.8 && along < 4) {
        return new Vector3(hp.x, Math.max(0.35, Math.min(1.4, hp.y)), hp.z);
      }
      return fallback.clone();
    };

    const swingHeight = (p: PointerInfo) => {
      const hit = runtime.plushy?.raycast(p.ray);
      return hit ? Math.max(0.25, Math.min(1.5, hit.point.y)) : 0.7;
    };

    register('bat', {
      down(p) {
        const h = swingHeight(p);
        const w = rayPlaneY(p.ray, h, new Vector3()) ?? cursor.current.clone();
        press.current = { x: p.x, y: p.y, t: p.time, world: w, height: h };
      },
      move(p) {
        const hit = rayPlaneY(p.ray, BAT.hoverY, _b);
        if (hit) cursor.current.copy(hit);
        const pr = press.current;
        if (!pr || swing.current.active) return;
        const moved = Math.hypot(p.x - pr.x, p.y - pr.y);
        if (moved > BAT.swipeTriggerPx) {
          const cur = rayPlaneY(p.ray, pr.height, new Vector3());
          if (!cur) return;
          const drag = cur.clone().sub(pr.world);
          const dt = Math.max(0.03, p.time - pr.t);
          const speed = drag.length() / dt;
          const omega = Math.max(BAT.minAngVel, Math.min(BAT.maxAngVel, (speed * BAT.speedToAngVel) / BAT.sweetSpot));
          startSwing(drag, omega, aimCenter(pr.world, drag, cur));
          press.current = null;
        }
      },
      up(p) {
        const pr = press.current;
        press.current = null;
        if (!pr || swing.current.active) return;
        // a tap: default left-to-right horizontal swing through the pointer
        const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
        startSwing(right, BAT.tapAngVel, aimCenter(pr.world, right, pr.world));
        void p;
      },
      cancel() {
        press.current = null;
      },
      cursor() {
        return 'none';
      },
    });
    return () => register('bat', null);
  }, [register, camera, trail]);

  // park the kinematic body until a swing starts
  useEffect(() => {
    body.current?.setTranslation(PARK, false);
  }, []);

  useBeforePhysicsStep(() => {
    const s = swing.current;
    const b = body.current;
    if (!b) return;
    if (!s.active) return;
    const dt = 1 / 60;
    const prevTheta = s.theta;
    s.theta = Math.min(s.theta1, s.theta + s.omega * dt);
    batDir(s.theta, _u);
    _q.setFromUnitVectors(UP, _u);
    b.setNextKinematicTranslation(s.pivot);
    b.setNextKinematicRotation(_q);

    // swept hit test against the plushy (sub-stepped so fast swings can't skip it)
    const plushy = runtime.plushy;
    if (plushy && !s.hit) {
      const subs = 5;
      for (let i = 1; i <= subs && !s.hit; i++) {
        const th = prevTheta + ((s.theta - prevTheta) * i) / subs;
        batDir(th, _u);
        _a.copy(s.pivot).addScaledVector(_u, BARREL_START);
        _b.copy(s.pivot).addScaledVector(_u, LEN);
        for (const part of plushy.parts) {
          const o = part.obj;
          const reach = (part.kind === 'head' ? 0.58 : part.radius + 0.02) + BAT.radius;
          const c = closestOnSegment(o.position, _a, _b, new Vector3());
          if (c.point.distanceToSquared(o.position) < reach * reach) {
            s.hit = true;
            const r = BARREL_START + c.t * (LEN - BARREL_START);
            const barrelSpeed = s.omega * r;
            // barrel velocity direction at this angle
            _hitDir.set(Math.cos(th), 0, -Math.sin(th)).normalize();
            const launch = Math.min(BAT.maxHitSpeed, barrelSpeed * BAT.hitScale);
            const strength = Math.min(1, launch / BAT.maxHitSpeed);
            const dv = _hitDir.clone().multiplyScalar(launch);
            dv.y += launch * BAT.hitUp;
            for (const pb of plushy.bodies) {
              const v = pb.linvel();
              const w = pb === part.body ? 1.25 : 1;
              pb.setLinvel({ x: v.x * 0.3 + dv.x * w, y: Math.max(v.y * 0.3, 0) + dv.y * w, z: v.z * 0.3 + dv.z * w }, true);
            }
            plushy.head.setAngvel(
              { x: (Math.random() - 0.5) * 10 * strength, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 10 * strength },
              true,
            );
            const point = c.point.clone().lerp(o.position, 0.5);
            plushy.react('bat', point, _hitDir.clone(), Math.max(0.25, strength));
            break;
          }
        }
      }
    }

    if (s.theta >= s.theta1) {
      s.follow += dt;
      if (s.follow > 0.12) {
        s.active = false;
        b.setTranslation(PARK, false);
      }
    }
  });

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    g.visible = active;
    const s = swing.current;
    const id = idle.current;
    const t = state.clock.elapsedTime;
    if (s.active) {
      batDir(s.theta, _u);
      g.position.copy(s.pivot);
      g.quaternion.setFromUnitVectors(UP, _u);
      // sample the trail
      if (s.omega > 9) {
        trail.samples.unshift({
          tip: g.position.clone().addScaledVector(_u, LEN),
          mid: g.position.clone().addScaledVector(_u, LEN * 0.48),
          age: 0,
        });
        if (trail.samples.length > TRAIL) trail.samples.length = TRAIL;
      }
      id.pos.copy(g.position);
      id.quat.copy(g.quaternion);
    } else {
      // idle: hover by the cursor, resting over the "shoulder", swaying
      const target = _a.copy(cursor.current).add(_b.set(0.12, -0.35, 0.12));
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * 14);
      id.pos.lerp(target, k);
      const right = _b.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      const lean = _p.copy(UP).addScaledVector(right, 0.42 + Math.sin(t * 1.4) * 0.05);
      lean.z -= 0.15;
      lean.normalize();
      _q.setFromUnitVectors(UP, lean);
      id.quat.slerp(_q, k * 0.7);
      g.position.copy(id.pos);
      g.quaternion.copy(id.quat);
    }

    // trail mesh
    const P = trail.pos.array as Float32Array;
    const C = trail.mesh.geometry.getAttribute('color').array as Float32Array;
    for (const smp of trail.samples) smp.age += Math.min(dt, 0.05);
    for (let i = 0; i < TRAIL; i++) {
      const smp = trail.samples[Math.min(i, trail.samples.length - 1)];
      const a = smp ? Math.max(0, 1 - i / TRAIL) * Math.max(0, 1 - smp.age / 0.18) * 0.55 : 0;
      const tip = smp?.tip ?? g.position;
      const mid = smp?.mid ?? g.position;
      P.set([tip.x, tip.y, tip.z, mid.x, mid.y, mid.z], i * 6);
      C.set([a, a * 0.97, a * 0.92, 0, 0, 0], i * 6);
    }
    trail.pos.needsUpdate = true;
    trail.mesh.geometry.getAttribute('color').needsUpdate = true;
    trail.mesh.visible = active && trail.samples.length > 1;
  });

  return (
    <>
      <group ref={group} visible={false}>
        <mesh geometry={geo} material={wood} castShadow />
        {/* grip tape over the handle */}
        <mesh position={[0, 0.25 * GS, 0]} material={grip} castShadow>
          <cylinderGeometry args={[0.0215 * GS * 1.05, 0.0205 * GS * 1.05, 0.4 * GS, 16]} />
        </mesh>
      </group>
      <primitive object={trail.mesh} />
      <RigidBody ref={body} type="kinematicPosition" colliders={false} ccd position={[PARK.x, PARK.y, PARK.z]} userData={{ kind: 'bat' }}>
        <CapsuleCollider args={[(LEN - BARREL_START) / 2 - BAT.radius, BAT.radius]} position={[0, (LEN + BARREL_START) / 2, 0]} friction={0.3} />
      </RigidBody>
    </>
  );
}
