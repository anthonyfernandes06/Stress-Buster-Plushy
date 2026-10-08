import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { Group, MeshStandardMaterial, PerspectiveCamera, PointLight, Vector3 } from 'three';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';
import { sound } from '../../audio/SoundManager';
import { rayPlaneY, type PointerInfo, type RegisterTool } from './Tools';

const S = 1.7; // the lighter is drawn a bit oversized so it reads at room scale
const BODY_H = 0.17;
const TIP_Y = (BODY_H / 2 + 0.06) * S; // flame tip above the lighter's centre

const _v = new Vector3();
const _toCam = new Vector3();

/** Press-and-hold lighter: heats, chars and eventually ignites the plushy. */
export function LighterTool({ register }: { register: RegisterTool }) {
  const tool = useStore((s) => s.tool);
  const active = tool === 'lighter';
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const group = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const wheel = useRef<Group>(null);
  const tip = useRef(new Vector3(1, 0.6, 1));
  const want = useRef(new Vector3(1, 0.6, 1));
  const state = useRef({ pressed: false, lit: false, litAt: 0, pressAt: 0, flameT: 0 });

  const bodyMat = useMemo(() => new MeshStandardMaterial({ color: '#E07A5F', roughness: 0.35 }), []);
  const metal = useMemo(() => new MeshStandardMaterial({ color: '#C9C6C0', roughness: 0.25, metalness: 0.9 }), []);
  const dark = useMemo(() => new MeshStandardMaterial({ color: '#3B3633', roughness: 0.6, metalness: 0.5 }), []);

  useEffect(() => {
    const aim = (p: PointerInfo) => {
      const hit = runtime.plushy?.raycast(p.ray);
      _toCam.copy(p.ray.direction).negate();
      if (hit) {
        want.current.copy(hit.point).addScaledVector(_toCam, 0.13).add(_v.set(0, 0.03, 0));
      } else {
        const floor = rayPlaneY(p.ray, 0, _v);
        if (floor) want.current.copy(floor).addScaledVector(_toCam, 0.25).add(_v.set(0, 0.12, 0));
      }
      want.current.y = Math.max(TIP_Y + 0.02, want.current.y);
      want.current.x = Math.max(-3.8, Math.min(3.8, want.current.x));
      want.current.z = Math.max(-3.8, Math.min(3.8, want.current.z));
    };
    const extinguish = () => {
      const s = state.current;
      s.pressed = false;
      s.lit = false;
    };
    register('lighter', {
      down(p) {
        aim(p);
        const s = state.current;
        s.pressed = true;
        s.pressAt = performance.now() / 1000;
        sound.play('flint', { pitch: 0.9 + Math.random() * 0.2 });
        runtime.fx.sparks(_v.copy(tip.current), 8);
        runtime.plushy?.noteInteraction();
      },
      move(p) {
        aim(p);
      },
      up() {
        extinguish();
      },
      cancel() {
        extinguish();
      },
      cursor() {
        return 'none';
      },
    });
    return () => register('lighter', null);
  }, [register]);

  useFrame((st, rawDt) => {
    const g = group.current;
    const l = light.current;
    if (!g || !l) return;
    const dt = Math.min(rawDt, 0.05);
    const s = state.current;
    g.visible = active;
    if (!active) {
      s.pressed = s.lit = false;
      l.intensity = 0;
      return;
    }
    const now = performance.now() / 1000;
    if (s.pressed && !s.lit && now - s.pressAt > 0.09) {
      s.lit = true;
      s.litAt = now;
      sound.play('ignite', { intensity: 0.15, pitch: 1.6 });
    }
    // follow the aim point smoothly
    const prev = _v.copy(tip.current);
    tip.current.lerp(want.current, 1 - Math.exp(-dt * 16));
    const vel = prev.sub(tip.current).divideScalar(Math.max(dt, 1e-3));
    g.position.copy(tip.current).add(_v.set(0, -TIP_Y, 0));
    // face the camera a little and lean into motion
    const yaw = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
    g.rotation.set(Math.max(-0.4, Math.min(0.4, vel.z * 0.04)), yaw, Math.max(-0.4, Math.min(0.4, -vel.x * 0.04)) + Math.sin(st.clock.elapsedTime * 1.3) * 0.03);
    if (wheel.current && s.pressed) wheel.current.rotation.x += dt * 30;

    if (s.lit) {
      runtime.fx.fire(tip.current, 1, 0.5);
      if (Math.random() < 0.35) runtime.fx.fire(tip.current, 1, 0.35);
      l.position.copy(tip.current).add(_v.set(0, 0.08, 0));
      l.intensity = 2.2 + Math.random() * 0.9;
      runtime.plushy?.heatAt(tip.current, dt);
    } else {
      l.intensity = 0;
    }
  });

  return (
    <>
      <group ref={group} visible={false}>
        <group scale={S}>
        <RoundedBox args={[0.1, BODY_H, 0.045]} radius={0.018} smoothness={3} material={bodyMat} castShadow />
        {/* metal hood */}
        <mesh position={[0, BODY_H / 2 + 0.022, 0]} material={metal} castShadow>
          <boxGeometry args={[0.1, 0.045, 0.047]} />
        </mesh>
        {/* hood holes */}
        {[-0.025, 0, 0.025].map((x) => (
          <mesh key={x} position={[x, BODY_H / 2 + 0.024, 0.0242]} material={dark}>
            <circleGeometry args={[0.006, 10]} />
          </mesh>
        ))}
        {/* flint wheel */}
        <group ref={wheel} position={[-0.03, BODY_H / 2 + 0.05, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} material={dark}>
            <cylinderGeometry args={[0.016, 0.016, 0.022, 14]} />
          </mesh>
        </group>
        {/* nozzle */}
        <mesh position={[0, BODY_H / 2 + 0.048, 0]} material={dark}>
          <cylinderGeometry args={[0.006, 0.008, 0.012, 10]} />
        </mesh>
        </group>
      </group>
      <pointLight ref={light} color="#FFB060" intensity={0} distance={3.2} decay={1.6} />
    </>
  );
}
