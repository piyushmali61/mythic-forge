import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseGlb } from '../src/assets/glb.ts';
import {
  LOD_DISTANCE_RADII,
  ScaledLOD,
  buildLods,
  clusterSimplify,
  generateLods,
  isLodCopy,
  lodTag,
  simplifyToRatio,
  stripLods,
  triangleCount,
} from '../src/assets/lod.ts';

beforeAll(() => {
  // GLTFExporter reads its output through FileReader, which Node doesn't have.
  const g = globalThis as { FileReader?: unknown };
  g.FileReader ??= class {
    result: ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
  };
});

const material = new THREE.MeshStandardMaterial();

function sceneWithBigSphere(): { root: THREE.Group; sphere: THREE.Mesh; cube: THREE.Mesh } {
  const root = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(2, 96, 48), material);
  sphere.name = 'Dome';
  sphere.position.set(1, 2, 3);
  sphere.scale.setScalar(1.5);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(), material);
  cube.name = 'Crate';
  root.add(sphere, cube);
  return { root, sphere, cube };
}

describe('clusterSimplify', () => {
  it('reduces triangles while keeping the shape, normals and valid indices', () => {
    const g = new THREE.SphereGeometry(1, 64, 48);
    const s = clusterSimplify(g, 12);
    expect(triangleCount(s)).toBeLessThan(triangleCount(g) / 2);
    expect(triangleCount(s)).toBeGreaterThan(50);
    s.computeBoundingSphere();
    expect(s.boundingSphere!.radius).toBeGreaterThan(0.85);
    expect(s.boundingSphere!.radius).toBeLessThan(1.15);
    const pos = s.getAttribute('position');
    const nrm = s.getAttribute('normal');
    for (let i = 0; i < nrm.count; i++) expect(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i))).toBeCloseTo(1, 4);
    const index = s.index!;
    for (let i = 0; i < index.count; i++) expect(index.getX(i)).toBeLessThan(pos.count);
    expect(s.getAttribute('uv')?.count).toBe(pos.count);
  });

  it('keeps material groups consistent', () => {
    const g = new THREE.BoxGeometry(1, 1, 1, 24, 24, 24);
    const s = clusterSimplify(g, 6);
    expect(s.groups.length).toBe(g.groups.length);
    let end = 0;
    for (const group of s.groups) {
      expect(group.start).toBe(end);
      end = group.start + group.count;
    }
    expect(end).toBe(s.index!.count);
    // Hard edges survive: the six faces stay separate, so the box keeps its size.
    s.computeBoundingBox();
    expect(s.boundingBox!.max.x).toBeCloseTo(0.5, 1);
  });

  it('hits a target ratio', () => {
    const g = new THREE.SphereGeometry(1, 96, 64);
    const s = simplifyToRatio(g, 0.2);
    expect(triangleCount(s)).toBeLessThanOrEqual(triangleCount(g) * 0.2);
    expect(triangleCount(s)).toBeGreaterThan(triangleCount(g) * 0.05);
  });
});

describe('generateLods / buildLods', () => {
  it('adds tagged copies only for large static meshes', () => {
    const { root, sphere, cube } = sceneWithBigSphere();
    const skinned = new THREE.SkinnedMesh(new THREE.SphereGeometry(1, 96, 48), material);
    skinned.bind(new THREE.Skeleton([new THREE.Bone()]));
    root.add(skinned);
    const report = generateLods(root);
    expect(report.meshes).toBe(1);
    expect(lodTag(sphere)).toEqual({ group: 'lod0', level: 0, distance: undefined });
    expect(lodTag(cube)).toBeNull();
    expect(lodTag(skinned)).toBeNull();
    const copies = root.children.filter((o) => isLodCopy(o));
    expect(copies).toHaveLength(2);
    expect(triangleCount((copies[0] as THREE.Mesh).geometry)).toBeLessThan(triangleCount(sphere.geometry) * 0.36);
    expect(triangleCount((copies[1] as THREE.Mesh).geometry)).toBeLessThan(triangleCount((copies[0] as THREE.Mesh).geometry));
    expect(lodTag(copies[0]!)!.distance).toBeCloseTo(2 * LOD_DISTANCE_RADII[0], 3);
    expect(copies[0]!.position.toArray()).toEqual([1, 2, 3]);
  });

  it('survives GLB export and becomes a ScaledLOD on load', async () => {
    const { root } = sceneWithBigSphere();
    generateLods(root);
    const bytes = new Uint8Array((await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer);
    const { root: loaded } = await parseGlb(bytes);
    expect(buildLods(loaded)).toBe(1);
    let lod: ScaledLOD | null = null;
    loaded.traverse((o) => {
      if (o instanceof ScaledLOD) lod = o;
    });
    expect(lod).not.toBeNull();
    const l = lod as unknown as ScaledLOD;
    expect(l.name).toBe('Dome');
    expect(l.levels).toHaveLength(3);
    expect(l.position.toArray()).toEqual([1, 2, 3]);
    expect(l.scale.x).toBeCloseTo(1.5, 5);
    expect(l.levels[0]!.object.position.toArray()).toEqual([0, 0, 0]);
    // Copies of the loaded model keep working LODs.
    const copy = loaded.clone(true);
    let cloned: ScaledLOD | null = null;
    copy.traverse((o) => {
      if (o instanceof ScaledLOD) cloned = o;
    });
    expect((cloned as unknown as ScaledLOD).levels).toHaveLength(3);
  });

  it('strips existing copies so a re-import starts clean', () => {
    const { root, sphere } = sceneWithBigSphere();
    generateLods(root);
    stripLods(root);
    expect(root.children).toHaveLength(2);
    expect(lodTag(sphere)).toBeNull();
    expect(generateLods(root).meshes).toBe(1);
    expect(root.children.filter((o) => isLodCopy(o))).toHaveLength(2);
  });
});

describe('ScaledLOD', () => {
  function lodAt(distance1: number, distance2: number): ScaledLOD {
    const lod = new ScaledLOD();
    for (const d of [0, distance1, distance2]) lod.addLevel(new THREE.Object3D(), d, 0.1);
    return lod;
  }
  const levelAt = (lod: ScaledLOD, camera: THREE.PerspectiveCamera, z: number): number => {
    camera.position.set(0, 0, z);
    camera.updateMatrixWorld();
    lod.updateMatrixWorld();
    lod.update(camera);
    return lod.levels.findIndex((l) => l.object.visible);
  };

  it('switches by distance, scaled by world size and the quality multiplier', () => {
    const camera = new THREE.PerspectiveCamera();
    const lod = lodAt(10, 25);
    expect(levelAt(lod, camera, 5)).toBe(0);
    expect(levelAt(lod, camera, 12)).toBe(1);
    expect(levelAt(lod, camera, 30)).toBe(2);
    expect(levelAt(lod, camera, 5)).toBe(0);

    camera.userData.lodDistanceScale = 2;
    expect(levelAt(lod, camera, 12)).toBe(0);
    expect(levelAt(lod, camera, 30)).toBe(1);

    camera.userData.lodDistanceScale = 1;
    lod.scale.setScalar(3);
    // 3× larger: level 1 starts at 30 m instead of 10 m (hysteresis keeps a visible level 10% longer).
    expect(levelAt(lod, camera, 20)).toBe(0);
    expect(levelAt(lod, camera, 28)).toBe(0);
    expect(levelAt(lod, camera, 31)).toBe(1);
    expect(levelAt(lod, camera, 28)).toBe(1);
    expect(levelAt(lod, camera, 26)).toBe(0);
  });
});
