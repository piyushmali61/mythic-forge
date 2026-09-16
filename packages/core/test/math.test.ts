import { describe, expect, it } from 'vitest';
import { mat4, quat, vec3, type Vec3 } from '../src/index.ts';

const close = (a: readonly number[], b: readonly number[], eps = 1e-6): void => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, -Math.log10(eps)));
};

describe('quaternions', () => {
  it('round-trips Euler angles', () => {
    const cases: Vec3[] = [
      [0, 0, 0],
      [30, 45, 60],
      [-80, 10, 170],
      [0, 89, 0],
    ];
    for (const e of cases) close(quat.toEulerDeg(quat.fromEulerDeg(e)), e, 1e-4);
  });

  it('rotates vectors like three.js (yaw 90° maps +Z to +X)', () => {
    close(quat.rotate(quat.fromYaw(Math.PI / 2), [0, 0, 1]), [1, 0, 0]);
    close(quat.rotate(quat.fromEulerDeg([0, 90, 0]), [0, 0, 1]), [1, 0, 0]);
  });

  it('lookRotation points -Z along the forward vector', () => {
    const fwd = vec3.normalize([1, -0.5, -2]);
    const q = quat.lookRotation(fwd);
    close(quat.rotate(q, [0, 0, -1]), fwd);
  });

  it('slerp interpolates halfway', () => {
    const q = quat.slerp(quat.identity(), quat.fromYaw(Math.PI / 2), 0.5);
    close(quat.rotate(q, [0, 0, 1]), [Math.SQRT1_2, 0, Math.SQRT1_2]);
  });
});

describe('matrices', () => {
  it('compose/decompose round-trips TRS', () => {
    const q = quat.fromEulerDeg([10, 20, 30]);
    const m = mat4.compose([1, 2, 3], q, [2, 3, 4]);
    const d = mat4.decompose(m);
    close(d.position, [1, 2, 3]);
    close(d.scale, [2, 3, 4]);
    close(quat.toEulerDeg(d.rotation), [10, 20, 30], 1e-4);
  });

  it('inverts matrices', () => {
    const m = mat4.compose([5, -2, 1], quat.fromEulerDeg([45, 0, 15]), [1, 2, 0.5]);
    const inv = mat4.invert(m)!;
    close([...mat4.multiply(m, inv)], [...mat4.identity()]);
    expect(mat4.invert(mat4.compose([0, 0, 0], quat.identity(), [0, 1, 1]))).toBeNull();
  });

  it('transforms boxes to world-space AABBs', () => {
    const m = mat4.compose([10, 0, 0], quat.fromEulerDeg([0, 90, 0]), [1, 1, 1]);
    const box = mat4.transformBox(m, [0, 0, 0], [2, 1, 0.5]);
    close(box.min, [9.5, -1, -2]);
    close(box.max, [10.5, 1, 2]);
  });
});
