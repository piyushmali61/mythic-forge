import * as THREE from 'three';

/**
 * Levels of detail (LOD).
 *
 * At import, big meshes get simplified copies (vertex clustering, O(n)), stored in the GLB as
 * sibling nodes tagged with `extras.mfLod`. At load, `buildLods` turns each tagged set into a
 * `ScaledLOD`, which shows a simpler copy once the camera is far enough away.
 */

/** Meshes below this triangle count are cheap enough to keep as they are. */
export const LOD_MIN_TRIANGLES = 2000;
/** Target triangle fractions of LOD1 and LOD2. */
export const LOD_RATIOS = [0.35, 0.12] as const;
/** Switch distances in multiples of the mesh's bounding radius, before quality scaling. */
export const LOD_DISTANCE_RADII = [8, 20] as const;
/** A level is kept only if it has at most this fraction of the previous level's triangles. */
const MIN_REDUCTION = 0.8;
const HYSTERESIS = 0.1;

export interface LodTag {
  group: string;
  level: number;
  /** Local-space switch distance (level > 0). */
  distance?: number;
}

export function lodTag(obj: THREE.Object3D): LodTag | null {
  const t = obj.userData?.mfLod as Partial<LodTag> | undefined;
  if (!t || typeof t.group !== 'string' || typeof t.level !== 'number' || !Number.isInteger(t.level) || t.level < 0 || t.level > 8) return null;
  if (t.level > 0 && !(typeof t.distance === 'number' && Number.isFinite(t.distance) && t.distance > 0)) return null;
  return { group: t.group, level: t.level, distance: t.distance };
}

/** True for simplified copies (and meshes inside them), which aren't counted as model content. */
export function isLodCopy(obj: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    const t = lodTag(o);
    if (t) return t.level > 0;
  }
  return false;
}

export function triangleCount(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  if (!pos) return 0;
  return Math.floor((g.index ? g.index.count : pos.count) / 3);
}

const COPY_ATTRIBUTES = ['uv', 'uv1', 'uv2', 'uv3'] as const;
const AVERAGE_ATTRIBUTES = ['normal', 'color'] as const;

/**
 * Simplifies a geometry by merging all vertices that fall into the same grid cell (and face
 * roughly the same way, so hard edges survive). `cells` is the grid resolution along the longest
 * side. Triangles that collapse are dropped. Material groups are kept.
 */
export function clusterSimplify(geometry: THREE.BufferGeometry, cells: number): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position');
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const cell = Math.max(size.x, size.y, size.z, 1e-9) / Math.max(1, cells);
  const nx = Math.floor(size.x / cell) + 1;
  const ny = Math.floor(size.y / cell) + 1;
  const normal = geometry.getAttribute('normal');

  const clusterOf = new Int32Array(pos.count);
  const keys = new Map<number, number>();
  const counts: number[] = [];
  const firstVertex: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const ix = Math.floor((pos.getX(i) - box.min.x) / cell);
    const iy = Math.floor((pos.getY(i) - box.min.y) / cell);
    const iz = Math.floor((pos.getZ(i) - box.min.z) / cell);
    let key = (ix + nx * (iy + ny * iz)) * 8;
    if (normal) key += (normal.getX(i) >= 0 ? 1 : 0) + (normal.getY(i) >= 0 ? 2 : 0) + (normal.getZ(i) >= 0 ? 4 : 0);
    let c = keys.get(key);
    if (c === undefined) {
      c = counts.length;
      keys.set(key, c);
      counts.push(0);
      firstVertex.push(i);
    }
    counts[c]!++;
    clusterOf[i] = c;
  }

  const n = counts.length;
  const out = new THREE.BufferGeometry();
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = clusterOf[i]!;
    positions[c * 3]! += pos.getX(i);
    positions[c * 3 + 1]! += pos.getY(i);
    positions[c * 3 + 2]! += pos.getZ(i);
  }
  for (let c = 0; c < n; c++) {
    positions[c * 3]! /= counts[c]!;
    positions[c * 3 + 1]! /= counts[c]!;
    positions[c * 3 + 2]! /= counts[c]!;
  }
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  for (const name of AVERAGE_ATTRIBUTES) {
    const attr = geometry.getAttribute(name);
    if (!attr) continue;
    const size = attr.itemSize;
    const data = new Float32Array(n * size);
    for (let i = 0; i < attr.count; i++) {
      const c = clusterOf[i]!;
      for (let k = 0; k < size; k++) data[c * size + k]! += attr.getComponent(i, k);
    }
    for (let c = 0; c < n; c++) for (let k = 0; k < size; k++) data[c * size + k]! /= counts[c]!;
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  if (out.getAttribute('normal')) {
    const nrm = out.getAttribute('normal') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let c = 0; c < n; c++) {
      v.fromBufferAttribute(nrm, c).normalize();
      nrm.setXYZ(c, v.x, v.y, v.z);
    }
  }
  // Texture coordinates can't be averaged across seams; use the first vertex of each cluster.
  for (const name of COPY_ATTRIBUTES) {
    const attr = geometry.getAttribute(name);
    if (!attr) continue;
    const size = attr.itemSize;
    const data = new Float32Array(n * size);
    for (let c = 0; c < n; c++) for (let k = 0; k < size; k++) data[c * size + k] = attr.getComponent(firstVertex[c]!, k);
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  }

  const source = geometry.index;
  const vertexAt = (i: number): number => (source ? source.getX(i) : i);
  const total = source ? source.count : pos.count;
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
  const indices: number[] = [];
  for (const g of groups) {
    const start = indices.length;
    const end = Math.min(g.start + g.count, total);
    for (let i = g.start; i + 2 < end; i += 3) {
      const a = clusterOf[vertexAt(i)]!;
      const b = clusterOf[vertexAt(i + 1)]!;
      const c = clusterOf[vertexAt(i + 2)]!;
      if (a !== b && b !== c && a !== c) indices.push(a, b, c);
    }
    if (geometry.groups.length) out.addGroup(start, indices.length - start, g.materialIndex ?? 0);
  }
  out.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  return out;
}

