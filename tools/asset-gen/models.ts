/**
 * Original low-poly models for the Mythic Bharat Studios official pack.
 * Every shape here is built from numbers in this file — no external meshes, textures or
 * references are used, so provenance is fully documented by the source code itself.
 */
import * as THREE from 'three';
import type { MaterialSpec, Part } from './glb-writer.ts';

export const MATERIALS = {
  sandstone: { name: 'Sandstone', color: '#d8b98f', metalness: 0, roughness: 0.9 },
  redSandstone: { name: 'Red Sandstone', color: '#b5533c', metalness: 0, roughness: 0.85 },
  brass: { name: 'Brass', color: '#c9a14a', metalness: 1, roughness: 0.35 },
  terracotta: { name: 'Terracotta', color: '#c4693d', metalness: 0, roughness: 0.8 },
  oil: { name: 'Lamp Oil', color: '#3b2a12', metalness: 0, roughness: 0.2 },
  flame: { name: 'Flame', color: '#ffb347', metalness: 0, roughness: 1, emissive: '#ff8c1a', emissiveStrength: 3 },
  leaf: { name: 'Leaf', color: '#3f7a3a', metalness: 0, roughness: 0.8 },
  leafLight: { name: 'Leaf Light', color: '#5b9446', metalness: 0, roughness: 0.8 },
  bark: { name: 'Bark', color: '#6b4a2f', metalness: 0, roughness: 0.95 },
  coconut: { name: 'Coconut', color: '#7a5230', metalness: 0, roughness: 0.9 },
  wood: { name: 'Wood', color: '#8a5d3b', metalness: 0, roughness: 0.85 },
  darkWood: { name: 'Dark Wood', color: '#543620', metalness: 0, roughness: 0.9 },
  stoneGrey: { name: 'Stone Grey', color: '#828282', metalness: 0, roughness: 0.9 },
  grassGreen: { name: 'Grass Green', color: '#4d8a3b', metalness: 0, roughness: 0.85 },
  dirtBrown: { name: 'Dirt Brown', color: '#59402b', metalness: 0, roughness: 0.95 },
} satisfies Record<string, MaterialSpec>;

const part = (geometry: THREE.BufferGeometry, material: MaterialSpec): Part => ({ geometry, material });

const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Lathe from (radius, height) pairs, bottom to top. */
const lathe = (profile: [number, number][], segments: number, y = 0): THREE.BufferGeometry =>
  new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 0.0001), h)), segments).translate(0, y, 0);

/** Faceted (flat-shaded) copy of a geometry. */
const faceted = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
  const flat = g.index ? g.toNonIndexed() : g;
  flat.computeVertexNormals();
  return flat;
};

export function shrinePlatform(): Part[] {
  const parts: Part[] = [];
  const steps: [number, number][] = [
    [8, 0.2],
    [6.5, 0.6],
    [5, 1.0],
  ];
  for (const [w, cy] of steps) {
    parts.push(part(box(w, 0.4, w, 0, cy, 0), MATERIALS.sandstone));
    // Carved trim band near the top edge of each step.
    parts.push(part(box(w + 0.06, 0.06, w + 0.06, 0, cy + 0.14, 0), MATERIALS.redSandstone));
  }
  // Corner finials on the top step.
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]] as const) {
    parts.push(part(lathe([[0.12, 0], [0.12, 0.1], [0.07, 0.14], [0.09, 0.2], [0.06, 0.28], [0, 0.34]], 10, 1.2).translate(x, 0, z), MATERIALS.brass));
  }
  // A lotus-like inlay (octagon star) on the top surface.
  const star = new THREE.CylinderGeometry(1.1, 1.1, 0.02, 8).translate(0, 1.21, 0);
  parts.push(part(star, MATERIALS.redSandstone));
  parts.push(part(new THREE.CylinderGeometry(0.8, 0.8, 0.022, 8).rotateY(Math.PI / 8).translate(0, 1.212, 0), MATERIALS.sandstone));
  return parts;
}

