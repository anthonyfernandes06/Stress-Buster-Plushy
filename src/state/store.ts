import { create } from 'zustand';
import { METER } from '../config';

export type Tool = 'hand' | 'bat' | 'lighter';
export type PlushyState = 'idle' | 'held' | 'hit' | 'dizzy' | 'burning';
export type HitKind = 'impact' | 'punch' | 'bat' | 'burn';

interface StressStore {
  started: boolean;
  ready: boolean;
  tool: Tool;
  muted: boolean;
  hits: number;
  stressMeter: number; // 0..1
  celebrating: boolean;
  plushyState: PlushyState;
  hintsShown: Record<string, boolean>;
  resetToken: number;
  start(): void;
  setReady(): void;
  setTool(t: Tool): void;
  toggleMute(): void;
  registerHit(strength: number, kind: HitKind): void;
  setPlushyState(s: PlushyState): void;
  markHint(id: string): void;
  reset(): void;
}

const meterGain: Record<HitKind, number> = {
  impact: METER.impact,
  punch: METER.punch,
  bat: METER.bat,
  burn: METER.burn,
};

export const useStore = create<StressStore>((set, get) => ({
  started: false,
  ready: false,
  tool: 'hand',
  muted: false,
  hits: 0,
  stressMeter: 0,
  celebrating: false,
  plushyState: 'idle',
  hintsShown: {},
  resetToken: 0,
  start: () => set({ started: true }),
  setReady: () => set({ ready: true }),
  setTool: (tool) => {
    if (get().tool !== tool) set({ tool });
  },
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  registerHit: (strength, kind) => {
    const s = get();
    if (!s.started) return;
    // strength is 0..1 (light..huge); heavier hits fill faster
    const gain = meterGain[kind] * (0.5 + strength * 1.1) + (kind === 'impact' && strength > 0.7 ? METER.heavy : 0);
    const next = s.celebrating ? s.stressMeter : Math.min(1, s.stressMeter + gain);
    set({ hits: s.hits + 1, stressMeter: next });
    if (next >= 1 && !s.celebrating) {
      set({ celebrating: true });
      window.setTimeout(() => set({ celebrating: false, stressMeter: 0 }), METER.celebrateSeconds * 1000);
    }
  },
  setPlushyState: (plushyState) => {
    if (get().plushyState !== plushyState) set({ plushyState });
  },
  markHint: (id) => set((s) => ({ hintsShown: { ...s.hintsShown, [id]: true } })),
  reset: () => set((s) => ({ resetToken: s.resetToken + 1 })),
}));
