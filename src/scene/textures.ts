import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/** Procedural canvas textures. Each generator is memoised so it runs once. */

const cache = new Map<string, Texture>();

function memo<T extends Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

/** Small deterministic PRNG so textures look identical every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function floorTexture() {
  return memo('floor', () => {
    const size = 1024;
    const [c, g] = canvas(size);
    const r = rng(7);
    const planks = 28;
    const pw = size / planks;
    g.fillStyle = '#D6B48A';
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < planks; i++) {
      let x = -r() * 300;
      while (x < size) {
        const len = 160 + r() * 260;
        const tone = r();
        const l = 72 + tone * 7;
        g.fillStyle = `hsl(${31 + r() * 4}, ${42 + r() * 10}%, ${l}%)`;
        g.fillRect(x, i * pw, len, pw);
        // grain
        g.globalAlpha = 0.09;
        for (let k = 0; k < 7; k++) {
          g.strokeStyle = r() > 0.5 ? '#9C7246' : '#F4DDBC';
          g.lineWidth = 0.6 + r() * 1.2;
          g.beginPath();
          const y = i * pw + 3 + r() * (pw - 6);
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.6, y + (r() - 0.5) * 6, x + len, y + (r() - 0.5) * 3);
          g.stroke();
        }
        g.globalAlpha = 1;
        // end seam
        g.fillStyle = 'rgba(110, 78, 46, 0.35)';
        g.fillRect(x + len - 1.5, i * pw, 1.5, pw);
        x += len;
      }
      g.fillStyle = 'rgba(105, 72, 40, 0.38)';
      g.fillRect(0, i * pw, size, 1.6);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    t.minFilter = LinearMipmapLinearFilter;
    return t;
  });
}

export function rugTexture() {
  return memo('rug', () => {
    const size = 512;
    const [c, g] = canvas(size);
    const cx = size / 2;
    g.fillStyle = '#EEE3D0';
    g.fillRect(0, 0, size, size);
    const rings = [
      [1.0, '#E9DCC6'],
      [0.93, '#EFE5D3'],
      [0.88, '#DCC8A8'],
      [0.85, '#EFE5D3'],
      [0.62, '#E8DAC2'],
      [0.58, '#D9C29E'],
      [0.555, '#EDE2CF'],
      [0.3, '#E6D7BD'],
      [0.27, '#D8C19C'],
      [0.25, '#EEE4D2'],
    ] as const;
    for (const [rr, col] of rings) {
      g.fillStyle = col;
      g.beginPath();
      g.arc(cx, cx, rr * cx, 0, Math.PI * 2);
      g.fill();
    }
    // woven speckle
    const r = rng(3);
    g.globalAlpha = 0.06;
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() > 0.5 ? '#7E6448' : '#FFFFFF';
      g.fillRect(r() * size, r() * size, 1.5, 1.5);
    }
    g.globalAlpha = 1;
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** Tiling fabric bump as a normal map (soft knit noise). */
export function fabricNormal() {
  return memo('fabricNormal', () => {
    const size = 256;
    const [c, g] = canvas(size);
    const r = rng(11);
    // height field: blurred noise + fine knit lines
    const h = new Float32Array(size * size);
    for (let i = 0; i < h.length; i++) h[i] = r();
    const blur = (src: Float32Array) => {
      const out = new Float32Array(src.length);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          let s = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) s += src[((y + dy + size) % size) * size + ((x + dx + size) % size)];
          out[y * size + x] = s / 9;
        }
      return out;
    };
    let hb = blur(blur(h));
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) hb[y * size + x] += 0.12 * Math.sin((x / size) * Math.PI * 64 + Math.sin((y / size) * Math.PI * 8));
    hb = blur(hb);
    const img = g.createImageData(size, size);
    const k = 6;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const hx = hb[y * size + ((x + 1) % size)] - hb[y * size + ((x - 1 + size) % size)];
        const hy = hb[((y + 1) % size) * size + x] - hb[((y - 1 + size) % size) * size + x];
        let nx = -hx * k,
          ny = -hy * k,
          nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l;
        ny /= l;
        nz /= l;
        const i = (y * size + x) * 4;
        img.data[i] = (nx * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    return t;
  });
}

export function skyTexture() {
  return memo('sky', () => {
    const [c, g] = canvas(64, 256);
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#BFDDF2');
    grad.addColorStop(0.55, '#DCEBF4');
    grad.addColorStop(0.85, '#FBE9D2');
    grad.addColorStop(1, '#FFE0B8');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 256);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  });
}

/** Soft round sprite used by every particle system. */
export function softDot() {
  return memo('softDot', () => {
    const size = 64;
    const [c, g] = canvas(size);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    return t;
  });
}

/** Cotton tuft: a few overlapping soft blobs. */
export function fluffSprite() {
  return memo('fluff', () => {
    const size = 64;
    const [c, g] = canvas(size);
    const r = rng(5);
    for (let i = 0; i < 6; i++) {
      const x = 22 + r() * 20;
      const y = 22 + r() * 20;
      const rad = 10 + r() * 10;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    return new CanvasTexture(c);
  });
}

export function ringSprite() {
  return memo('ring', () => {
    const size = 128;
    const [c, g] = canvas(size);
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 9;
    g.shadowColor = 'rgba(255,255,255,0.9)';
    g.shadowBlur = 10;
    g.beginPath();
    g.arc(64, 64, 50, 0, Math.PI * 2);
    g.stroke();
    return new CanvasTexture(c);
  });
}

/** Comic "pow" burst used for punches and bat hits. */
export function powSprite() {
  return memo('pow', () => {
    const size = 128;
    const [c, g] = canvas(size);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.shadowColor = 'rgba(255,255,255,0.9)';
    g.shadowBlur = 8;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,1)';
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 2) * 0.12;
      const r0 = 26 + (i % 2) * 8;
      const r1 = 54 - (i % 2) * 8;
      g.lineWidth = i % 2 ? 5 : 8;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0);
      g.lineTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1);
      g.stroke();
    }
    return new CanvasTexture(c);
  });
}

/** Cartoon teardrop flame: yellow core, orange body, soft red rim. */
export function flameSprite() {
  return memo('flame', () => {
    const size = 64;
    const [c, g] = canvas(size);
    g.filter = 'blur(1.5px)';
    const grad = g.createRadialGradient(32, 46, 1, 32, 40, 28);
    grad.addColorStop(0, 'rgba(255, 251, 220, 1)');
    grad.addColorStop(0.3, 'rgba(255, 216, 84, 1)');
    grad.addColorStop(0.66, 'rgba(255, 126, 26, 0.95)');
    grad.addColorStop(1, 'rgba(225, 55, 10, 0.2)');
    g.fillStyle = grad;
    // tall teardrop with a slight lick to one side
    g.beginPath();
    g.moveTo(34, 1);
    g.bezierCurveTo(36, 16, 47, 28, 46, 46);
    g.arc(32, 46, 14, 0, Math.PI, false);
    g.bezierCurveTo(17, 30, 28, 20, 34, 1);
    g.fill();
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  });
}
