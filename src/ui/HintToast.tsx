import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';

const HINTS: Record<string, string> = {
  start: 'Drag the octopus. Flick to throw.',
  bat: 'Swipe to swing.',
  lighter: 'Hold to ignite.',
  gun: 'Click to shoot. Hold for rapid fire.',
};

/** Contextual one-time hints. Each shows for 3 s, once per session. */
export function HintToast() {
  const started = useStore((s) => s.started);
  const tool = useStore((s) => s.tool);
  const [text, setText] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const queue = useRef<string[]>([]);
  const busy = useRef(false);

  const pump = () => {
    if (busy.current) return;
    const next = queue.current.shift();
    if (!next) return;
    busy.current = true;
    setText(next);
    setVisible(true);
    window.setTimeout(() => setVisible(false), 3000);
    window.setTimeout(() => {
      busy.current = false;
      pump();
    }, 3400);
  };

  const show = (id: string) => {
    const s = useStore.getState();
    if (s.hintsShown[id]) return;
    s.markHint(id);
    queue.current.push(HINTS[id]);
    pump();
  };

  useEffect(() => {
    if (!started) return;
    const t = window.setTimeout(() => show('start'), 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  useEffect(() => {
    if (!started) return;
    if (tool === 'bat') show('bat');
    if (tool === 'lighter') show('lighter');
    if (tool === 'gun') show('gun');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, started]);

  return (
    <div className={`hint glass${visible ? ' is-visible' : ''}`} role="status" aria-live="polite">
      {text}
    </div>
  );
}
