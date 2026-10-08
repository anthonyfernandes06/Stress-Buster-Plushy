import { BufferAttribute, BufferGeometry, CatmullRomCurve3, DynamicDrawUsage, Vector3 } from 'three';
import { PLUSHY } from '../../config';
import { tentacleRadius } from './layout';

const SEGS = PLUSHY.tentacle.segments;
const RINGS = 48; // rings along the curve
const CAP = 5; // extra rings closing the rounded tip
const RADIAL = 14;
const VERTS_PER_RING = RADIAL + 1;
const TOTAL_RINGS = RINGS + CAP;

export interface TentacleFrameInput {
  /** innerRoot + 9 joint points, world space (10 points). */
  points: Vector3[];
  /** Underside direction of each of the 8 segments, world space. */
  downs: Vector3[];
  char: Float32Array; // per segment
  heat: Float32Array; // per segment
  offset: number; // index into char/heat arrays
}

/**
 * Tapered, two-tone tube rebuilt every frame from the physics chain.
 * Buffers are allocated once and updated in place. The tube frame is
 * anchored to each segment's "down" vector so the cream underside and the
 * fabric texture rotate with the physics instead of swimming.
 */
export class TentacleTube {
  geometry = new BufferGeometry();
  private curve: CatmullRomCurve3;
  private pts: Vector3[];
  private centers: Vector3[] = [];
  private tangents: Vector3[] = [];
  private normalsN: Vector3[] = [];
  private radii = new Float32Array(TOTAL_RINGS);
  private ringV = new Float32Array(RINGS); // 0..1 along the visible tentacle
  private pos: BufferAttribute;
  private nor: BufferAttribute;
  private aChar: BufferAttribute;
  private aHeat: BufferAttribute;
  private cosA = new Float32Array(VERTS_PER_RING);
  private sinA = new Float32Array(VERTS_PER_RING);

  constructor() {
    this.pts = Array.from({ length: SEGS + 2 }, () => new Vector3());
    this.curve = new CatmullRomCurve3(this.pts, false, 'centripetal');
    for (let i = 0; i < TOTAL_RINGS; i++) {
      this.centers.push(new Vector3());
      this.tangents.push(new Vector3(0, 0, 1));
      this.normalsN.push(new Vector3(0, -1, 0));
    }
    const nv = TOTAL_RINGS * VERTS_PER_RING;
    this.pos = new BufferAttribute(new Float32Array(nv * 3), 3).setUsage(DynamicDrawUsage);
    this.nor = new BufferAttribute(new Float32Array(nv * 3), 3).setUsage(DynamicDrawUsage);
    this.aChar = new BufferAttribute(new Float32Array(nv), 1).setUsage(DynamicDrawUsage);
    this.aHeat = new BufferAttribute(new Float32Array(nv), 1).setUsage(DynamicDrawUsage);
    const uv = new Float32Array(nv * 2);
    const under = new Float32Array(nv);
    for (let j = 0; j < VERTS_PER_RING; j++) {
      const a = (j / RADIAL) * Math.PI * 2;
      this.cosA[j] = Math.cos(a);
      this.sinA[j] = Math.sin(a);
    }
    // the first ~1/9 of the curve lies inside the head
    const inner = 1 / (SEGS + 1);
    for (let i = 0; i < RINGS; i++) {
      const u = i / (RINGS - 1);
      this.ringV[i] = Math.max(0, (u - inner) / (1 - inner));
    }
    for (let i = 0; i < TOTAL_RINGS; i++) {
      const v = i < RINGS ? this.ringV[i] : 1;
      this.radii[i] = i < RINGS ? (this.ringV[i] <= 0 ? PLUSHY.tentacle.rootRadius : tentacleRadius(v)) : 0;
      for (let j = 0; j < VERTS_PER_RING; j++) {
        const k = i * VERTS_PER_RING + j;
        uv[k * 2] = (i < RINGS ? v : 1) * 7;
        uv[k * 2 + 1] = (j / RADIAL) * 2;
        const c = this.cosA[j];
        under[k] = Math.min(1, Math.max(0, (c - 0.1) / 0.55)) * 0.95;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < TOTAL_RINGS - 1; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * VERTS_PER_RING + j;
        const b = (i + 1) * VERTS_PER_RING + j;
        const c = b + 1;
        const d = a + 1;
        idx.push(a, d, b, b, d, c);
      }
    }
    this.geometry.setIndex(idx);
    this.geometry.setAttribute('position', this.pos);
    this.geometry.setAttribute('normal', this.nor);
    this.geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    this.geometry.setAttribute('aUnder', new BufferAttribute(under, 1));
    this.geometry.setAttribute('aChar', this.aChar);
    this.geometry.setAttribute('aHeat', this.aHeat);
  }

