import { BufferAttribute, SphereGeometry, Vector3 } from 'three';
import { PLUSHY } from '../../config';

/**
 * The head is a sphere deformed into a soft, slightly tall octopus mantle
 * with a bulge at the back-top. `headSurface` is the single source of truth
 * for the shape so eyes and heat lookups sit exactly on it.
 */
export function headSurface(dir: Vector3, out: Vector3): Vector3 {
  const { radius, heightScale } = PLUSHY.head;
  const back = Math.max(0, -dir.z * 0.75 + dir.y * 0.55);
  const s = radius * (1 + 0.1 * back * back);
  out.copy(dir).multiplyScalar(s);
  out.y *= heightScale;
  if (out.y < -0.32) out.y = -0.32 + (out.y + 0.32) * 0.82;
  return out;
}

const _d = new Vector3();
const _t1 = new Vector3();
const _t2 = new Vector3();
const _p0 = new Vector3();
const _p1 = new Vector3();
const _p2 = new Vector3();

export function headNormal(dir: Vector3, out: Vector3): Vector3 {
  _d.copy(dir).normalize();
  const ref = Math.abs(_d.y) < 0.9 ? _t1.set(0, 1, 0) : _t1.set(1, 0, 0);
  _t2.crossVectors(_d, ref).normalize();
  _t1.crossVectors(_t2, _d).normalize();
  const e = 0.01;
  headSurface(_d, _p0);
  headSurface(_p1.copy(_d).addScaledVector(_t1, e).normalize(), _p1);
  headSurface(_p2.copy(_d).addScaledVector(_t2, e).normalize(), _p2);
  _p1.sub(_p0);
  _p2.sub(_p0);
  out.crossVectors(_p1, _p2).normalize();
  if (out.dot(_d) < 0) out.negate();
  return out;
}

export function buildHeadGeometry() {
  const g = new SphereGeometry(1, 72, 54);
  const pos = g.attributes.position as BufferAttribute;
  const nor = g.attributes.normal as BufferAttribute;
  const count = pos.count;
  const dir = new Vector3();
  const p = new Vector3();
  const n = new Vector3();
  const under = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    headSurface(dir, p);
    headNormal(dir, n);
    pos.setXYZ(i, p.x, p.y, p.z);
    nor.setXYZ(i, n.x, n.y, n.z);
    under[i] = Math.min(1, Math.max(0, (-dir.y - 0.82) / 0.15)) * 0.7;
  }
  g.setAttribute('aUnder', new BufferAttribute(under, 1));
  const aChar = new BufferAttribute(new Float32Array(count), 1);
  const aHeat = new BufferAttribute(new Float32Array(count), 1);
  aChar.setUsage(35048); // DynamicDrawUsage
  aHeat.setUsage(35048);
  g.setAttribute('aChar', aChar);
  g.setAttribute('aHeat', aHeat);
  g.computeBoundingSphere();
  return g;
}
