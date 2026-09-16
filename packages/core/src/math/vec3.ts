export type Vec3 = [number, number, number];

export const vec3 = {
  zero: (): Vec3 => [0, 0, 0],
  one: (): Vec3 => [1, 1, 1],
  clone: (a: Readonly<Vec3>): Vec3 => [a[0], a[1], a[2]],
  add: (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Readonly<Vec3>, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  mul: (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]],
  dot: (a: Readonly<Vec3>, b: Readonly<Vec3>): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  length: (a: Readonly<Vec3>): number => Math.hypot(a[0], a[1], a[2]),
  distance: (a: Readonly<Vec3>, b: Readonly<Vec3>): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  normalize(a: Readonly<Vec3>): Vec3 {
    const len = Math.hypot(a[0], a[1], a[2]);
    return len > 1e-12 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 0, 0];
  },
  lerp: (a: Readonly<Vec3>, b: Readonly<Vec3>, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
  equals: (a: Readonly<Vec3>, b: Readonly<Vec3>, eps = 1e-9): boolean =>
    Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps && Math.abs(a[2] - b[2]) <= eps,
};

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(smoothing: number, dt: number): number {
  return 1 - Math.exp(-smoothing * dt);
}
