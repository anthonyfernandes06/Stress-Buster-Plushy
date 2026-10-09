import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera, Ray, Vector2, Vector3 } from 'three';
import { PLAY, ROOM } from '../../config';
import { runtime } from '../../state/runtime';
import { useStore, type Tool } from '../../state/store';
import { HandTool } from './HandTool';
import { BatTool } from './BatTool';
import { LighterTool } from './LighterTool';
import { GunTool } from './GunTool';

export interface PointerInfo {
  id: number;
  x: number; // client px
  y: number;
  ndc: Vector2;
  ray: Ray;
  time: number; // seconds (performance clock)
  type: string;
}

export interface ToolHandler {
  down(p: PointerInfo): void;
  move(p: PointerInfo): void;
  up(p: PointerInfo): void;
  /** Abort whatever is in progress (tool switch, Esc, reset). */
  cancel(): void;
  cursor(): string;
}

export type RegisterTool = (tool: Tool, h: ToolHandler | null) => void;

/** Builds a world-space ray from normalised device coords. */
export function rayFromNdc(camera: PerspectiveCamera, ndc: Vector2, out: Ray) {
  out.origin.setFromMatrixPosition(camera.matrixWorld);
  out.direction.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(out.origin).normalize();
  return out;
}

/**
 * Nearest hit of a ray against the inside of the room box (floor, ceiling,
 * back and side walls). Returns the distance, or null if it hits nothing.
 */
export function rayRoom(ray: Ray, out: Vector3, normal?: Vector3): number | null {
  const o = ray.origin;
  const d = ray.direction;
  const W = ROOM.halfWidth;
  const e = 1e-3;
  let best = Infinity;
  const test = (t: number, nx: number, ny: number, nz: number) => {
    if (!(t > 0) || t >= best) return;
    const x = o.x + d.x * t;
    const y = o.y + d.y * t;
    const z = o.z + d.z * t;
    if (x < -W - e || x > W + e || y < -e || y > ROOM.height + e || z < ROOM.back - e || z > ROOM.front) return;
    best = t;
    normal?.set(nx, ny, nz);
  };
  if (d.y < 0) test(-o.y / d.y, 0, 1, 0);
  if (d.y > 0) test((ROOM.height - o.y) / d.y, 0, -1, 0);
  if (d.z < 0) test((ROOM.back - o.z) / d.z, 0, 0, 1);
  if (d.x < 0) test((-W - o.x) / d.x, 1, 0, 0);
  if (d.x > 0) test((W - o.x) / d.x, -1, 0, 0);
  if (!Number.isFinite(best)) return null;
  ray.at(best, out);
  return best;
}

/** Camera forward, flattened to the floor plane. */
export function forwardFlat(out: Vector3) {
  const cam = runtime.camera;
  if (!cam) return out.set(0, 0, -1);
  cam.getWorldDirection(out).setY(0);
  return out.lengthSq() > 1e-6 ? out.normalize() : out.set(0, 0, -1);
}

/** Keeps a point inside the playable part of the room. */
export function clampToPlay(p: Vector3, minY = 0, margin = 0) {
  p.x = Math.max(PLAY.minX + margin, Math.min(PLAY.maxX - margin, p.x));
  p.z = Math.max(PLAY.minZ + margin, Math.min(runtime.view.frontZ - margin, p.z));
  p.y = Math.max(minY, Math.min(PLAY.maxY, p.y));
  return p;
}

/**
 * Owns the DOM pointer events on the canvas and routes them to the active
 * tool. Using raw pointer events (with capture) keeps drags working even
 * when the pointer leaves the plushy or the canvas.
 */
export function Tools() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const handlers = useRef<Partial<Record<Tool, ToolHandler>>>({});
  const register = useMemo<RegisterTool>(
    () => (tool, h) => {
      if (h) handlers.current[tool] = h;
      else delete handlers.current[tool];
    },
    [],
  );

  useEffect(() => {
    runtime.camera = camera;
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = 'none';
    const info: PointerInfo = { id: -1, x: 0, y: 0, ndc: new Vector2(), ray: new Ray(), time: 0, type: 'mouse' };
    let activeId: number | null = null;

    const fill = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      info.id = e.pointerId;
      info.x = e.clientX;
      info.y = e.clientY;
      info.type = e.pointerType;
      info.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      info.time = performance.now() / 1000;
      camera.updateMatrixWorld();
      rayFromNdc(camera, info.ndc, info.ray);
      runtime.pointer.ndc.copy(info.ndc);
      runtime.pointer.client.set(e.clientX, e.clientY);
      runtime.pointer.inside = true;
      return info;
    };
    const current = () => handlers.current[useStore.getState().tool];
    const updateCursor = () => {
      const h = current();
      el.style.cursor = h ? h.cursor() : 'default';
    };

    const onDown = (e: PointerEvent) => {
      if (!useStore.getState().started) return;
      if (activeId !== null && activeId !== e.pointerId) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      activeId = e.pointerId;
      runtime.pointer.down = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      current()?.down(fill(e));
      updateCursor();
    };
    const onMove = (e: PointerEvent) => {
      if (activeId !== null && e.pointerId !== activeId) return;
      fill(e);
      if (useStore.getState().started) current()?.move(info);
      updateCursor();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      runtime.pointer.down = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      current()?.up(fill(e));
      if (e.pointerType !== 'mouse') runtime.pointer.inside = false;
      updateCursor();
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      runtime.pointer.down = false;
      current()?.cancel();
      updateCursor();
    };
    const onLeave = () => {
      if (activeId === null) runtime.pointer.inside = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        current()?.cancel();
        updateCursor();
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey);

    // cancel the old tool when switching, or when the room resets
    const unsub = useStore.subscribe((s, prev) => {
      if (s.tool !== prev.tool) {
        handlers.current[prev.tool]?.cancel();
        updateCursor();
      }
      if (s.resetToken !== prev.resetToken) {
        for (const h of Object.values(handlers.current)) h?.cancel();
      }
    });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
      unsub();
    };
  }, [gl, camera]);

  return (
    <>
      <HandTool register={register} />
      <BatTool register={register} />
      <LighterTool register={register} />
      <GunTool register={register} />
    </>
  );
}
