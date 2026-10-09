import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { Physics, useBeforePhysicsStep } from '@react-three/rapier';
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Vector3, type DirectionalLight } from 'three';
import { PHYSICS, ROOM } from '../config';
import { runtime } from '../state/runtime';
import { useStore } from '../state/store';
import { CameraRig } from './CameraRig';
import { Room } from './Room';
import { snapshotVelocities } from './physicsUtils';
import { MediaConsole } from './props/MediaConsole';
import { Tv } from './props/Tv';
import { Bookshelf } from './props/Bookshelf';
import { Pouf } from './props/Pouf';
import { Rug } from './props/Rug';
import { Lamp } from './props/Lamp';
import { Plant } from './props/Plant';
import { Window, SUN_DIR } from './props/Window';
import { WallArt } from './props/WallArt';
import { FairyLights } from './props/FairyLights';
import { Plushy } from './plushy/Plushy';
import { Tools } from './tools/Tools';
import { Fx } from './fx/Fx';

/** Scales every useFrame delta by runtime.timeScale (hit-stop). */
function TimeScaler() {
  const clock = useThree((s) => s.clock);
  useLayoutEffect(() => {
    const orig = clock.getDelta.bind(clock);
    clock.getDelta = () => {
      const d = orig();
      if (runtime.timeScale !== 1 && performance.now() >= runtime.hitStopUntil) runtime.timeScale = 1;
      return d * runtime.timeScale;
    };
    return () => {
      clock.getDelta = orig;
    };
  }, [clock]);
  return null;
}

/** Middle of the sun patch the window throws on the floor. */
const SUN_TARGET = new Vector3(-1.5, 0, 0);

function Lights() {
  const sun = useRef<DirectionalLight>(null);
  const mobile = runtime.isMobile;
  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    l.target.position.copy(SUN_TARGET);
    l.target.updateMatrixWorld();
  }, []);
  const sunPos = SUN_DIR.clone().multiplyScalar(16).add(SUN_TARGET);
  return (
    <>
      <hemisphereLight args={['#FFF4E6', '#C9A27E', 0.98]} />
      <ambientLight intensity={0.16} color="#FFE2C4" />
      {/* the low afternoon sun, through the window */}
      <directionalLight
        ref={sun}
        position={[sunPos.x, sunPos.y, sunPos.z]}
        color="#FFD9A8"
        intensity={6.5}
        castShadow
        shadow-mapSize={mobile ? [1024, 1024] : [2048, 2048]}
        shadow-radius={4}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={2}
        shadow-camera-far={32}
      />
      {/* soft room fill from the camera side, no shadows */}
      <directionalLight position={[2.5, 7, 9]} color="#FFEBD6" intensity={0.85} />
    </>
  );
}

function PhysicsHooks() {
  useBeforePhysicsStep(() => snapshotVelocities());
  const setReady = useStore((s) => s.setReady);
  useEffect(() => {
    // give the plushy a couple of frames to drop in before revealing
    const t = window.setTimeout(setReady, 250);
    return () => window.clearTimeout(t);
  }, [setReady]);
  return null;
}

/**
 * postprocessing's EffectComposer turns renderer.autoClear off, which would
 * make ContactShadows accumulate every past frame into its render target.
 * Re-enable clearing just for the contact-shadow pass (priority 0).
 */
function ContactShadowClearGuard() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    gl.autoClear = true;
  }, -1);
  useFrame(() => {
    gl.autoClear = false;
  }, 0.5);
  return null;
}

function PostFX() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={0.55} luminanceThreshold={1.05} luminanceSmoothing={0.25} radius={0.65} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={0.5} />
      <SMAA />
    </EffectComposer>
  );
}

export function Scene() {
  return (
    <>
      <color attach="background" args={['#EADFD1']} />
      <TimeScaler />
      <CameraRig />
      <Lights />
      <Environment resolution={64} frames={1} environmentIntensity={0.45}>
        <Lightformer form="rect" intensity={2.5} color="#FFE2BC" position={[-6, 3, 0]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#FFF6EA" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#FFEBD6" position={[6, 3, 6]} rotation-y={-Math.PI / 4} scale={[6, 4, 1]} />
      </Environment>

      <Suspense fallback={null}>
        <Physics gravity={[0, PHYSICS.gravity, 0]} timeStep={PHYSICS.timeStep} numSolverIterations={PHYSICS.solverIterations} interpolate>
          <PhysicsHooks />
          <Room />
          <Window />
          <Rug />
          <MediaConsole />
          <Tv />
          <Bookshelf />
          <Pouf />
          <Lamp />
          <Plant />
          <WallArt />
          <FairyLights />
          <Plushy />
          <Tools />
        </Physics>
      </Suspense>

      <Fx />
      <ContactShadowClearGuard />
      <ContactShadows
        position={[0, 0.012, (ROOM.back + 2.4) / 2]}
        scale={[ROOM.halfWidth * 2 + 0.2, 2.4 - ROOM.back]}
        resolution={1024}
        blur={2.4}
        opacity={0.42}
        far={2}
        color="#3B2A1C"
      />
      <PostFX />
    </>
  );
}
