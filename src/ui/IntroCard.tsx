import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { sound } from '../audio/SoundManager';

export function IntroCard() {
  const started = useStore((s) => s.started);
  const ready = useStore((s) => s.ready);
  const start = useStore((s) => s.start);
  const [gone, setGone] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (ready && !started) btn.current?.focus({ preventScroll: true });
  }, [ready, started]);

  useEffect(() => {
    if (!started) return;
    const t = window.setTimeout(() => setGone(true), 420);
    return () => window.clearTimeout(t);
  }, [started]);

  if (gone) return null;
  return (
    <div className={`intro${started ? ' is-leaving' : ''}${ready ? ' is-ready' : ''}`} role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="intro-card glass">
        <h1 id="intro-title">Rough day?</h1>
        <p>Meet the octopus. Grab it, throw it, bat it, light it up. It can take it.</p>
        <button
          ref={btn}
          type="button"
          className="primary-btn"
          onClick={() => {
            sound.unlock();
            start();
          }}
        >
          Let it out
        </button>
        <small>Best with sound on.</small>
      </div>
    </div>
  );
}
