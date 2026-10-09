import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { ROOM } from '../../config';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';

export const TV = { w: 1.94, h: 1.12, d: 0.07, y: 1.66 };

const CW = 768;
const CH = 432;
const FONT = '"Inter", -apple-system, "SF Pro Text", system-ui, sans-serif';
const CONFETTI_COLORS = ['#F2A516', '#FFD36B', '#9DB08F', '#E88C6A', '#8FB8D8', '#F6E7C8'];

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  c: string;
  w: number;
  h: number;
}

/** Draws the diegetic stress meter onto a canvas texture. */
class Screen {
  canvas = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  shown = 0; // eased meter value
  hits = 0;
  glitch = 0; // seconds remaining
  glitchWord = 'OUCH';
  celebrate = 0; // seconds since celebration start, -1 when idle
  confetti: Confetto[] = [];
  dirty = true;
  bump = 0;

  constructor() {
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.celebrate = -1;
  }

  startCelebration() {
    this.celebrate = 0;
    this.confetti = Array.from({ length: 70 }, () => ({
      x: Math.random() * CW,
      y: -20 - Math.random() * CH * 0.6,
      vx: (Math.random() - 0.5) * 60,
      vy: 80 + Math.random() * 120,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 8,
      c: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      w: 8 + Math.random() * 8,
      h: 4 + Math.random() * 5,
    }));
  }

  update(dt: number, meter: number, hits: number) {
    const target = meter;
    const prevShown = this.shown;
    this.shown += (target - this.shown) * (1 - Math.exp(-dt * 6));
    if (Math.abs(this.shown - target) < 0.001) this.shown = target;
    if (hits !== this.hits) {
      this.hits = hits;
      this.bump = 1;
      this.dirty = true;
    }
    if (Math.abs(prevShown - this.shown) > 0.0005) this.dirty = true;
    if (this.bump > 0) {
      this.bump = Math.max(0, this.bump - dt * 4);
      this.dirty = true;
    }
    if (this.glitch > 0) {
      this.glitch -= dt;
      this.dirty = true;
    }
    if (this.celebrate >= 0) {
      this.celebrate += dt;
      for (const c of this.confetti) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vy += 60 * dt;
        c.r += c.vr * dt;
      }
      this.dirty = true;
    }
    if (this.dirty) {
      this.draw();
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const g = this.ctx;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  draw() {
    const g = this.ctx;
    // background
    const bg = g.createRadialGradient(CW * 0.35, CH * 0.3, 40, CW * 0.5, CH * 0.5, CW * 0.75);
    bg.addColorStop(0, '#3A2C22');
    bg.addColorStop(1, '#16110D');
    g.fillStyle = bg;
    g.fillRect(0, 0, CW, CH);

    const celebrating = this.celebrate >= 0;

    if (!celebrating) {
      // label
      g.fillStyle = 'rgba(255, 238, 214, 0.86)';
      g.font = `600 52px ${FONT}`;
      g.textBaseline = 'alphabetic';
      g.fillText('Stress released', 52, 96);

      // percentage
      const pct = Math.round(this.shown * 100);
      g.textAlign = 'right';
      g.fillStyle = 'rgba(255, 238, 214, 0.6)';
      g.font = `600 46px ${FONT}`;
      g.fillText(`${pct}%`, CW - 52, 96);
      g.textAlign = 'left';

      // track
      const bx = 52;
      const by = 126;
      const bw = CW - 104;
      const bh = 96;
      this.roundRect(bx, by, bw, bh, bh / 2);
      g.fillStyle = 'rgba(255, 255, 255, 0.07)';
      g.fill();
      g.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      g.lineWidth = 2;
      g.stroke();

      // fill
      const fw = Math.max(bh, bw * this.shown);
      if (this.shown > 0.002) {
        g.save();
        g.shadowColor = 'rgba(242, 165, 22, 0.85)';
        g.shadowBlur = 30;
        const grad = g.createLinearGradient(bx, 0, bx + bw, 0);
        grad.addColorStop(0, '#F29A16');
        grad.addColorStop(1, '#FFD76E');
        this.roundRect(bx + 5, by + 5, fw - 10, bh - 10, (bh - 10) / 2);
        g.fillStyle = grad;
        g.fill();
        g.restore();
        // gloss
        this.roundRect(bx + 16, by + 14, Math.max(0, fw - 32), 18, 9);
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fill();
      }

      // hits counter
      const s = 1 + this.bump * 0.12;
      g.save();
      g.translate(52, 384);
      g.scale(s, s);
      g.fillStyle = '#FFF4E4';
      g.font = `600 136px ${FONT}`;
      g.fillText(String(this.hits), 0, 0);
      const numW = g.measureText(String(this.hits)).width;
      g.restore();
      g.fillStyle = 'rgba(255, 238, 214, 0.6)';
      g.font = `600 48px ${FONT}`;
      g.fillText(this.hits === 1 ? 'hit' : 'hits', 52 + numW * s + 18, 384);

      // little octopus mascot
      this.octopus(CW - 118, 350, 60);
    } else {
      const t = this.celebrate;
      const a = Math.min(1, t * 3);
      g.save();
      g.globalAlpha = a;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = 'rgba(242,165,22,0.8)';
      g.shadowBlur = 28;
      g.fillStyle = '#FFF2D6';
      const pop = 1 + Math.max(0, 0.25 - t) * 1.6;
      g.translate(CW / 2, CH / 2 - 10);
      g.scale(pop, pop);
      g.font = `600 84px ${FONT}`;
      g.fillText('Feeling lighter?', 0, 0);
      g.restore();
      for (const c of this.confetti) {
        g.save();
        g.translate(c.x, c.y);
        g.rotate(c.r);
        g.fillStyle = c.c;
        g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        g.restore();
      }
    }

    // glitch
    if (this.glitch > 0) {
      const k = Math.min(1, this.glitch / 0.45);
      const bands = 7;
      for (let i = 0; i < bands; i++) {
        const y = Math.random() * CH;
        const hgt = 6 + Math.random() * 40;
        const off = (Math.random() - 0.5) * 120 * k;
        g.drawImage(this.canvas, 0, y, CW, hgt, off, y, CW, hgt);
      }
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255, 40, 60, ${0.12 * k})`;
      g.fillRect(6 * k, 0, CW, CH);
      g.fillStyle = `rgba(40, 200, 255, ${0.12 * k})`;
      g.fillRect(-6 * k, 0, CW, CH);
      g.globalCompositeOperation = 'source-over';
      // static
      for (let i = 0; i < 260 * k; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`;
        g.fillRect(Math.random() * CW, Math.random() * CH, 2 + Math.random() * 6, 2);
      }
      g.save();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `600 ${90 + 20 * k}px ${FONT}`;
      g.fillStyle = `rgba(255, 245, 230, ${0.9 * k})`;
      g.shadowColor = 'rgba(255,120,80,0.9)';
      g.shadowBlur = 20;
      g.fillText(this.glitchWord, CW / 2 + (Math.random() - 0.5) * 10 * k, CH / 2);
      g.restore();
    }

