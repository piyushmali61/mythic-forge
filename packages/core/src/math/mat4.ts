import { quatFromBasis, type Quat } from './quat.ts';
import type { Vec3 } from './vec3.ts';

/** Column-major 4x4 matrix (same layout as three.js `Matrix4.elements`). */
export type Mat4 = Float64Array;

export const mat4 = {
  identity(): Mat4 {
    const m = new Float64Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },

  compose(position: Readonly<Vec3>, q: Readonly<Quat>, scale: Readonly<Vec3>): Mat4 {
    const [x, y, z, w] = q;
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;
    const [sx, sy, sz] = scale;
    const m = new Float64Array(16);
    m[0] = (1 - (yy + zz)) * sx;
    m[1] = (xy + wz) * sx;
    m[2] = (xz - wy) * sx;
    m[4] = (xy - wz) * sy;
    m[5] = (1 - (xx + zz)) * sy;
    m[6] = (yz + wx) * sy;
    m[8] = (xz + wy) * sz;
    m[9] = (yz - wx) * sz;
    m[10] = (1 - (xx + yy)) * sz;
    m[12] = position[0];
    m[13] = position[1];
    m[14] = position[2];
    m[15] = 1;
    return m;
  },

  multiply(a: Mat4, b: Mat4): Mat4 {
    const out = new Float64Array(16);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
        out[col * 4 + row] = sum;
      }
    }
    return out;
  },

  transformPoint(m: Mat4, p: Readonly<Vec3>): Vec3 {
    const [x, y, z] = p;
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]! || 1;
    return [
      (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w,
      (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w,
      (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w,
    ];
  },

  getTranslation(m: Mat4): Vec3 {
    return [m[12]!, m[13]!, m[14]!];
  },

  invert(m: Mat4): Mat4 | null {
    const [n11, n21, n31, n41, n12, n22, n32, n42, n13, n23, n33, n43, n14, n24, n34, n44] = m as unknown as number[] as [
      number, number, number, number, number, number, number, number,
      number, number, number, number, number, number, number, number,
    ];
    const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
    const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
    const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
    const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
    if (Math.abs(det) < 1e-300) return null;
    const d = 1 / det;
    const o = new Float64Array(16);
    o[0] = t11 * d;
    o[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * d;
    o[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * d;
    o[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * d;
    o[4] = t12 * d;
    o[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * d;
    o[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * d;
    o[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * d;
    o[8] = t13 * d;
    o[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * d;
    o[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * d;
    o[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * d;
    o[12] = t14 * d;
    o[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * d;
    o[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * d;
    o[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * d;
    return o;
  },

  /** Splits an affine matrix into translation, rotation and scale (like three.js `decompose`). */
  decompose(m: Mat4): { position: Vec3; rotation: Quat; scale: Vec3 } {
    let sx = Math.hypot(m[0]!, m[1]!, m[2]!);
    const sy = Math.hypot(m[4]!, m[5]!, m[6]!);
    const sz = Math.hypot(m[8]!, m[9]!, m[10]!);
    const det =
      m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) -
      m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) +
      m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);
    if (det < 0) sx = -sx;
    const ix = sx !== 0 ? 1 / sx : 0;
    const iy = sy !== 0 ? 1 / sy : 0;
    const iz = sz !== 0 ? 1 / sz : 0;
    const r = new Float64Array(16);
    r[0] = m[0]! * ix;
    r[1] = m[1]! * ix;
    r[2] = m[2]! * ix;
    r[4] = m[4]! * iy;
    r[5] = m[5]! * iy;
    r[6] = m[6]! * iy;
    r[8] = m[8]! * iz;
    r[9] = m[9]! * iz;
    r[10] = m[10]! * iz;
    return { position: [m[12]!, m[13]!, m[14]!], rotation: quatFromRotationMatrix(r), scale: [sx, sy, sz] };
  },

  /**
   * Axis-aligned bounds of an oriented box (local center + half extents) after transformation.
   * Uses the |M| * halfExtents trick, exact for affine transforms.
   */
  transformBox(m: Mat4, center: Readonly<Vec3>, half: Readonly<Vec3>): { min: Vec3; max: Vec3 } {
    const c = mat4.transformPoint(m, center);
    const ex =
      Math.abs(m[0]!) * half[0] + Math.abs(m[4]!) * half[1] + Math.abs(m[8]!) * half[2];
    const ey =
      Math.abs(m[1]!) * half[0] + Math.abs(m[5]!) * half[1] + Math.abs(m[9]!) * half[2];
    const ez =
      Math.abs(m[2]!) * half[0] + Math.abs(m[6]!) * half[1] + Math.abs(m[10]!) * half[2];
    return { min: [c[0] - ex, c[1] - ey, c[2] - ez], max: [c[0] + ex, c[1] + ey, c[2] + ez] };
  },
};

function quatFromRotationMatrix(te: Mat4): Quat {
  return quatFromBasis(te[0]!, te[1]!, te[2]!, te[4]!, te[5]!, te[6]!, te[8]!, te[9]!, te[10]!);
}
