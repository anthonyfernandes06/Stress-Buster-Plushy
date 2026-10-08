import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import { Scene } from './scene/Scene';
import { runtime } from './state/runtime';
import { useStore } from './state/store';
import { sound } from './audio/SoundManager';
import { Wordmark } from './ui/Wordmark';
import { ToolDock } from './ui/ToolDock';
import { BottomBar } from './ui/BottomBar';
import { IntroCard } from './ui/IntroCard';
import { HintToast } from './ui/HintToast';
import { Loader } from './ui/Loader';

const mobile =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600);
runtime.isMobile = mobile;

if (import.meta.env.DEV) (window as unknown as { __sb: unknown }).__sb = { runtime, useStore, sound };

function useGlobalControls() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotion = () => {
      runtime.reducedMotion = mq.matches;
      document.documentElement.classList.toggle('reduced-motion', mq.matches);
    };
    applyMotion();
    mq.addEventListener('change', applyMotion);

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useStore.getState();
      if (!s.started) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case '1':
          s.setTool('hand');
          break;
        case '2':
          s.setTool('bat');
          break;
        case '3':
          s.setTool('lighter');
          break;
        case 'r':
          s.reset();
          break;
        case 'm':
          s.toggleMute();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);

    // keep the sound manager in sync with the store
    let prev = useStore.getState();
    const unsub = useStore.subscribe((s) => {
      if (s.muted !== prev.muted) {
        sound.setMuted(s.muted);
        sound.play('toggle');
      }
      if (s.tool !== prev.tool) sound.play('tick');
      prev = s;
    });
    return () => {
      mq.removeEventListener('change', applyMotion);
      window.removeEventListener('keydown', onKey);
      unsub();
    };
  }, []);
}

export default function App() {
  useGlobalControls();
  const started = useStore((s) => s.started);
  return (
    <div className={`app ${started ? 'is-started' : 'is-intro'}`}>
      <Canvas
        className="scene-canvas"
        shadows="percentage"
        dpr={[1, mobile ? 1.5 : 2]}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 35, near: 0.1, far: 80, position: [6, 6.5, 8] }}
        onCreated={(s) => {
          if (import.meta.env.DEV) (window as unknown as { __three: unknown }).__three = s;
        }}
      >
        <Scene />
      </Canvas>
      <div className="scene-dim" aria-hidden="true" />
      <Wordmark />
      <ToolDock />
      <BottomBar />
      <HintToast />
      <IntroCard />
      <Loader />
    </div>
  );
}
