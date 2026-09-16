import { DEG2RAD, RAD2DEG, clamp, type Vec3 } from './vec3.ts';

/** Quaternion as [x, y, z, w]. Conventions match three.js so runtime and renderer agree. */
export type Quat = [number, number, number, number];

export const quat = {
  identity: (): Quat => [0, 0, 0, 1],

  /** Intrinsic XYZ Euler angles in degrees (the editor's rotation representation). */
  fromEulerDeg(e: Readonly<Vec3>): Quat {
    const hx = (e[0] * DEG2RAD) / 2;
    const hy = (e[1] * DEG2RAD) / 2;
    const hz = (e[2] * DEG2RAD) / 2;
    const c1 = Math.cos(hx);
    const c2 = Math.cos(hy);
    const c3 = Math.cos(hz);
    const s1 = Math.sin(hx);
    const s2 = Math.sin(hy);
    const s3 = Math.sin(hz);
    return [
      s1 * c2 * c3 + c1 * s2 * s3,
      c1 * s2 * c3 - s1 * c2 * s3,
      c1 * c2 * s3 + s1 * s2 * c3,
      c1 * c2 * c3 - s1 * s2 * s3,
    ];
  },

  /** Converts back to intrinsic XYZ Euler degrees. */
  toEulerDeg(q: Readonly<Quat>): Vec3 {
    const [x, y, z, w] = q;
    const m11 = 1 - 2 * (y * y + z * z);
    const m12 = 2 * (x * y - w * z);
    const m13 = 2 * (x * z + w * y);
    const m22 = 1 - 2 * (x * x + z * z);
    const m23 = 2 * (y * z - w * x);
    const m32 = 2 * (y * z + w * x);
    const m33 = 1 - 2 * (x * x + y * y);
    const ey = Math.asin(clamp(m13, -1, 1));
    let ex: number;
    let ez: number;
    if (Math.abs(m13) < 0.9999999) {
      ex = Math.atan2(-m23, m33);
      ez = Math.atan2(-m12, m11);
    } else {
      ex = Math.atan2(m32, m22);
      ez = 0;
    }
    return [ex * RAD2DEG, ey * RAD2DEG, ez * RAD2DEG];
  },

  fromAxisAngle(axis: Readonly<Vec3>, radians: number): Quat {
    const half = radians / 2;
    const s = Math.sin(half);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
  },

  multiply(a: Readonly<Quat>, b: Readonly<Quat>): Quat {
    const [ax, ay, az, aw] = a;
    const [bx, by, bz, bw] = b;
    return [
      ax * bw + aw * bx + ay * bz - az * by,
      ay * bw + aw * by + az * bx - ax * bz,
      az * bw + aw * bz + ax * by - ay * bx,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
  },

  rotate(q: Readonly<Quat>, v: Readonly<Vec3>): Vec3 {
    const [qx, qy, qz, qw] = q;
    const tx = 2 * (qy * v[2] - qz * v[1]);
    const ty = 2 * (qz * v[0] - qx * v[2]);
    const tz = 2 * (qx * v[1] - qy * v[0]);
    return [
      v[0] + qw * tx + qy * tz - qz * ty,
      v[1] + qw * ty + qz * tx - qx * tz,
      v[2] + qw * tz + qx * ty - qy * tx,
    ];
  },

  normalize(q: Readonly<Quat>): Quat {
    const len = Math.hypot(q[0], q[1], q[2], q[3]);
    return len > 0 ? [q[0] / len, q[1] / len, q[2] / len, q[3] / len] : [0, 0, 0, 1];
  },

  slerp(a: Readonly<Quat>, b: Readonly<Quat>, t: number): Quat {
    let [bx, by, bz, bw] = b;
    let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (cos < 0) {
      cos = -cos;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    if (cos > 0.9995) {
      return quat.normalize([
        a[0] + (bx - a[0]) * t,
        a[1] + (by - a[1]) * t,
        a[2] + (bz - a[2]) * t,
        a[3] + (bw - a[3]) * t,
      ]);
    }
    const theta = Math.acos(cos);
    const sin = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / sin;
    const wb = Math.sin(t * theta) / sin;
    return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
  },

  /** Rotation about +Y (yaw) — used by character controllers. */
  fromYaw(radians: number): Quat {
    return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
  },

  /**
   * Rotation whose -Z axis points along `forward` (camera convention, like three.js lookAt for cameras).
   */
  lookRotation(forward: Readonly<Vec3>, up: Readonly<Vec3> = [0, 1, 0]): Quat {
    // z axis points away from the view direction.
    let zx = -forward[0];
    let zy = -forward[1];
    let zz = -forward[2];
    let len = Math.hypot(zx, zy, zz);
    if (len < 1e-12) return quat.identity();
    zx /= len;
    zy /= len;
    zz /= len;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    if (len < 1e-12) {
      // forward is parallel to up: nudge
      zz += 1e-4;
      xx = up[1] * zz - up[2] * zy;
      xy = up[2] * zx - up[0] * zz;
      xz = up[0] * zy - up[1] * zx;
      len = Math.hypot(xx, xy, xz);
    }
    xx /= len;
    xy /= len;
    xz /= len;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    return quatFromBasis(xx, xy, xz, yx, yy, yz, zx, zy, zz);
  },
};

/** Quaternion from an orthonormal basis given column by column (x axis, y axis, z axis). */
export function quatFromBasis(
  m11: number, m21: number, m31: number,
  m12: number, m22: number, m32: number,
  m13: number, m23: number, m33: number,
): Quat {
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
}
