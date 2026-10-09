import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useRapier, type RapierRigidBody } from '@react-three/rapier';
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Ray,
  Vector3,
} from 'three';
import { GUN } from '../../config';
import { runtime, type PlushyPart } from '../../state/runtime';
import { useStore } from '../../state/store';
import { sound } from '../../audio/SoundManager';
import { softDot } from '../textures';
import { Spring } from '../spring';
import { rayFromNdc, rayRoom, type RegisterTool } from './Tools';

/** Crosshair cursor while the blaster is out. */
const CROSSHAIR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' +
    '<circle cx="16" cy="16" r="9" fill="none" stroke="#1E1812" stroke-opacity="0.45" stroke-width="3.5"/>' +
    '<circle cx="16" cy="16" r="9" fill="none" stroke="#FFFFFF" stroke-width="2"/>' +
    '<circle cx="16" cy="16" r="2.4" fill="#F07B3F" stroke="#FFFFFF" stroke-width="1"/>' +
    '</svg>',
)}") 16 16, crosshair`;

const Z = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);

type Target =
  | { kind: 'plushy'; part: PlushyPart; local: Vector3 }
  | { kind: 'surface'; what: string; body: RapierRigidBody | null; normal: Vector3 }
  | { kind: 'none' };

interface Dart {
  group: Group;
  mode: 'free' | 'flying' | 'stuck' | 'falling';
  from: Vector3;
  to: Vector3;
  dir: Vector3;
  t: number;
  dur: number;
  target: Target;
  /** While stuck to the octopus: pose relative to the part. */
  part: PlushyPart | null;
  localPos: Vector3;
  localQuat: Quaternion;
  life: number;
  vel: Vector3;
  spin: Vector3;
}

const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _qi = new Quaternion();
const _ray = new Ray();
const _right = new Vector3();
const _up = new Vector3();
const _fwd = new Vector3();