  update(input: TentacleFrameInput) {
    for (let i = 0; i < this.pts.length; i++) this.pts[i].copy(input.points[i]);
    // ring centres
    for (let i = 0; i < RINGS; i++) this.curve.getPoint(i / (RINGS - 1), this.centers[i]);
    // tangents by central differences
    for (let i = 0; i < RINGS; i++) {
      const a = this.centers[Math.max(0, i - 1)];
      const b = this.centers[Math.min(RINGS - 1, i + 1)];
      const t = this.tangents[i].subVectors(b, a);
      if (t.lengthSq() < 1e-10) t.copy(this.tangents[Math.max(0, i - 1)]);
      t.normalize();
    }
    // frames anchored to the (interpolated) segment down vectors
    const tmp = _tmp;
    for (let i = 0; i < RINGS; i++) {
      const v = this.ringV[i];
      const s = v * SEGS - 0.5;
      const i0 = Math.min(SEGS - 1, Math.max(0, Math.floor(s)));
      const i1 = Math.min(SEGS - 1, i0 + 1);
      const w = Math.min(1, Math.max(0, s - i0));
      tmp.copy(input.downs[i0]).lerp(input.downs[i1], w);
      const t = this.tangents[i];
      tmp.addScaledVector(t, -tmp.dot(t));
      if (tmp.lengthSq() < 1e-6) tmp.copy(this.normalsN[Math.max(0, i - 1)]);
      this.normalsN[i].copy(tmp.normalize());
    }
    // rounded tip cap
    const tipC = this.centers[RINGS - 1];
    const tipT = this.tangents[RINGS - 1];
    const tipR = this.radii[RINGS - 1];
    for (let c = 1; c <= CAP; c++) {
      const phi = (c / CAP) * (Math.PI / 2);
      const i = RINGS - 1 + c;
      this.centers[i].copy(tipC).addScaledVector(tipT, Math.sin(phi) * tipR);
      this.tangents[i].copy(tipT);
      this.normalsN[i].copy(this.normalsN[RINGS - 1]);
      this.radii[i] = Math.cos(phi) * tipR;
    }

    const P = this.pos.array as Float32Array;
    const N = this.nor.array as Float32Array;
    const CH = this.aChar.array as Float32Array;
    const HT = this.aHeat.array as Float32Array;
    const b = _b;
    const radial = _r;
    for (let i = 0; i < TOTAL_RINGS; i++) {
      const c = this.centers[i];
      const t = this.tangents[i];
      const n = this.normalsN[i];
      b.crossVectors(t, n);
      const r = this.radii[i];
      const capPhi = i >= RINGS ? ((i - RINGS + 1) / CAP) * (Math.PI / 2) : 0;
      const cs = Math.cos(capPhi);
      const sn = Math.sin(capPhi);
      // per-ring damage values
      const v = i < RINGS ? this.ringV[i] : 1;
      const s = v * SEGS - 0.5;
      const i0 = Math.min(SEGS - 1, Math.max(0, Math.floor(s)));
      const i1 = Math.min(SEGS - 1, i0 + 1);
      const w = Math.min(1, Math.max(0, s - i0));
      const ch = input.char[input.offset + i0] * (1 - w) + input.char[input.offset + i1] * w;
      const ht = input.heat[input.offset + i0] * (1 - w) + input.heat[input.offset + i1] * w;
      for (let j = 0; j < VERTS_PER_RING; j++) {
        radial.set(0, 0, 0).addScaledVector(n, this.cosA[j]).addScaledVector(b, this.sinA[j]);
        const k = i * VERTS_PER_RING + j;
        P[k * 3] = c.x + radial.x * r;
        P[k * 3 + 1] = c.y + radial.y * r;
        P[k * 3 + 2] = c.z + radial.z * r;
        N[k * 3] = radial.x * cs + t.x * sn;
        N[k * 3 + 1] = radial.y * cs + t.y * sn;
        N[k * 3 + 2] = radial.z * cs + t.z * sn;
        CH[k] = ch;
        HT[k] = ht;
      }
    }
    this.pos.needsUpdate = true;
    this.nor.needsUpdate = true;
    this.aChar.needsUpdate = true;
    this.aHeat.needsUpdate = true;
  }
}

const _tmp = new Vector3();
const _b = new Vector3();
const _r = new Vector3();