export function carvedPillar(): Part[] {
  const parts: Part[] = [];
  parts.push(part(box(0.7, 0.2, 0.7, 0, 0.1, 0), MATERIALS.sandstone));
  parts.push(part(box(0.6, 0.1, 0.6, 0, 0.25, 0), MATERIALS.redSandstone));
  // Shaft with carved rings (bulges) — classic stepped profile.
  const shaft: [number, number][] = [
    [0.26, 0],
    [0.3, 0.08],
    [0.24, 0.2],
    [0.22, 0.7],
    [0.28, 0.8],
    [0.28, 0.9],
    [0.22, 1.0],
    [0.21, 1.6],
    [0.27, 1.7],
    [0.27, 1.8],
    [0.21, 1.9],
    [0.2, 2.3],
    [0.3, 2.4],
  ];
  parts.push(part(faceted(lathe(shaft, 12, 0.3)), MATERIALS.sandstone));
  // Bracket capital.
  parts.push(part(box(0.5, 0.08, 0.5, 0, 2.74, 0), MATERIALS.redSandstone));
  parts.push(part(box(0.7, 0.12, 0.7, 0, 2.84, 0), MATERIALS.sandstone));
  parts.push(part(box(0.9, 0.06, 0.3, 0, 2.93, 0), MATERIALS.sandstone));
  parts.push(part(box(0.3, 0.06, 0.9, 0, 2.97, 0), MATERIALS.sandstone));
  return parts;
}

export function diyaLamp(): Part[] {
  // Bowl with a pinched spout direction suggested by an offset lip.
  const bowl: [number, number][] = [
    [0.0, 0],
    [0.09, 0],
    [0.15, 0.03],
    [0.18, 0.07],
    [0.175, 0.09],
    [0.15, 0.08],
    [0.12, 0.06],
  ];
  const parts: Part[] = [part(lathe(bowl, 16), MATERIALS.terracotta)];
  const spout = new THREE.ConeGeometry(0.05, 0.12, 8).rotateZ(Math.PI / 2).translate(0.2, 0.075, 0);
  parts.push(part(spout, MATERIALS.terracotta));
  parts.push(part(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 16).translate(0, 0.065, 0), MATERIALS.oil));
  // Teardrop flame sitting at the spout.
  const flame: [number, number][] = [
    [0.0, 0],
    [0.03, 0.02],
    [0.045, 0.06],
    [0.035, 0.11],
    [0.015, 0.16],
    [0.0, 0.2],
  ];
  parts.push(part(lathe(flame, 10, 0.085).translate(0.2, 0, 0), MATERIALS.flame));
  return parts;
}

export function stoneTorana(): Part[] {
  const parts: Part[] = [];
  for (const x of [-1.4, 1.4]) {
    parts.push(part(box(0.75, 0.3, 0.75, x, 0.15, 0), MATERIALS.redSandstone));
    parts.push(part(faceted(new THREE.CylinderGeometry(0.26, 0.3, 2.6, 8).translate(x, 1.6, 0)), MATERIALS.redSandstone));
    parts.push(part(box(0.7, 0.3, 0.7, x, 3.05, 0), MATERIALS.redSandstone));
  }
  // Two lintels with slight overhang, and scrolled ends.
  parts.push(part(box(3.9, 0.35, 0.7, 0, 3.375, 0), MATERIALS.redSandstone));
  parts.push(part(box(3.3, 0.25, 0.55, 0, 3.675, 0), MATERIALS.sandstone));
  for (const x of [-2.0, 2.0]) {
    parts.push(part(new THREE.CylinderGeometry(0.17, 0.17, 0.72, 10).rotateX(Math.PI / 2).translate(x, 3.375, 0), MATERIALS.sandstone));
  }
  // Decorative medallions on the lintel.
  for (const x of [-0.9, 0, 0.9]) {
    parts.push(part(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 8).rotateX(Math.PI / 2).translate(x, 3.375, 0.37), MATERIALS.brass));
  }
  // Finial.
  parts.push(part(lathe([[0.2, 0], [0.2, 0.06], [0.1, 0.12], [0.16, 0.22], [0.08, 0.36], [0.03, 0.44], [0, 0.5]], 12, 3.8), MATERIALS.brass));
  return parts;
}

export function kalashPot(): Part[] {
  const pot: [number, number][] = [
    [0.0, 0],
    [0.12, 0],
    [0.14, 0.03],
    [0.23, 0.14],
    [0.25, 0.22],
    [0.2, 0.33],
    [0.1, 0.38],
    [0.09, 0.4],
    [0.13, 0.42],
    [0.12, 0.44],
  ];
  const parts: Part[] = [part(lathe(pot, 16), MATERIALS.brass)];
  parts.push(part(new THREE.SphereGeometry(0.11, 12, 8).scale(1, 1.2, 1).translate(0, 0.54, 0), MATERIALS.coconut));
  // Five mango leaves fanned around the neck.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leaf = new THREE.ConeGeometry(0.05, 0.26, 4)
      .scale(1, 1, 0.3)
      .rotateZ(-1.1)
      .translate(0.13, 0.46, 0)
      .rotateY(a);
    parts.push(part(faceted(leaf), MATERIALS.leaf));
  }
  return parts;
}

