/**
 * Procedural Web Audio sound effects.
 *
 * Every sound is synthesised from oscillators and filtered noise so the site
 * ships with zero audio files. To swap in recordings, drop files in
 * /public/sfx/ and list them in SAMPLE_FILES below: a sample, when present,
 * is played instead of the synthesised version with the same options.
 */

export type SoundName =
  | 'squish'
  | 'thud'
  | 'squeak'
  | 'thwack'
  | 'whoosh'
  | 'boing'
  | 'clatter'
  | 'clank'
  | 'flint'
  | 'ignite'
  | 'puff'
  | 'tick'
  | 'toggle';

export interface PlayOptions {
  /** 0..1 loudness / force of the event. */
  intensity?: number;
  /** Playback pitch multiplier (1 = natural). */
  pitch?: number;
  /** Muffled variant (e.g. landing on the rug). */
  muffled?: boolean;
}

/** Optional recorded replacements, relative to the site root, e.g. { thud: 'sfx/thud.mp3' }. */
const SAMPLE_FILES: Partial<Record<SoundName | 'crackle', string>> = {};

const MAX_VOICES: Record<SoundName, number> = {
  squish: 4,
  thud: 4,
  squeak: 3,
  thwack: 2,
  whoosh: 2,
  boing: 2,
  clatter: 3,
  clank: 2,
  flint: 2,
  ignite: 1,
  puff: 2,
  tick: 2,
  toggle: 2,
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Map<SoundName, number>();
  private samples = new Map<string, AudioBuffer>();
  private muted = false;
  private crackle: { gain: GainNode; src: AudioBufferSourceNode; timer: number | null } | null = null;
  private lastPlayed = new Map<SoundName, number>();

  get unlocked() {
    return !!this.ctx;
  }

  /** Must be called from a user gesture (the intro button). */
  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.7;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    void ctx.resume();
    void this.loadSamples();
  }

  private async loadSamples() {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      Object.entries(SAMPLE_FILES).map(async ([name, url]) => {
        try {
          const res = await fetch(new URL(url!, new URL(import.meta.env.BASE_URL, window.location.href)));
          if (!res.ok) return;
          this.samples.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* fall back to synthesis */
        }
      }),
    );
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.03);
    }
  }

  play(name: SoundName, opts: PlayOptions = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const used = this.voices.get(name) ?? 0;
    if (used >= MAX_VOICES[name]) return;
    // avoid machine-gunning the exact same sound within a few ms
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < 0.025) return;
    this.lastPlayed.set(name, now);

    const intensity = Math.max(0, Math.min(1, opts.intensity ?? 0.6));
    const pitch = opts.pitch ?? 1;
    const out = ctx.createGain();
    out.connect(this.master);
    let duration: number;

    const sample = this.samples.get(name);
    if (sample) {
      const src = ctx.createBufferSource();
      src.buffer = sample;
      src.playbackRate.value = pitch;
      out.gain.value = 0.25 + intensity * 0.75;
      src.connect(out);
      src.start();
      duration = sample.duration / pitch;
    } else {
      duration = this.synth(name, out, now, intensity, pitch, !!opts.muffled);
    }

    this.voices.set(name, used + 1);
    window.setTimeout(() => {
      this.voices.set(name, Math.max(0, (this.voices.get(name) ?? 1) - 1));
      out.disconnect();
    }, (duration + 0.1) * 1000);
  }

  // ---------------------------------------------------------------- loops

  startCrackle() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || this.crackle) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const recorded = this.samples.get('crackle');
    if (recorded) {
      const src = ctx.createBufferSource();
      src.buffer = recorded;
      src.loop = true;
      src.connect(gain);
      src.start();
      gain.gain.setTargetAtTime(0.9, ctx.currentTime, 0.15);
      this.crackle = { gain, src, timer: null };
      return;
    }
    // a soft roaring bed
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 700;
    const bed = ctx.createGain();
    bed.gain.value = 0.12;
    src.connect(bp).connect(bed).connect(gain);
    src.start();
    gain.gain.setTargetAtTime(0.9, ctx.currentTime, 0.15);
    // random pops on top
    const timer = window.setInterval(() => {
      if (!this.ctx || !this.crackle) return;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.pop(gain, this.ctx.currentTime + Math.random() * 0.09);
    }, 90);
    this.crackle = { gain, src, timer };
  }

  stopCrackle() {
    const ctx = this.ctx;
    const c = this.crackle;
    if (!ctx || !c) return;
    this.crackle = null;
    if (c.timer !== null) window.clearInterval(c.timer);
    c.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    window.setTimeout(() => {
      c.src.stop();
      c.gain.disconnect();
    }, 1200);
  }

  private pop(dest: AudioNode, t: number) {
    const ctx = this.ctx!;
    const src = this.noiseSrc(t, 0.03);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = rand(1800, 5200);
    hp.Q.value = 2.5;
    const g = ctx.createGain();
    env(g.gain, t, 0.001, 0.025, rand(0.15, 0.45));
    src.connect(hp).connect(g).connect(dest);
  }

  // ---------------------------------------------------------------- synthesis

  private noiseSrc(t: number, dur: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, Math.random() * 1.5, dur + 0.05);
    return src;
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.8) {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private gain(v = 1) {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    return g;
  }

  /** Returns the sound duration in seconds. */
  private synth(name: SoundName, out: GainNode, t: number, I: number, p: number, muffled: boolean): number {
    switch (name) {
      case 'squish': {
        const d = 0.12;
        const n = this.noiseSrc(t, d);
        const f = this.filter('bandpass', 700 * p * rand(0.85, 1.2), 1.2);
        f.frequency.setValueAtTime(1100 * p, t);
        f.frequency.exponentialRampToValueAtTime(380 * p, t + d);
        const g = this.gain(0);
        env(g.gain, t, 0.008, d, 0.25 + I * 0.4);
        n.connect(f).connect(g).connect(out);
        return d;
      }
      case 'thud': {
        const d = 0.22 + I * 0.15;
        const cutoff = muffled ? 260 + I * 300 : 500 + I * 1700;
        const o = this.osc('sine', 120 * p, t, d);
        o.frequency.exponentialRampToValueAtTime(42 * p, t + d);
        const og = this.gain(0);
        env(og.gain, t, 0.004, d, (muffled ? 0.55 : 0.75) * (0.35 + I * 0.65));
        o.connect(og).connect(out);
        const n = this.noiseSrc(t, 0.12);
        const lp = this.filter('lowpass', cutoff, 0.7);
        const ng = this.gain(0);
        env(ng.gain, t, 0.002, 0.1, (muffled ? 0.15 : 0.4) * (0.3 + I * 0.7));
        n.connect(lp).connect(ng).connect(out);
        return d;
      }
      case 'squeak': {
        const d = rand(0.14, 0.24);
        const base = 780 * p * rand(0.85, 1.25);
        const o = this.osc('triangle', base, t, d);
        o.frequency.linearRampToValueAtTime(base * rand(1.35, 1.7), t + d * 0.45);
        o.frequency.linearRampToValueAtTime(base * rand(0.9, 1.15), t + d);
        const vib = this.osc('sine', rand(18, 28), t, d);
        const vg = this.gain(base * 0.03);
        vib.connect(vg).connect(o.frequency);
        const bp = this.filter('bandpass', base * 1.4, 2);
        const g = this.gain(0);
        env(g.gain, t, 0.015, d, 0.12 + I * 0.16);
        o.connect(bp).connect(g).connect(out);
        return d;
      }
      case 'thwack': {
        const d = 0.18;
        const n = this.noiseSrc(t, 0.06);
        const bp = this.filter('bandpass', 1300 * p, 1.4);
        const ng = this.gain(0);
        env(ng.gain, t, 0.001, 0.06, 0.6 + I * 0.4);
        n.connect(bp).connect(ng).connect(out);
        const o = this.osc('triangle', 330 * p, t, d);
        o.frequency.exponentialRampToValueAtTime(170 * p, t + d);
        const og = this.gain(0);
        env(og.gain, t, 0.001, d, 0.35 + I * 0.3);
        o.connect(og).connect(out);
        const body = this.osc('sine', 95, t, 0.16);
        const bg = this.gain(0);
        env(bg.gain, t, 0.002, 0.16, 0.5 * I + 0.2);
        body.connect(bg).connect(out);
        return d;
      }
      case 'whoosh': {
        const d = 0.18 + (1 - I) * 0.2;
        const n = this.noiseSrc(t, d);
        const bp = this.filter('bandpass', 400, 1.6);
        bp.frequency.setValueAtTime(350 * p, t);
        bp.frequency.exponentialRampToValueAtTime((900 + I * 1600) * p, t + d * 0.55);
        bp.frequency.exponentialRampToValueAtTime(380 * p, t + d);
        const g = this.gain(0);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.18 + I * 0.32, t + d * 0.5);
        g.gain.linearRampToValueAtTime(0.0001, t + d);
        n.connect(bp).connect(g).connect(out);
        return d;
      }
      case 'boing': {
        const d = 0.55;
        const o = this.osc('sine', 150 * p, t, d);
        o.frequency.exponentialRampToValueAtTime(330 * p, t + 0.12);
        o.frequency.exponentialRampToValueAtTime(240 * p, t + d);
        const lfo = this.osc('sine', 14, t, d);
        const lg = this.gain(26);
        lg.gain.exponentialRampToValueAtTime(2, t + d);
        lfo.connect(lg).connect(o.frequency);
        const g = this.gain(0);
        env(g.gain, t, 0.01, d, 0.25 + I * 0.3);
        o.connect(g).connect(out);
        return d;
      }
      case 'clatter': {
        const hits = 3 + Math.floor(I * 4);
        let end = 0;
        for (let i = 0; i < hits; i++) {
          const tt = t + i * rand(0.03, 0.07) + (i ? rand(0, 0.03) : 0);
          const n = this.noiseSrc(tt, 0.05);
          const bp = this.filter('bandpass', rand(700, 1600) * p, 3);
          const g = this.gain(0);
          env(g.gain, tt, 0.001, 0.05, (0.18 + I * 0.3) * rand(0.6, 1));
          n.connect(bp).connect(g).connect(out);
          end = tt - t + 0.06;
        }
        return end;
      }
      case 'clank': {
        const d = 0.7;
        const partials = [520, 1310, 2150, 3080];
        partials.forEach((f, i) => {
          const o = this.osc('sine', f * p * rand(0.98, 1.02), t, d);
          const g = this.gain(0);
          env(g.gain, t, 0.001, d / (1 + i * 0.6), (0.14 + I * 0.16) / (1 + i * 0.7));
          o.connect(g).connect(out);
        });
        return d;
      }
      case 'flint': {
        const n = this.noiseSrc(t, 0.03);
        const hp = this.filter('highpass', 2500, 0.7);
        const g = this.gain(0);
        env(g.gain, t, 0.001, 0.025, 0.4);
        n.connect(hp).connect(g).connect(out);
        const o = this.osc('sine', 3400 * p, t, 0.05);
        const og = this.gain(0);
        env(og.gain, t, 0.001, 0.05, 0.05);
        o.connect(og).connect(out);
        return 0.06;
      }
      case 'ignite': {
        const d = 0.6;
        const n = this.noiseSrc(t, d);
        const lp = this.filter('lowpass', 300, 0.9);
        lp.frequency.setValueAtTime(250, t);
        lp.frequency.exponentialRampToValueAtTime(2200, t + 0.12);
        lp.frequency.exponentialRampToValueAtTime(600, t + d);
        const g = this.gain(0);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.35 + I * 0.25, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, t + d);
        n.connect(lp).connect(g).connect(out);
        return d;
      }
      case 'puff': {
        const d = 0.35;
        const n = this.noiseSrc(t, d);
        const lp = this.filter('lowpass', 900, 0.6);
        lp.frequency.exponentialRampToValueAtTime(250, t + d);
        const g = this.gain(0);
        env(g.gain, t, 0.02, d, 0.2 + I * 0.25);
        n.connect(lp).connect(g).connect(out);
        return d;
      }
      case 'tick': {
        const o = this.osc('sine', 1900 * p, t, 0.04);
        const g = this.gain(0);
        env(g.gain, t, 0.001, 0.035, 0.12);
        o.connect(g).connect(out);
        return 0.05;
      }
      case 'toggle': {
        [0, 0.045].forEach((dt, i) => {
          const o = this.osc('square', (i ? 1500 : 1100) * p, t + dt, 0.03);
          const lp = this.filter('lowpass', 3000);
          const g = this.gain(0);
          env(g.gain, t + dt, 0.001, 0.025, 0.06);
          o.connect(lp).connect(g).connect(out);
        });
        return 0.1;
      }
    }
  }
}

/** Fast attack, exponential decay envelope. */
function env(param: AudioParam, t: number, attack: number, decay: number, peak: number) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export const sound = new SoundManager();