/** Finds a grid resolution whose result has about `ratio` of the original triangles. */
export function simplifyToRatio(geometry: THREE.BufferGeometry, ratio: number): THREE.BufferGeometry {
  const target = triangleCount(geometry) * ratio;
  let lo = 2;
  let hi = 1024;
  let best: THREE.BufferGeometry | null = null;
  for (let step = 0; step < 9 && lo <= hi; step++) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = clusterSimplify(geometry, mid);
    if (triangleCount(candidate) <= target) {
      best?.dispose();
      best = candidate;
      lo = mid + 1;
    } else {
      candidate.dispose();
      hi = mid - 1;
    }
  }
  return best ?? clusterSimplify(geometry, 2);
}

export interface LodReport {
  meshes: number;
  triangles: number;
  levelTriangles: number[];
}

/**
 * Adds simplified sibling copies to every large, static mesh under `root` and tags them for
 * `buildLods`. Skinned and morphing meshes are skipped.
 */
export function generateLods(root: THREE.Object3D): LodReport {
  const report: LodReport = { meshes: 0, triangles: 0, levelTriangles: LOD_RATIOS.map(() => 0) };
  const eligible: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || !mesh.parent) return;
    const g = mesh.geometry;
    if (!g.getAttribute('position') || Object.keys(g.morphAttributes).length > 0) return;
    if (triangleCount(g) >= LOD_MIN_TRIANGLES) eligible.push(mesh);
  });
  const cache = new Map<THREE.BufferGeometry, THREE.BufferGeometry[]>();
  eligible.forEach((mesh, index) => {
    const g = mesh.geometry;
    let levels = cache.get(g);
    if (!levels) {
      levels = [];
      let previous = triangleCount(g);
      for (const ratio of LOD_RATIOS) {
        const simplified = simplifyToRatio(g, ratio);
        const tris = triangleCount(simplified);
        if (tris === 0 || tris > previous * MIN_REDUCTION) {
          simplified.dispose();
          break;
        }
        levels.push(simplified);
        previous = tris;
      }
      cache.set(g, levels);
    }
    if (levels.length === 0) return;
    g.computeBoundingSphere();
    const radius = Math.max(g.boundingSphere?.radius ?? 1, 0.01);
    const group = `lod${index}`;
    mesh.userData.mfLod = { group, level: 0 } satisfies LodTag;
    levels.forEach((lg, i) => {
      const copy = new THREE.Mesh(lg, mesh.material);
      copy.name = `${mesh.name || 'Mesh'}_LOD${i + 1}`;
      copy.position.copy(mesh.position);
      copy.quaternion.copy(mesh.quaternion);
      copy.scale.copy(mesh.scale);
      copy.castShadow = mesh.castShadow;
      copy.receiveShadow = mesh.receiveShadow;
      copy.userData.mfLod = { group, level: i + 1, distance: radius * LOD_DISTANCE_RADII[i]! } satisfies LodTag;
      mesh.parent!.add(copy);
      report.levelTriangles[i]! += triangleCount(lg);
    });
    report.meshes++;
    report.triangles += triangleCount(g);
  });
  return report;
}