    // scanlines
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < CH; y += 4) g.fillRect(0, y, CW, 1.5);
  }

  private octopus(x: number, y: number, r: number) {
    const g = this.ctx;
    g.save();
    g.translate(x, y);
    g.fillStyle = '#F2A516';
    g.shadowColor = 'rgba(242,165,22,0.6)';
    g.shadowBlur = 16;
    g.beginPath();
    g.ellipse(0, -r * 0.35, r * 0.62, r * 0.7, 0, 0, Math.PI * 2);
    g.fill();
    g.lineCap = 'round';
    g.strokeStyle = '#F2A516';
    g.lineWidth = r * 0.16;
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + (i / 4) * 1.8;
      g.beginPath();
      g.moveTo(Math.sin(a) * r * 0.4, r * 0.15);
      g.quadraticCurveTo(Math.sin(a) * r * 0.9, r * 0.5, Math.sin(a) * r * 0.75 + (a > 0 ? -1 : 1) * r * 0.2, r * 0.7);
      g.stroke();
    }
    g.shadowBlur = 0;
    g.fillStyle = '#1E1812';
    const blink = Math.sin(performance.now() / 260) > 0.97 ? 0.2 : 1;
    g.beginPath();
    g.ellipse(-r * 0.2, -r * 0.25, r * 0.07, r * 0.1 * blink, 0, 0, Math.PI * 2);
    g.ellipse(r * 0.2, -r * 0.25, r * 0.07, r * 0.1 * blink, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

/** Wall-mounted TV whose screen shows the stress meter. */
export function Tv() {
  const z = ROOM.back + 0.06;
  const screen = useMemo(() => new Screen(), []);
  const bezel = useMemo(() => new MeshStandardMaterial({ color: '#2B2724', roughness: 0.4, metalness: 0.1 }), []);

  useEffect(() => {
    const words = ['OUCH', 'OOF', 'HEY!', 'BONK'];
    runtime.props.tv = {
      glitch(strength) {
        screen.glitch = 0.3 + Math.min(0.4, strength * 0.05);
        screen.glitchWord = words[Math.floor(Math.random() * words.length)];
      },
    };
    let celebrating = useStore.getState().celebrating;
    const unsub = useStore.subscribe((s) => {
      if (s.celebrating && !celebrating) screen.startCelebration();
      if (!s.celebrating && celebrating) {
        screen.celebrate = -1;
        screen.dirty = true;
      }
      celebrating = s.celebrating;
    });
    return () => {
      unsub();
      delete runtime.props.tv;
    };
  }, [screen]);

  useFrame((_, dt) => {
    const s = useStore.getState();
    screen.update(Math.min(dt, 0.05), s.stressMeter, s.hits);
    // keep the mascot blinking now and then
    if (Math.random() < 0.02) screen.dirty = true;
  });

  return (
    <group position={[0, TV.y, z]}>
      <RoundedBox args={[TV.w, TV.h, TV.d]} radius={0.03} smoothness={3} material={bezel} castShadow receiveShadow />
      <mesh position={[0, 0, TV.d / 2 + 0.002]}>
        <planeGeometry args={[TV.w - 0.1, TV.h - 0.1]} />
        <meshBasicMaterial map={screen.texture} color={[1.35, 1.3, 1.25]} />
      </mesh>
      {/* tiny standby LED */}
      <mesh position={[TV.w / 2 - 0.1, -TV.h / 2 + 0.025, TV.d / 2 + 0.002]}>
        <circleGeometry args={[0.008, 12]} />
        <meshBasicMaterial color={[2.2, 1.2, 0.4]} />
      </mesh>
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'tv' }}>
        <CuboidCollider args={[TV.w / 2, TV.h / 2, 0.06]} restitution={0.3} friction={0.4} />
      </RigidBody>
    </group>
  );
}
