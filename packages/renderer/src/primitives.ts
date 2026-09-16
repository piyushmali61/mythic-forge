import type { MaterialDef, PrimitiveType } from '@mythic-forge/core';
import * as THREE from 'three';

/**
 * Shared unit-size geometries. One instance per primitive type is reused by every entity,
 * which keeps GPU memory flat no matter how many cubes a scene has.
 */
export class GeometryCache {
  private cache = new Map<PrimitiveType, THREE.BufferGeometry>();
  private readonly detail: number;

  constructor(detail: 'low' | 'full') {
    this.detail = detail === 'low' ? 0.5 : 1;
  }

  get(type: PrimitiveType): THREE.BufferGeometry {
    let g = this.cache.get(type);
    if (!g) {
      g = this.create(type);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      this.cache.set(type, g);
    }
    return g;
  }

  private create(type: PrimitiveType): THREE.BufferGeometry {
    const seg = (n: number): number => Math.max(6, Math.round(n * this.detail));
    switch (type) {
      case 'cube':
        return new THREE.BoxGeometry(1, 1, 1);
      case 'sphere':
        return new THREE.SphereGeometry(0.5, seg(32), seg(16));
      case 'capsule':
        return new THREE.CapsuleGeometry(0.5, 1, seg(8), seg(16));
      case 'cylinder':
        return new THREE.CylinderGeometry(0.5, 0.5, 1, seg(32));
      case 'cone':
        return new THREE.ConeGeometry(0.5, 1, seg(32));
      case 'plane':
        return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      case 'quad':
        return new THREE.PlaneGeometry(1, 1);
      case 'torus':
        return new THREE.TorusGeometry(0.5, 0.15, seg(12), seg(32));
    }
  }

  dispose(): void {
    for (const g of this.cache.values()) g.dispose();
    this.cache.clear();
  }
}

export function createMaterial(def: MaterialDef, map: THREE.Texture | null): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial();
  applyMaterial(mat, def, map);
  return mat;
}

export function applyMaterial(mat: THREE.MeshStandardMaterial, def: MaterialDef, map: THREE.Texture | null): void {
  mat.color.set(def.color);
  mat.metalness = def.metalness;
  mat.roughness = def.roughness;
  mat.emissive.set(def.emissive);
  mat.emissiveIntensity = def.emissiveIntensity;
  mat.opacity = def.opacity;
  mat.transparent = def.opacity < 1;
  mat.depthWrite = def.opacity >= 1;
  mat.side = def.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  mat.flatShading = def.flatShading;
  if (mat.map !== map) {
    mat.map = map;
  }
  if (map) {
    map.repeat.set(def.textureRepeat[0], def.textureRepeat[1]);
  }
  mat.needsUpdate = true;
}

// ---- editor-only icons ---------------------------------------------------------------------------

const ICON_LAYER_NAME = 'editor-helper';

export function isEditorHelper(obj: THREE.Object3D): boolean {
  return obj.userData.kind === ICON_LAYER_NAME;
}

/** Small, cheap marker so invisible things (lights, cameras, empty objects) can be seen and picked. */
export function createIcon(kind: 'light' | 'camera' | 'empty', color: string): THREE.Object3D {
  let geometry: THREE.BufferGeometry;
  if (kind === 'camera') {
    geometry = new THREE.ConeGeometry(0.25, 0.4, 4, 1, true).rotateX(Math.PI / 2).rotateZ(Math.PI / 4);
  } else if (kind === 'light') {
    geometry = new THREE.OctahedronGeometry(0.18);
  } else {
    geometry = new THREE.OctahedronGeometry(0.12);
  }
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: true, transparent: true, opacity: 0.9 }),
  );
  mesh.userData.kind = ICON_LAYER_NAME;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function createColliderBox(size: THREE.Vector3Like, center: THREE.Vector3Like, trigger: boolean): THREE.LineSegments {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: trigger ? 0x5fd3a7 : 0x6fb3ff, transparent: true, opacity: 0.85 }),
  );
  lines.position.set(center.x, center.y, center.z);
  lines.userData.kind = ICON_LAYER_NAME;
  lines.raycast = () => undefined;
  return lines;
}

export function disposeObject(root: THREE.Object3D, options: { keepGeometries?: Set<THREE.BufferGeometry>; keepMaterials?: boolean } = {}): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !options.keepGeometries?.has(mesh.geometry)) mesh.geometry.dispose();
    if (mesh.material && !options.keepMaterials) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m.dispose();
    }
  });
}
