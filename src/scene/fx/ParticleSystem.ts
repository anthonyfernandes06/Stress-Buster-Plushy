import { FX_LAYER } from '../layers';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Texture,
  Vector3,
} from 'three';

export interface EmitOptions {
  position: Vector3;
  velocity: Vector3;
  life: number;
  size0: number;
  size1: number;
  color: [number, number, number];
  color1?: [number, number, number];
  alpha?: number;
  gravity?: number;
  drag?: number;
  spin?: number;
  /** Fixed sprite rotation (radians); random when omitted. */
  rotation?: number;
}

/**
 * A fixed-size pool of soft point sprites. All per-particle state lives in
 * typed arrays; nothing is allocated after construction.
 */
export class ParticleSystem {
  points: Points;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private a0: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private aPos: BufferAttribute;
  private aSize: BufferAttribute;
  private aAlpha: BufferAttribute;
  private aColor: BufferAttribute;
  private aRot: BufferAttribute;
  private cursor = 0;
  material: ShaderMaterial;
  alive = 0;

  constructor(count: number, map: Texture, additive: boolean, fadeIn = 0.08) {
    this.n = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.s0 = new Float32Array(count);
    this.s1 = new Float32Array(count);
    this.c0 = new Float32Array(count * 3);
    this.c1 = new Float32Array(count * 3);
    this.a0 = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.rot = new Float32Array(count);
    this.spin = new Float32Array(count);
    const g = new BufferGeometry();
    this.aPos = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
    this.aSize = new BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
    this.aAlpha = new BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
    this.aColor = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
    this.aRot = new BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aAlpha', this.aAlpha);
    g.setAttribute('aColor', this.aColor);
    g.setAttribute('aRot', this.aRot);
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      uniforms: { uMap: { value: map }, uViewportH: { value: 900 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aRot;
        uniform float uViewportH;
        varying float vAlpha; varying vec3 vColor; varying float vRot;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aAlpha <= 0.0 ? 0.0 : aSize * projectionMatrix[1][1] * uViewportH * 0.5 / max(0.1, -mv.z);
          vAlpha = aAlpha; vColor = aColor; vRot = aRot;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha; varying vec3 vColor; varying float vRot;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          uv = mat2(c, -s, s, c) * uv + 0.5;
          vec4 tex = texture2D(uMap, uv);
          float a = tex.a * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor * tex.rgb, a);
        }
      `,
    });
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.layers.set(FX_LAYER);
    this.fadeIn = fadeIn;
  }
  private fadeIn: number;

  emit(o: EmitOptions) {
    // find a dead slot, or recycle the oldest-ish one
    let i = -1;
    for (let k = 0; k < this.n; k++) {
      const c = (this.cursor + k) % this.n;
      if (this.life[c] <= 0) {
        i = c;
        break;
      }
    }
    if (i < 0) i = this.cursor;
    this.cursor = (i + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = o.position.x;
    this.pos[i3 + 1] = o.position.y;
    this.pos[i3 + 2] = o.position.z;
    this.vel[i3] = o.velocity.x;
    this.vel[i3 + 1] = o.velocity.y;
    this.vel[i3 + 2] = o.velocity.z;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.s0[i] = o.size0;
    this.s1[i] = o.size1;
    this.c0.set(o.color, i3);
    this.c1.set(o.color1 ?? o.color, i3);
    this.a0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.rot[i] = o.rotation ?? Math.random() * Math.PI * 2;
    this.spin[i] = o.rotation !== undefined ? 0 : (Math.random() - 0.5) * 2 * (o.spin ?? 1);
  }

  update(dt: number, viewportH: number) {
    this.material.uniforms.uViewportH.value = viewportH;
    const P = this.aPos.array as Float32Array;
    const S = this.aSize.array as Float32Array;
    const A = this.aAlpha.array as Float32Array;
    const C = this.aColor.array as Float32Array;
    const R = this.aRot.array as Float32Array;
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        if (A[i] !== 0) {
          A[i] = 0;
          P[i3 + 1] = -100; // park dead particles out of sight
        }
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i]; // 0..1 age
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d + this.grav[i] * dt;
      this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02 && this.grav[i] < 0) {
        // settle on the floor
        this.pos[i3 + 1] = 0.02;
        this.vel[i3 + 1] *= -0.2;
        this.vel[i3] *= 0.6;
        this.vel[i3 + 2] *= 0.6;
        this.spin[i] *= 0.6;
      }
      this.rot[i] += this.spin[i] * dt;
      P[i3] = this.pos[i3];
      P[i3 + 1] = this.pos[i3 + 1];
      P[i3 + 2] = this.pos[i3 + 2];
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fin = Math.min(1, t / this.fadeIn);
      const fout = t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1;
      A[i] = this.life[i] <= 0 ? 0 : this.a0[i] * fin * fout;
      C[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      C[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      C[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      R[i] = this.rot[i];
    }
    this.alive = alive;
    this.aPos.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aRot.needsUpdate = true;
  }
}
