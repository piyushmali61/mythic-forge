import type { Vec3 } from '../math/vec3.ts';

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

export const aabbOverlap = (a: Aabb, b: Aabb, eps = 1e-6): boolean =>
  a.min[0] < b.max[0] - eps &&
  a.max[0] > b.min[0] + eps &&
  a.min[1] < b.max[1] - eps &&
  a.max[1] > b.min[1] + eps &&
  a.min[2] < b.max[2] - eps &&
  a.max[2] > b.min[2] + eps;

export const aabbFrom = (center: Vec3, half: Vec3): Aabb => ({
  min: [center[0] - half[0], center[1] - half[1], center[2] - half[2]],
  max: [center[0] + half[0], center[1] + half[1], center[2] + half[2]],
});

export interface StaticCollider {
  id: string;
  box: Aabb;
}

export interface Body {
  /** Collider center in world space. */
  center: Vec3;
  half: Vec3;
  velocity: Vec3;
  grounded: boolean;
  useGravity: boolean;
}

export interface PhysicsOptions {
  gravity: number;
  /** Highest ledge a body can walk onto without jumping. */
  stepHeight: number;
  maxFallSpeed: number;
}

export const DEFAULT_PHYSICS: PhysicsOptions = { gravity: -9.81, stepHeight: 0.45, maxFallSpeed: 50 };

/**
 * Deliberately simple kinematic AABB physics: gravity, axis-separated collision resolution,
 * grounded detection and step-up. Enough for character movement in MVP games; not a
 * general rigid-body simulator (no rotation, no body-vs-body stacking).
 */
export function stepBody(body: Body, desiredMove: Vec3, colliders: readonly StaticCollider[], dt: number, opts: PhysicsOptions): void {
  if (body.useGravity) {
    body.velocity[1] = Math.max(body.velocity[1] + opts.gravity * dt, -opts.maxFallSpeed);
  }
  const move: Vec3 = [
    desiredMove[0] + body.velocity[0] * dt,
    body.velocity[1] * dt,
    desiredMove[2] + body.velocity[2] * dt,
  ];

  const nearby = broadphase(body, move, colliders);

  // Horizontal axes first (with step-up), then vertical.
  for (const axis of [0, 2] as const) {
    if (move[axis] === 0) continue;
    body.center[axis] += move[axis];
    const hit = firstOverlap(body, nearby);
    if (!hit) continue;
    const feet = body.center[1] - body.half[1];
    const rise = hit.box.max[1] - feet;
    if (body.grounded && rise > 0 && rise <= opts.stepHeight) {
      body.center[1] += rise + 1e-4;
      if (!firstOverlap(body, nearby)) continue;
      body.center[1] -= rise + 1e-4;
    }
    // Push back out along this axis.
    if (move[axis] > 0) body.center[axis] = hit.box.min[axis] - body.half[axis] - 1e-5;
    else body.center[axis] = hit.box.max[axis] + body.half[axis] + 1e-5;
    body.velocity[axis] = 0;
  }

  body.grounded = false;
  if (move[1] !== 0) {
    body.center[1] += move[1];
    const hit = firstOverlap(body, nearby);
    if (hit) {
      if (move[1] < 0) {
        body.center[1] = hit.box.max[1] + body.half[1] + 1e-5;
        body.grounded = true;
      } else {
        body.center[1] = hit.box.min[1] - body.half[1] - 1e-5;
      }
      body.velocity[1] = 0;
    }
  }
  if (!body.grounded && body.velocity[1] <= 0) {
    // Resting contact: probe slightly below.
    body.center[1] -= 0.02;
    if (firstOverlap(body, nearby)) body.grounded = true;
    body.center[1] += 0.02;
  }
}

function bodyBox(body: Body): Aabb {
  return aabbFrom(body.center, body.half);
}

function firstOverlap(body: Body, colliders: readonly StaticCollider[]): StaticCollider | null {
  const box = bodyBox(body);
  for (const c of colliders) if (aabbOverlap(box, c.box)) return c;
  return null;
}

/** Only test colliders the body could reach this step. */
function broadphase(body: Body, move: Vec3, colliders: readonly StaticCollider[]): StaticCollider[] {
  const margin = 0.6;
  const sweep: Aabb = {
    min: [
      body.center[0] - body.half[0] + Math.min(0, move[0]) - margin,
      body.center[1] - body.half[1] + Math.min(0, move[1]) - margin,
      body.center[2] - body.half[2] + Math.min(0, move[2]) - margin,
    ],
    max: [
      body.center[0] + body.half[0] + Math.max(0, move[0]) + margin,
      body.center[1] + body.half[1] + Math.max(0, move[1]) + margin,
      body.center[2] + body.half[2] + Math.max(0, move[2]) + margin,
    ],
  };
  return colliders.filter((c) => aabbOverlap(sweep, c.box, 0));
}
