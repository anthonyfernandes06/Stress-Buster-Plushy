import { useEffect, useState, type ReactNode } from 'react';
import { useStore, type Tool } from '../state/store';
import { BatIcon, FlameIcon, HandIcon } from './icons';

const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: 'hand', label: 'Hand', key: '1', icon: <HandIcon /> },
  { id: 'bat', label: 'Bat', key: '2', icon: <BatIcon /> },
  { id: 'lighter', label: 'Lighter', key: '3', icon: <FlameIcon /> },
];

export function ToolDock() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const [pop, setPop] = useState<Tool | null>(null);

  // pop the newly active button, whether picked by click or keyboard
  useEffect(() => {
    setPop(tool);
    const t = window.setTimeout(() => setPop(null), 320);
    return () => window.clearTimeout(t);
  }, [tool]);

  return (
    <nav className="dock glass" aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`dock-btn${tool === t.id ? ' is-active' : ''}${pop === t.id ? ' is-pop' : ''}`}
          aria-label={`${t.label} (${t.key})`}
          aria-pressed={tool === t.id}
          onClick={() => setTool(t.id)}
        >
          {t.icon}
          <span className="tooltip glass" role="presentation">
            {t.label}
            <kbd>{t.key}</kbd>
          </span>
        </button>
      ))}
    </nav>
  );
}