/** Toy foam-dart blaster: click to shoot, hold for rapid fire. */
export function GunTool({ register }: { register: RegisterTool }) {
  const tool = useStore((s) => s.tool);
  const active = tool === 'gun';
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const { world, rapier } = useRapier();
  const gun = useRef<Group>(null);
  const muzzle = useRef<Group>(null);
  const flash = useRef<Mesh>(null);
  const firing = useRef(false);
  const lastShot = useRef(-1);
  const aim = useRef(new Vector3(0, 0.8, -1));
  const recoil = useMemo(() => new Spring(320, 20), []);
  const flashT = useRef(1);

  const mats = useMemo(
    () => ({
      body: new MeshStandardMaterial({ color: '#7BA7D1', roughness: 0.45 }),
      accent: new MeshStandardMaterial({ color: '#F07B3F', roughness: 0.5 }),
      grip: new MeshStandardMaterial({ color: '#3A3532', roughness: 0.8 }),
      foam: new MeshStandardMaterial({ color: '#6C9BD2', roughness: 0.95 }),
      cup: new MeshStandardMaterial({ color: '#F07B3F', roughness: 0.6 }),
      flash: new MeshBasicMaterial({ map: softDot(), color: new Color(2.2, 1.9, 1.5), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 }),
    }),
    [],
  );

  // pooled darts: a foam shaft with an orange suction cup; the group's origin is the cup's face
  const darts = useMemo<Dart[]>(() => {
    const shaft = new CylinderGeometry(0.028, 0.028, 0.21, 10);
    shaft.rotateX(Math.PI / 2);
    shaft.translate(0, 0, -0.135);
    const cup = new CylinderGeometry(0.04, 0.03, 0.03, 14);
    cup.rotateX(Math.PI / 2);
    cup.translate(0, 0, -0.015);
    return Array.from({ length: GUN.maxDarts }, () => {
      const group = new Group();
      const s = new Mesh(shaft, mats.foam);
      const c = new Mesh(cup, mats.cup);
      s.castShadow = c.castShadow = true;
      group.add(s, c);
      group.visible = false;
      return {
        group,
        mode: 'free' as const,
        from: new Vector3(),
        to: new Vector3(),
        dir: new Vector3(),
        t: 0,
        dur: 0.2,
        target: { kind: 'none' } as Target,
        part: null,
        localPos: new Vector3(),
        localQuat: new Quaternion(),
        life: 0,
        vel: new Vector3(),
        spin: new Vector3(),
      };
    });
  }, [mats]);

  const nextDart = () => {
    const free = darts.find((d) => d.mode === 'free');
    if (free) return free;
    // all busy: recycle the stuck dart with the least life left
    return darts.filter((d) => d.mode !== 'flying').sort((a, b) => a.life - b.life)[0] ?? darts[0];
  };

  /** What the crosshair is over: the octopus first, then any collider (minus the invisible screen). */
  const pick = (r: Ray): { point: Vector3; target: Target } | null => {
    const ph = runtime.plushy?.raycast(r);
    const hit = world.castRayAndGetNormal(
      new rapier.Ray(r.origin, r.direction),
      60,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (c) => {
        const kind = (c.parent()?.userData as { kind?: string } | undefined)?.kind;
        return kind !== 'screen' && kind !== 'bat' && kind !== 'plushy';
      },
    );
    if (ph && (!hit || ph.distance <= hit.timeOfImpact + 0.05)) {
      const point = ph.point.clone();
      // tentacle hits come back on the segment axis; move out to the surface
      if (ph.part.kind === 'seg') point.addScaledVector(r.direction, -ph.part.radius);
      const o = ph.part.obj;
      _qi.copy(o.quaternion).invert();
      return { point, target: { kind: 'plushy', part: ph.part, local: point.clone().sub(o.position).applyQuaternion(_qi) } };
    }
    if (hit) {
      const body = hit.collider.parent();
      const what = (body?.userData as { kind?: string } | undefined)?.kind ?? 'wall';
      return {
        point: r.at(hit.timeOfImpact, new Vector3()),
        target: {
          kind: 'surface',
          what,
          body: body && body.isDynamic() ? (body as RapierRigidBody) : null,
          normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
        },
      };
    }
    const p = new Vector3();
    return rayRoom(r, p) !== null ? { point: p, target: { kind: 'none' } } : null;
  };

  const fire = () => {
    const cam = runtime.camera;
    const m = muzzle.current;
    if (!cam || !m) return;
    lastShot.current = performance.now() / 1000;
    rayFromNdc(cam, runtime.pointer.ndc, _ray);
    const picked = pick(_ray);
    if (!picked) return;
    const d = nextDart();
    m.getWorldPosition(d.from);
    d.to.copy(picked.point);
    d.dir.subVectors(d.to, d.from).normalize();
    d.dur = Math.max(0.04, d.from.distanceTo(d.to) / GUN.dartSpeed);
    d.t = 0;
    d.target = picked.target;
    d.part = null;
    d.mode = 'flying';
    d.group.visible = true;
    d.group.scale.setScalar(GUN.dartScale);
    d.group.position.copy(d.from);
    d.group.quaternion.setFromUnitVectors(Z, d.dir);

    recoil.kick(4.5);
    flashT.current = 0;
    sound.play('pew', { intensity: 0.6, pitch: 0.92 + Math.random() * 0.16 });
    runtime.plushy?.noteInteraction();
  };

  const land = (d: Dart) => {
    const tg = d.target;
    if (tg.kind === 'plushy') {
      const o = tg.part.obj;
      // the part may have moved during the flight: land on it where it is now
      const point = _v.copy(tg.local).applyQuaternion(o.quaternion).add(o.position);
      // push along the shot, flattened (the camera looks down, so a raw shot
      // would mostly shove it into the floor), with a little pop upward
      const imp = tg.part.kind === 'head' ? GUN.impulseHead : GUN.impulseSegment;
      const push = _v2.set(d.dir.x, 0, d.dir.z).normalize();
      tg.part.body.applyImpulseAtPoint(
        { x: push.x * imp, y: imp * GUN.impulseLift, z: push.z * imp },
        { x: point.x, y: point.y, z: point.z },
        true,
      );
      runtime.plushy?.react('shot', point.clone(), _v2.copy(d.dir).negate().clone());
      sound.play('pok', { intensity: 0.7, pitch: 0.9 + Math.random() * 0.3 });
      // stick: remember the pose relative to the part
      d.part = tg.part;
      _qi.copy(o.quaternion).invert();
      d.localPos.copy(tg.local);
      d.localQuat.copy(_qi).multiply(_q.setFromUnitVectors(Z, d.dir));
      d.life = GUN.stickTime + Math.random();
      d.mode = 'stuck';
      return;
    }
    sound.play('pok', { intensity: 0.45, pitch: 0.75 + Math.random() * 0.2 });
    if (tg.kind === 'surface') {
      runtime.fx.ring(d.to, tg.normal, 0.22, 'ring');
      switch (tg.what) {
        case 'tv':
          runtime.props.tv?.glitch(2.5);
          break;
        case 'shelf':
          runtime.props.shelf?.rattle(2.2, d.to);
          break;
        case 'console':
          runtime.props.console?.thump(1.2, d.to);
          break;
        case 'pouf':
          runtime.props.pouf?.squash(1.6);
          break;
        case 'lamp':
          runtime.props.lamp?.flicker(2);
          break;
        case 'plant':
          runtime.props.plant?.wobble(2.5);
          break;
      }
      if (tg.body) {
        // loose props get knocked; the dart bounces off them
        const k = GUN.impulseProp * Math.min(1, tg.body.mass());
        tg.body.applyImpulseAtPoint({ x: d.dir.x * k, y: d.dir.y * k + 0.05, z: d.dir.z * k }, d.to, true);
        drop(d, tg.normal);
        return;
      }
      d.life = GUN.stickTime + Math.random();
      d.mode = 'stuck';
      return;
    }
    drop(d, UP);
  };

  const drop = (d: Dart, normal: Vector3) => {
    d.mode = 'falling';
    d.part = null;
    d.life = 1.6;
    d.vel.copy(normal).multiplyScalar(0.8 + Math.random() * 0.6).add(_v.set((Math.random() - 0.5) * 0.8, 0.6, (Math.random() - 0.5) * 0.8));
    d.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
  };

  useEffect(() => {
    register('gun', {
      down() {
        firing.current = true;
        fire();
      },
      move() {},
      up() {
        firing.current = false;
      },
      cancel() {
        firing.current = false;
      },
      cursor() {
        return CROSSHAIR;
      },
    });
    return () => register('gun', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register]);

  // darts stuck to the octopus pop off when the room resets
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.resetToken === prev.resetToken) return;
        for (const d of darts) {
          if (d.mode === 'stuck' && d.part) drop(d, UP);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [darts],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);

    // ---- the blaster in hand (camera space, aimed at the crosshair)
    const g = gun.current;
    if (g) {
      g.visible = active;
      if (active) {
        if (firing.current && performance.now() / 1000 - lastShot.current >= GUN.interval) fire();
        const cam = runtime.camera ?? camera;
        rayFromNdc(cam, runtime.pointer.ndc, _ray);
        const ph = runtime.plushy?.raycast(_ray);
        if (ph) aim.current.lerp(ph.point, 0.5);
        else if (rayRoom(_ray, _v) !== null) aim.current.lerp(_v, 0.5);
        _right.setFromMatrixColumn(cam.matrixWorld, 0);
        _up.setFromMatrixColumn(cam.matrixWorld, 1);
        cam.getWorldDirection(_fwd);
        const r = recoil.step(dt);
        const t = state.clock.elapsedTime;
        const [hx, hy, hz] = GUN.hold;
        g.position
          .copy(cam.position)
          .addScaledVector(_right, hx + Math.sin(t * 1.1) * 0.006)
          .addScaledVector(_up, hy + Math.sin(t * 1.7) * 0.006)
          .addScaledVector(_fwd, hz - r * GUN.recoil);
        g.lookAt(aim.current);
        g.rotateY(GUN.yawBias);
        g.rotateZ(GUN.cant);
        g.rotateX(-r * GUN.recoilPitch);
      }
    }

    // muzzle puff
    const f = flash.current;
    if (f) {
      flashT.current = Math.min(1, flashT.current + dt / 0.07);
      const k = 1 - flashT.current;
      mats.flash.opacity = k * 0.9;
      f.scale.setScalar(0.12 + (1 - k) * 0.12);
      f.visible = active && k > 0;
      if (f.visible && muzzle.current) {
        muzzle.current.getWorldPosition(f.position);
        f.quaternion.copy(camera.quaternion);
      }
    }

    // ---- darts
    for (const d of darts) {
      if (d.mode === 'free') continue;
      if (d.mode === 'flying') {
        d.t += dt / d.dur;
        if (d.t >= 1) {
          d.group.position.copy(d.to);
          land(d);
        } else d.group.position.lerpVectors(d.from, d.to, d.t);
        continue;
      }
      if (d.mode === 'stuck') {
        if (d.part) {
          const o = d.part.obj;
          d.group.position.copy(d.localPos).applyQuaternion(o.quaternion).add(o.position);
          d.group.quaternion.copy(o.quaternion).multiply(d.localQuat);
        }
        d.life -= dt;
        if (d.life <= 0) {
          // pop off, away from whatever it was stuck to
          _v.copy(Z).applyQuaternion(d.group.quaternion).negate();
          drop(d, _v);
          sound.play('pok', { intensity: 0.15, pitch: 1.5 });
        }
        continue;
      }
      // falling
      d.vel.y -= 14 * dt;
      d.group.position.addScaledVector(d.vel, dt);
      if (d.group.position.y < 0.03) {
        d.group.position.y = 0.03;
        d.vel.y *= -0.35;
        d.vel.x *= 0.6;
        d.vel.z *= 0.6;
        d.spin.multiplyScalar(0.5);
      }
      d.group.rotation.x += d.spin.x * dt;
      d.group.rotation.y += d.spin.y * dt;
      d.group.rotation.z += d.spin.z * dt;
      d.life -= dt;
      if (d.life < 0.4) d.group.scale.setScalar(GUN.dartScale * Math.max(0.001, d.life / 0.4));
      if (d.life <= 0) {
        d.mode = 'free';
        d.group.visible = false;
      }
    }
  });

  return (
    <>
      <group ref={gun} visible={false} scale={GUN.scale}>
        {/* slide + body */}
        <RoundedBox args={[0.1, 0.11, 0.32]} radius={0.035} smoothness={3} position={[0, 0.03, 0.01]} material={mats.body} />
        {/* dart hopper on top */}
        <RoundedBox args={[0.075, 0.05, 0.13]} radius={0.02} smoothness={2} position={[0, 0.105, -0.03]} material={mats.accent} />
        {/* barrel + orange safety tip */}
        <mesh position={[0, 0.035, 0.2]} rotation={[Math.PI / 2, 0, 0]} material={mats.body}>
          <cylinderGeometry args={[0.032, 0.036, 0.1, 18]} />
        </mesh>
        <mesh position={[0, 0.035, 0.265]} rotation={[Math.PI / 2, 0, 0]} material={mats.accent}>
          <cylinderGeometry args={[0.042, 0.042, 0.04, 18]} />
        </mesh>
        {/* grip, angled back */}
        <RoundedBox args={[0.085, 0.19, 0.095]} radius={0.03} smoothness={2} position={[0, -0.09, -0.09]} rotation={[0.32, 0, 0]} material={mats.grip} />
        {/* trigger guard + trigger */}
        <mesh position={[0, -0.04, 0.015]} rotation={[0, Math.PI / 2, 0]} material={mats.grip}>
          <torusGeometry args={[0.035, 0.008, 8, 20, Math.PI]} />
        </mesh>
        <mesh position={[0, -0.03, 0.01]} rotation={[0.3, 0, 0]} material={mats.accent}>
          <boxGeometry args={[0.014, 0.04, 0.012]} />
        </mesh>
        <group ref={muzzle} position={[0, 0.035, 0.3]} />
      </group>
      <mesh ref={flash} material={mats.flash} visible={false} renderOrder={20}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {darts.map((d, i) => (
        <primitive key={i} object={d.group} />
      ))}
    </>
  );
}