const _camera = new THREE.Vector3();
const _object = new THREE.Vector3();

/**
 * THREE.LOD whose switch distances grow with the object's world scale and with the quality
 * setting (`camera.userData.lodDistanceScale`), so big objects and high quality keep detail longer.
 */
export class ScaledLOD extends THREE.LOD {
  override update(camera: THREE.Camera): void {
    const levels = this.levels;
    if (levels.length < 2) return;
    _camera.setFromMatrixPosition(camera.matrixWorld);
    _object.setFromMatrixPosition(this.matrixWorld);
    const zoom = (camera as THREE.PerspectiveCamera).zoom ?? 1;
    const bias = typeof camera.userData.lodDistanceScale === 'number' ? camera.userData.lodDistanceScale : 1;
    const scale = Math.max(this.matrixWorld.getMaxScaleOnAxis() * bias, 1e-6);
    const distance = _camera.distanceTo(_object) / (zoom * scale);
    levels[0]!.object.visible = true;
    let i = 1;
    for (; i < levels.length; i++) {
      const level = levels[i]!;
      let switchAt = level.distance;
      if (level.object.visible) switchAt -= switchAt * level.hysteresis;
      if (distance < switchAt) break;
      levels[i - 1]!.object.visible = false;
      level.object.visible = true;
    }
    // three.js keeps the active level in this (untyped) field for getCurrentLevel().
    (this as unknown as { _currentLevel: number })._currentLevel = i - 1;
    for (; i < levels.length; i++) levels[i]!.object.visible = false;
  }
}

/** Removes LOD copies and tags (re-importing a Mythic Forge GLB regenerates them). */
export function stripLods(root: THREE.Object3D): void {
  const copies: THREE.Object3D[] = [];
  root.traverse((o) => {
    const tag = lodTag(o);
    if (tag && tag.level > 0) copies.push(o);
    delete o.userData.mfLod;
  });
  for (const o of copies) o.removeFromParent();
}

/** Replaces tagged mesh sets with ScaledLOD objects. Returns how many were built. */
export function buildLods(root: THREE.Object3D): number {
  const sets = new Map<string, { base: THREE.Object3D | null; levels: { object: THREE.Object3D; level: number; distance: number }[] }>();
  root.traverse((o) => {
    const tag = lodTag(o);
    if (!tag) return;
    let set = sets.get(tag.group);
    if (!set) {
      set = { base: null, levels: [] };
      sets.set(tag.group, set);
    }
    if (tag.level === 0) set.base = o;
    else set.levels.push({ object: o, level: tag.level, distance: tag.distance! });
  });
  let built = 0;
  for (const set of sets.values()) {
    const base = set.base;
    if (!base?.parent) {
      for (const l of set.levels) l.object.removeFromParent();
      continue;
    }
    if (set.levels.length === 0) continue;
    const lod = new ScaledLOD();
    lod.name = base.name;
    lod.position.copy(base.position);
    lod.quaternion.copy(base.quaternion);
    lod.scale.copy(base.scale);
    base.parent.add(lod);
    for (const obj of [base, ...set.levels.map((l) => l.object)]) {
      obj.removeFromParent();
      obj.position.set(0, 0, 0);
      obj.quaternion.identity();
      obj.scale.set(1, 1, 1);
    }
    lod.addLevel(base, 0, HYSTERESIS);
    for (const l of set.levels.sort((a, b) => a.level - b.level)) lod.addLevel(l.object, l.distance, HYSTERESIS);
    built++;
  }
  return built;
}
