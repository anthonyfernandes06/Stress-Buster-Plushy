import { Quaternion, Vector3 } from 'three';
import { CAMERA, PLUSHY } from '../../config';

/**
 * Rest pose of the plushy in "plushy space": head centre at the origin,
 * +Z is the face. Every rigid body spawns with the same orientation, so the
 * joint motors (target 0) remember this pose as the plush's natural shape.
 */

export interface SegmentRest {
  t: number;
  k: number;
  center: Vector3;
  start: Vector3; // joint point towards the root (plushy space)
  end: Vector3; // joint point towards the tip
  axis: Vector3;
  radius: number; // visual radius at the segment middle
  colliderRadius: number;
  halfHeight: number;
  colliderQuat: Quaternion; // aligns capsule Y with the segment axis
  down: Vector3; // the underside direction, perpendicular to axis
}

export interface TentacleRest {
  t: number;
  angle: number;
  points: Vector3[]; // 9 joint points: root .. tip
  innerRoot: Vector3; // a point inside the head where the tube starts
  segments: SegmentRest[];
}

const UP = new Vector3(0, 1, 0);

export function tentacleRadius(v: number) {
  const { rootRadius, tipRadius } = PLUSHY.tentacle;
  return tipRadius + (rootRadius - tipRadius) * Math.pow(1 - v, 1.15);
}

export function buildLayout() {
  const tc = PLUSHY.tentacle;
  const L = tc.length / tc.segments;
  const tentacles: TentacleRest[] = [];
  for (let t = 0; t < tc.count; t++) {
    const angle = Math.PI / tc.count + (t * Math.PI * 2) / tc.count;
    const curl = t % 2 ? 1 : -1;
    const root = new Vector3(Math.sin(angle) * tc.rootRing, tc.rootY, Math.cos(angle) * tc.rootRing);
    const points = [root.clone()];
    let p = root.clone();
    for (let k = 0; k < tc.segments; k++) {
      const pitch = tc.restPitch[k];
      const yaw = angle + curl * tc.restCurl[k];
      const dir = new Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      p = p.clone().addScaledVector(dir, L);
      points.push(p);
    }
    const segments: SegmentRest[] = [];
    for (let k = 0; k < tc.segments; k++) {
      const start = points[k];
      const end = points[k + 1];
      const center = start.clone().add(end).multiplyScalar(0.5);
      const axis = end.clone().sub(start).normalize();
      const radius = tentacleRadius((k + 0.5) / tc.segments);
      const colliderRadius = radius * (k === 0 ? tc.rootColliderScale : tc.colliderScale);
      const halfHeight = Math.max(0.006, L / 2 - colliderRadius);
      const down = new Vector3(0, -1, 0);
      down.addScaledVector(axis, -down.dot(axis)).normalize();
      segments.push({
        t,
        k,
        center,
        start: start.clone(),
        end: end.clone(),
        axis,
        radius,
        colliderRadius,
        halfHeight,
        colliderQuat: new Quaternion().setFromUnitVectors(UP, axis),
        down,
      });
    }
    tentacles.push({
      t,
      angle,
      points,
      innerRoot: new Vector3(Math.sin(angle) * 0.16, tc.rootY + 0.16, Math.cos(angle) * 0.16),
      segments,
    });
  }
  return { tentacles, segmentLength: L };
}

export type PlushyLayout = ReturnType<typeof buildLayout>;

/** Spawn orientation: face the camera. */
export function spawnQuaternion() {
  const yaw = Math.atan2(CAMERA.position[0], CAMERA.position[2]) - 0.15;
  return new Quaternion().setFromAxisAngle(UP, yaw);
}