export function banyanTree(): Part[] {
  const parts: Part[] = [];
  const trunk: [number, number][] = [
    [0.55, 0],
    [0.42, 0.25],
    [0.34, 0.8],
    [0.3, 1.6],
    [0.34, 2.2],
    [0.2, 2.8],
  ];
  parts.push(part(faceted(lathe(trunk, 9)), MATERIALS.bark));
  // Branches.
  for (const [a, tilt, len] of [[0, 0.9, 1.6], [2.1, 1.0, 1.4], [4.2, 0.85, 1.5]] as const) {
    const b = new THREE.CylinderGeometry(0.08, 0.14, len, 6).translate(0, len / 2, 0).rotateZ(tilt).translate(0, 2.1, 0).rotateY(a);
    parts.push(part(faceted(b), MATERIALS.bark));
  }
  // Aerial roots — the banyan's signature.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const r = 1.2 + ((i * 37) % 5) * 0.15;
    const h = 2.6 + ((i * 13) % 3) * 0.2;
    parts.push(part(new THREE.CylinderGeometry(0.025, 0.035, h, 5).translate(Math.cos(a) * r, h / 2, Math.sin(a) * r), MATERIALS.bark));
  }
  // Canopy: overlapping faceted clusters.
  const clusters: [number, number, number, number, keyof typeof MATERIALS][] = [
    [0, 3.9, 0, 1.6, 'leaf'],
    [1.3, 3.5, 0.4, 1.2, 'leafLight'],
    [-1.2, 3.6, -0.5, 1.25, 'leaf'],
    [0.3, 3.4, -1.3, 1.1, 'leafLight'],
    [-0.5, 3.5, 1.3, 1.1, 'leaf'],
    [0.2, 4.6, 0.2, 1.0, 'leafLight'],
  ];
  for (const [x, y, z, s, m] of clusters) {
    const g = new THREE.IcosahedronGeometry(s, 0).scale(1, 0.7, 1).translate(x, y, z);
    parts.push(part(faceted(g), MATERIALS[m]));
  }
  return parts;
}

export function lowpolyRock(): Part[] {
  const rock = new THREE.DodecahedronGeometry(0.8, 1);
  rock.scale(1.2, 0.8, 1.0);
  rock.translate(0, 0.6, 0);
  return [part(faceted(rock), MATERIALS.stoneGrey)];
}

export function woodenCrate(): Part[] {
  const parts: Part[] = [];
  parts.push(part(box(0.9, 0.9, 0.9, 0, 0.5, 0), MATERIALS.wood));
  parts.push(part(box(1.02, 0.08, 1.02, 0, 0.96, 0), MATERIALS.darkWood));
  parts.push(part(box(1.02, 0.08, 1.02, 0, 0.04, 0), MATERIALS.darkWood));
  for (const [x, z] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]] as const) {
    parts.push(part(box(0.1, 1.0, 0.1, x, 0.5, z), MATERIALS.darkWood));
  }
  return parts;
}

export function groundTile(): Part[] {
  const parts: Part[] = [];
  parts.push(part(box(2.0, 0.3, 2.0, 0, 0.15, 0), MATERIALS.dirtBrown));
  parts.push(part(box(2.02, 0.1, 2.02, 0, 0.35, 0), MATERIALS.grassGreen));
  return parts;
}

export function terracottaUrn(): Part[] {
  const profile: [number, number][] = [
    [0.18, 0],
    [0.18, 0.04],
    [0.32, 0.25],
    [0.36, 0.45],
    [0.22, 0.65],
    [0.18, 0.72],
    [0.24, 0.78],
    [0.2, 0.82],
  ];
  return [part(faceted(lathe(profile, 12)), MATERIALS.terracotta)];
}

export const MODEL_BUILDERS: Record<string, () => Part[]> = {
  'mbs.shrine-platform': shrinePlatform,
  'mbs.carved-pillar': carvedPillar,
  'mbs.diya-lamp': diyaLamp,
  'mbs.stone-torana': stoneTorana,
  'mbs.kalash-pot': kalashPot,
  'mbs.banyan-tree': banyanTree,
  'fo.lowpoly-rock': lowpolyRock,
  'fo.wooden-crate': woodenCrate,
  'fo.ground-tile': groundTile,
  'fo.terracotta-urn': terracottaUrn,
};
