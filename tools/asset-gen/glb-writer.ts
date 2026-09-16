import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export interface MaterialSpec {
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  emissive?: string;
  emissiveStrength?: number;
}

export interface Part {
  geometry: THREE.BufferGeometry;
  material: MaterialSpec;
}

export interface GlbStats {
  vertices: number;
  triangles: number;
  materials: number;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
  gpuBytesEstimate: number;
}

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

const hexToLinear = (hex: string): [number, number, number] => {
  const c = new THREE.Color(hex); // three converts sRGB hex to linear working space
  return [c.r, c.g, c.b];
};

/**
 * Minimal, dependency-free glTF 2.0 binary writer for generated meshes:
 * one node, one mesh, one primitive per material. Enough for the official asset pack.
 */
export function writeGlb(name: string, parts: readonly Part[], copyright: string): { bytes: Uint8Array; stats: GlbStats } {
  // Group by material so each material becomes a single draw call.
  const groups = new Map<string, { material: MaterialSpec; geometries: THREE.BufferGeometry[] }>();
  for (const p of parts) {
    const key = JSON.stringify(p.material);
    const g = p.geometry.index ? p.geometry : mergeVertices(p.geometry);
    for (const attr of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(attr)) g.deleteAttribute(attr);
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    const entry = groups.get(key) ?? { material: p.material, geometries: [] };
    entry.geometries.push(g);
    groups.set(key, entry);
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const addView = (data: ArrayBufferView, target: number): number => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      byteLength += pad;
    }
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, target });
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };

  const materials: Record<string, unknown>[] = [];
  const primitives: Record<string, unknown>[] = [];
  const extensionsUsed = new Set<string>();
  let vertices = 0;
  let triangles = 0;
  const box = new THREE.Box3();

  for (const { material, geometries } of groups.values()) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error(`Could not merge geometry for ${name}/${material.name}`);
    merged.computeBoundingBox();
    box.union(merged.boundingBox!);
    const pos = merged.getAttribute('position') as THREE.BufferAttribute;
    const nor = merged.getAttribute('normal') as THREE.BufferAttribute;
    const uv = merged.getAttribute('uv') as THREE.BufferAttribute;
    const index = merged.index!;
    vertices += pos.count;
    triangles += index.count / 3;

    const posArr = new Float32Array(pos.array);
    const accPos = accessors.push({
      bufferView: addView(posArr, ARRAY_BUFFER),
      componentType: FLOAT,
      count: pos.count,
      type: 'VEC3',
      min: merged.boundingBox!.min.toArray(),
      max: merged.boundingBox!.max.toArray(),
    }) - 1;
    const accNor = accessors.push({ bufferView: addView(new Float32Array(nor.array), ARRAY_BUFFER), componentType: FLOAT, count: nor.count, type: 'VEC3' }) - 1;
    const accUv = accessors.push({ bufferView: addView(new Float32Array(uv.array), ARRAY_BUFFER), componentType: FLOAT, count: uv.count, type: 'VEC2' }) - 1;
    const wide = pos.count > 65535;
    const indices = wide ? new Uint32Array(index.array) : new Uint16Array(index.array);
    const accIdx = accessors.push({
      bufferView: addView(indices, ELEMENT_ARRAY_BUFFER),
      componentType: wide ? UNSIGNED_INT : UNSIGNED_SHORT,
      count: index.count,
      type: 'SCALAR',
    }) - 1;

    const mat: Record<string, unknown> = {
      name: material.name,
      pbrMetallicRoughness: {
        baseColorFactor: [...hexToLinear(material.color), 1],
        metallicFactor: material.metalness,
        roughnessFactor: material.roughness,
      },
    };
    if (material.emissive) {
      mat.emissiveFactor = hexToLinear(material.emissive);
      if ((material.emissiveStrength ?? 1) !== 1) {
        mat.extensions = { KHR_materials_emissive_strength: { emissiveStrength: material.emissiveStrength } };
        extensionsUsed.add('KHR_materials_emissive_strength');
      }
    }
    materials.push(mat);
    primitives.push({
      attributes: { POSITION: accPos, NORMAL: accNor, TEXCOORD_0: accUv },
      indices: accIdx,
      material: materials.length - 1,
      mode: 4,
    });
  }

  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'Mythic Forge asset-gen', copyright },
    scene: 0,
    scenes: [{ name, nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: 0 }],
  };
  if (extensionsUsed.size) json.extensionsUsed = [...extensionsUsed];

  const binPad = (4 - (byteLength % 4)) % 4;
  if (binPad) {
    chunks.push(new Uint8Array(binPad));
    byteLength += binPad;
  }
  (json.buffers as { byteLength: number }[])[0]!.byteLength = byteLength;

  let jsonText = JSON.stringify(json);
  while (Buffer.byteLength(jsonText) % 4 !== 0) jsonText += ' ';
  const jsonBytes = new TextEncoder().encode(jsonText);
  const total = 12 + 8 + jsonBytes.byteLength + 8 + byteLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.byteLength;
  dv.setUint32(o, byteLength, true);
  dv.setUint32(o + 4, 0x004e4942, true); // 'BIN\0'
  o += 8;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }

  const gpuBytesEstimate = vertices * (12 + 12 + 8) + triangles * 3 * (vertices > 65535 ? 4 : 2);
  const r = (v: number): number => Math.round(v * 1000) / 1000;
  return {
    bytes: out,
    stats: {
      vertices,
      triangles,
      materials: materials.length,
      boundsMin: [r(box.min.x), r(box.min.y), r(box.min.z)],
      boundsMax: [r(box.max.x), r(box.max.y), r(box.max.z)],
      gpuBytesEstimate,
    },
  };
}
