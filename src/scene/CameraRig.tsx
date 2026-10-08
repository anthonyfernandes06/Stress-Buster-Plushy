import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA, ROOM } from '../config';
import { runtime } from '../state/runtime';
import { useCameraShake } from './fx/useCameraShake';
import { FX_LAYER } from './layers';

const H = ROOM.half;
const T = ROOM.wallThickness;
/** Points that must stay in frame: floor slab corners and wall tops. */
const FIT_POINTS = [
  [-H - T, 0, -H - T],
  [H, 0, -H - T],
  [-H - T, 0, H],
  [H, 0, H],
  [H, -ROOM.floorThickness, H],
  [-H - T, -ROOM.floorThickness, H],
  [H, -ROOM.floorThickness, -H - T],
  [-H - T, ROOM.wallHeight, -H - T],
  [H, ROOM.wallHeight, -H - T],
  [-H - T, ROOM.wallHeight, H],
].map(([x, y, z]) => new Vector3(x, y, z));

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Fits the room into the viewport (minus UI insets, in px) by sliding the
 * camera along its fixed 3/4 view direction and re-centering the target.
 */
function frameRoom(width: number, height: number, insets: Insets, fov: number, margin: number) {
  const cam = new PerspectiveCamera(fov, width / height, 0.1, 100);
  const dir = new Vector3(...CAMERA.position).sub(new Vector3(...CAMERA.target)).normalize();
  const target = new Vector3(...CAMERA.target);
  const bx0 = -1 + (2 * insets.left) / width;
  const bx1 = 1 - (2 * insets.right) / width;
  const by0 = -1 + (2 * insets.bottom) / height;
  const by1 = 1 - (2 * insets.top) / height;
  const bw = (bx1 - bx0) * margin;
  const bh = (by1 - by0) * margin;
  const p = new Vector3();

  const measure = (d: number) => {
    cam.position.copy(target).addScaledVector(dir, d);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const fp of FIT_POINTS) {
      p.copy(fp).project(cam);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, maxX, minY, maxY };
  };

  let d = 12;
  for (let iter = 0; iter < 3; iter++) {
    let lo = 3;
    let hi = 80;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const m = measure(mid);
      if (m.maxX - m.minX <= bw && m.maxY - m.minY <= bh) hi = mid;
      else lo = mid;
    }
    d = hi;
    // shift the target so the room's projected box centres in the free area
    const m = measure(d);
    const cx = (m.minX + m.maxX) / 2 - (bx0 + bx1) / 2;
    const cy = (m.minY + m.maxY) / 2 - (by0 + by1) / 2;
    const halfH = Math.tan((fov * Math.PI) / 360) * d;
    const halfW = halfH * cam.aspect;
    const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    target.addScaledVector(right, cx * halfW).addScaledVector(up, cy * halfH);
  }
  return { position: target.clone().addScaledVector(dir, d), target };
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const base = useRef({ position: new Vector3(...CAMERA.position), target: new Vector3(...CAMERA.target) });
  const parallax = useRef(new Vector3());
  const shake = useCameraShake();
  const tmp = useMemo(() => ({ right: new Vector3(), up: new Vector3() }), []);

  useEffect(() => {
    camera.layers.enable(FX_LAYER);
  }, [camera]);

  useEffect(() => {
    const portrait = size.width / size.height < 0.85;
    const fov = portrait ? CAMERA.fovPortrait : CAMERA.fov;
    const insets: Insets = portrait
      ? { top: 64, right: 12, bottom: 150, left: 12 }
      : { top: 64, right: 104, bottom: 92, left: 28 };
    const margin = portrait ? CAMERA.fitMarginPortrait : CAMERA.fitMargin;
    const f = frameRoom(size.width, size.height, insets, fov, margin);
    base.current = f;
    camera.fov = fov;
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    camera.position.copy(f.position);
    camera.lookAt(f.target);
  }, [camera, size.width, size.height]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    const { position, target } = base.current;
    // pointer parallax (eased, disabled for reduced motion)
    const p = runtime.pointer;
    const want = runtime.reducedMotion || !p.inside ? 0 : 1;
    const k = 1 - Math.exp(-d * CAMERA.parallaxEase);
    parallax.current.x += (p.ndc.x * want - parallax.current.x) * k;
    parallax.current.y += (p.ndc.y * want - parallax.current.y) * k;

    camera.position.copy(position);
    camera.lookAt(target);
    tmp.right.setFromMatrixColumn(camera.matrixWorld, 0);
    tmp.up.setFromMatrixColumn(camera.matrixWorld, 1);
    camera.position
      .addScaledVector(tmp.right, parallax.current.x * CAMERA.parallax)
      .addScaledVector(tmp.up, parallax.current.y * CAMERA.parallax * 0.6);
    camera.lookAt(target);

    shake.update(d);
    camera.position.addScaledVector(tmp.right, shake.offset.x).addScaledVector(tmp.up, shake.offset.y);
    camera.rotateZ(shake.roll);
  });

  return null;
}
