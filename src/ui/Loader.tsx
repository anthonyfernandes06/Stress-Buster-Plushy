import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { OctopusGlyph } from './icons';

/** Pulsing octopus on cream while Rapier's WASM and the scene initialise. */
export function Loader() {
  const ready = useStore((s) => s.ready);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => setGone(true), 600);
    return () => window.clearTimeout(t);
  }, [ready]);
  if (gone) return null;
  return (
    <div className={`loader${ready ? ' is-done' : ''}`} aria-hidden={ready} role="progressbar" aria-label="Loading">
      <div className="loader-glyph">
        <OctopusGlyph size={56} />
      </div>
    </div>
  );
}
