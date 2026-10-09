import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Ray, Vector3 } from 'three';
import { CAMERA, PLAY, ROOM } from '../config';
import { runtime, type ViewSegment } from '../state/runtime';
import { useStore } from '../state/store';
import { useCameraShake } from './fx/useCameraShake';
import { FX_LAYER } from './layers';

/** Vertical FOV that keeps the horizontal FOV near CAMERA.hFov for this aspect. */
export function verticalFov(aspect: number) {
  const h = (CAMERA.hFov * Math.PI) / 360;
  const v = (2 * Math.atan(Math.tan(h) / aspect) * 180) / Math.PI;
  return Math.min(CAMERA.maxVFov, Math.max(CAMERA.minVFov, v));
}

/**
 * Works out which part of the floor is actually on screen and returns the
 * invisible walls that keep the octopus inside it: one along the bottom of
 * the screen (above the control bar) and, where the bottom corners don't
 * reach the side walls, two diagonals up to the walls.
 */
function computeViewBounds(width: number, height: number, fov: number) {
  const cam = new PerspectiveCamera(fov, width / height, 0.1, 100);
  cam.position.set(...CAMERA.position);
  cam.lookAt(new Vector3(...CAMERA.target));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const ray = new Ray();
  const floorAt = (nx: number, ny: number) => {
    ray.origin.setFromMatrixPosition(cam.matrixWorld);
    ray.direction.set(nx, ny, 0.5).unproject(cam).sub(ray.origin).normalize();
    if (ray.direction.y >= -1e-4) return null;
    return ray.at(-ray.origin.y / ray.direction.y, new Vector3());
  };
  const yb = -1 + (2 * CAMERA.bottomInsetPx) / height;
  const inset = CAMERA.boundsInset;
  const W = ROOM.halfWidth;
  const segments: ViewSegment[] = [];
  const bl = floorAt(-1, yb);
  const br = floorAt(1, yb);
  if (!bl || !br) return { segments, frontZ: 1.4 };

  // pull everything a little into the room so a body against the wall stays in view
  const front = (p: Vector3) => p.clone().setZ(p.z - inset);
  const corner = (bottom: Vector3, side: -1 | 1) => {
    // the screen's side edge is a straight line on the floor; follow it to the wall
    const up = floorAt(side, yb + 0.35);
    const b = front(bottom);
    if (Math.abs(b.x) >= W || !up) return { start: b.setX(Math.max(-W, Math.min(W, b.x))), wall: null as Vector3 | null };
    const dir = up.clone().sub(bottom);
    const t = (side * W - bottom.x) / dir.x;
    const wall = bottom.clone().addScaledVector(dir, t);
    // shift the diagonal inward along its normal
    const n = new Vector3(dir.z, 0, -dir.x).normalize();
    if (n.x * side < 0) n.negate();
    b.addScaledVector(n, -inset * 0.6);
    wall.addScaledVector(n, -inset * 0.6).setX(side * W);
    return { start: b, wall };
  };
  const L = corner(bl, -1);
  const R = corner(br, 1);
  segments.push({ a: [L.start.x, L.start.z], b: [R.start.x, R.start.z] });
  if (L.wall) segments.push({ a: [L.wall.x, L.wall.z], b: [L.start.x, L.start.z] });
  if (R.wall) segments.push({ a: [R.start.x, R.start.z], b: [R.wall.x, R.wall.z] });
  const frontZ = Math.min(L.start.z, R.start.z) - 0.15;
  return { segments, frontZ: Math.max(PLAY.minZ + 1, frontZ) };
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const setViewBounds = useStore((s) => s.setViewBounds);
  const base = useMemo(() => ({ position: new Vector3(...CAMERA.position), target: new Vector3(...CAMERA.target) }), []);
  const parallax = useRef(new Vector3());
  const shake = useCameraShake();
  const tmp = useMemo(() => ({ right: new Vector3(), up: new Vector3() }), []);

  useEffect(() => {
    camera.layers.enable(FX_LAYER);
  }, [camera]);

  useEffect(() => {
    const fov = verticalFov(size.width / size.height);
    camera.fov = fov;
    camera.aspect = size.width / size.height;
    camera.near = 0.1;
    camera.far = 60;
    camera.updateProjectionMatrix();
    camera.position.copy(base.position);
    camera.lookAt(base.target);
    const vb = computeViewBounds(size.width, size.height, fov);
    runtime.view.frontZ = vb.frontZ;
    setViewBounds(vb.segments);
  }, [camera, size.width, size.height, base, setViewBounds]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    // pointer parallax (eased, disabled for reduced motion)
    const p = runtime.pointer;
    const want = runtime.reducedMotion || !p.inside ? 0 : 1;
    const k = 1 - Math.exp(-d * CAMERA.parallaxEase);
    parallax.current.x += (p.ndc.x * want - parallax.current.x) * k;
    parallax.current.y += (p.ndc.y * want - parallax.current.y) * k;

    camera.position.copy(base.position);
    camera.lookAt(base.target);
    tmp.right.setFromMatrixColumn(camera.matrixWorld, 0);
    tmp.up.setFromMatrixColumn(camera.matrixWorld, 1);
    camera.position
      .addScaledVector(tmp.right, parallax.current.x * CAMERA.parallax)
      .addScaledVector(tmp.up, parallax.current.y * CAMERA.parallax * 0.5);
    camera.lookAt(base.target);

    shake.update(d);
    camera.position.addScaledVector(tmp.right, shake.offset.x).addScaledVector(tmp.up, shake.offset.y);
    camera.rotateZ(shake.roll);
  });

  return null;
}
