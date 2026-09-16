import {
  UserFacingError,
  stripExtension,
  type AssetStats,
  type FileFormat,
  type ImportSettings,
} from '@mythic-forge/core';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasToBytes, decodeTexture, downscaleTexture, fitSize, imageSize, makeCanvas, textureBytesEstimate } from './images.ts';
import { parseGlb, type InputFile, type ParsedModel } from './glb.ts';
import { parseModel } from './model-parse.ts';

/** Recommended ceilings for mobile-friendly assets (warnings, not hard limits). */
export const MOBILE_RECOMMENDED = { triangles: 100_000, textureSize: 2048, bones: 64 };

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'lightMap',
  'displacementMap',
] as const;

export interface TextureInfo {
  name: string;
  width: number;
  height: number;
  gpuBytes: number;
}

export interface ModelAnalysis {
  name: string;
  format: FileFormat;
  fileBytes: number;
  stats: AssetStats;
  textures: TextureInfo[];
  geometryBytes: number;
  warnings: string[];
  /** Parsed scene, used by `optimizeModel`. Not serialisable. */
  parsed: ParsedModel;
}

function collect(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bones = new Set<THREE.Bone>();
  let meshes = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    geometries.add(mesh.geometry);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      materials.add(m);
      for (const slot of TEXTURE_SLOTS) {
        const tex = (m as unknown as Record<string, unknown>)[slot];
        if (tex instanceof THREE.Texture) textures.add(tex);
      }
    }
    const skinned = obj as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) for (const b of skinned.skeleton.bones) bones.add(b);
  });
  return { geometries, materials, textures, bones, meshes };
}

function geometryStats(geometries: Set<THREE.BufferGeometry>): { vertices: number; triangles: number; bytes: number } {
  let vertices = 0;
  let triangles = 0;
  let bytes = 0;
  for (const g of geometries) {
    const pos = g.getAttribute('position');
    if (!pos) continue;
    vertices += pos.count;
    triangles += Math.floor((g.index ? g.index.count : pos.count) / 3);
    for (const name of Object.keys(g.attributes)) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute;
      bytes += attr.array?.byteLength ?? 0;
    }
    bytes += g.index?.array.byteLength ?? 0;
  }
  return { vertices, triangles, bytes };
}

export function analyzeParsed(parsed: ParsedModel, name: string, format: FileFormat, fileBytes: number, warnings: string[]): ModelAnalysis {
  const { geometries, materials, textures, bones, meshes } = collect(parsed.root);
  const geo = geometryStats(geometries);
  const textureInfos: TextureInfo[] = [];
  let textureBytes = 0;
  for (const t of textures) {
    const size = imageSize(t.image);
    if (!size) continue;
    const gpu = textureBytesEstimate(size.width, size.height, t.generateMipmaps !== false);
    textureBytes += gpu;
    textureInfos.push({ name: t.name || 'texture', width: size.width, height: size.height, gpuBytes: gpu });
  }
  parsed.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(parsed.root);
  const empty = box.isEmpty();
  if (meshes === 0) warnings.push('The file contains no meshes.');
  if (geo.triangles > MOBILE_RECOMMENDED.triangles) {
    warnings.push(`Model has ${geo.triangles.toLocaleString()} triangles; the recommended maximum for phones is ${MOBILE_RECOMMENDED.triangles.toLocaleString()}.`);
  }
  const bigTextures = textureInfos.filter((t) => Math.max(t.width, t.height) > MOBILE_RECOMMENDED.textureSize);
  if (bigTextures.length) warnings.push(`${bigTextures.length} texture(s) are larger than ${MOBILE_RECOMMENDED.textureSize}px.`);
  if (bones.size > MOBILE_RECOMMENDED.bones) warnings.push(`Skeleton has ${bones.size} bones; low-end phones may struggle above ${MOBILE_RECOMMENDED.bones}.`);
  if (parsed.animations.length > 0) {
    warnings.push('Animations are kept in the file, but animation playback is NOT IMPLEMENTED in Mythic Forge 0.1.');
  }
  return {
    name,
    format,
    fileBytes,
    stats: {
      vertices: geo.vertices,
      triangles: geo.triangles,
      meshes,
      materials: materials.size,
      textures: textures.size,
      animations: parsed.animations.length,
      bones: bones.size,
      ...(empty
        ? {}
        : {
            boundsMin: [box.min.x, box.min.y, box.min.z],
            boundsMax: [box.max.x, box.max.y, box.max.z],
          }),
      gpuBytesEstimate: geo.bytes + textureBytes,
    },
    textures: textureInfos,
    geometryBytes: geo.bytes,
    warnings,
    parsed,
  };
}

/** Step 1 of the import workflow: parse and report, without changing anything. */
export async function analyzeModel(main: InputFile, format: FileFormat, companions: readonly InputFile[]): Promise<ModelAnalysis> {
  const warnings: string[] = [];
  const parsed = await parseModel(main, format, companions, warnings);
  const total = main.bytes.byteLength + companions.reduce((s, f) => s + f.bytes.byteLength, 0);
  return analyzeParsed(parsed, stripExtension(main.name), format, total, warnings);
}

/** Quick estimate of GPU memory after optimisation, shown before the user presses Import. */
export function estimateOptimizedGpuBytes(analysis: ModelAnalysis, settings: ImportSettings): number {
  let textures = 0;
  for (const t of analysis.textures) {
    const size = fitSize(t.width, t.height, settings.maxTextureSize);
    textures += textureBytesEstimate(size.width, size.height, settings.generateMipmaps);
  }
  const geometry = settings.optimizeMesh ? Math.round(analysis.geometryBytes * 0.8) : analysis.geometryBytes;
  return geometry + textures;
}

export interface OptimizeResult {
  bytes: Uint8Array;
  analysis: ModelAnalysis;
  notes: string[];
}

/** Step 2: apply the chosen optimisations and write a self-contained GLB. */
export async function optimizeModel(analysis: ModelAnalysis, settings: ImportSettings): Promise<OptimizeResult> {
  const notes: string[] = [];
  const { root, animations } = analysis.parsed;
  const { textures } = collect(root);

  if (settings.optimizeMesh) {
    let before = 0;
    let after = 0;
    // Shared geometries are merged once and reused by every mesh that referenced them.
    const replaced = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      const g = mesh.geometry;
      const existing = replaced.get(g);
      if (existing) {
        mesh.geometry = existing;
        return;
      }
      const pos = g.getAttribute('position');
      if (!pos) return;
      try {
        const merged = mergeVertices(g);
        before += pos.count;
        after += merged.getAttribute('position').count;
        replaced.set(g, merged);
        mesh.geometry = merged;
      } catch {
        // Some attribute layouts can't be merged; keep the original.
      }
    });
    for (const original of replaced.keys()) original.dispose();
    if (before > 0) notes.push(`Merged duplicate vertices: ${before.toLocaleString()} → ${after.toLocaleString()}.`);
  }

  let resized = 0;
  for (const tex of textures) {
    if (downscaleTexture(tex, settings.maxTextureSize)) resized++;
    tex.userData.mimeType = settings.compressTextures ? 'image/webp' : tex.userData.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    tex.generateMipmaps = settings.generateMipmaps;
  }
  if (resized) notes.push(`Resized ${resized} texture(s) to at most ${settings.maxTextureSize}px.`);
  if (settings.compressTextures && textures.size) notes.push('Textures re-encoded as WebP.');
  if (settings.removeUnused) notes.push('Unused materials, textures and hidden nodes were dropped.');

  let output: ArrayBuffer;
  try {
    output = (await new GLTFExporter().parseAsync(root, {
      binary: true,
      animations,
      onlyVisible: settings.removeUnused,
      maxTextureSize: Infinity,
    })) as ArrayBuffer;
  } catch (error) {
    throw new UserFacingError('import-export', 'The optimised model could not be written.', String(error));
  }
  const bytes = new Uint8Array(output);
  // Re-analyse what we actually wrote so the numbers shown are real.
  const reparsed = await parseGlb(bytes);
  const after = analyzeParsed(reparsed, analysis.name, 'glb', bytes.byteLength, []);
  return { bytes, analysis: after, notes };
}

// ---- textures & audio --------------------------------------------------------------------------

export interface TextureImportResult {
  bytes: Uint8Array;
  format: FileFormat;
  fileName: string;
  stats: AssetStats;
  notes: string[];
}

const MIME_BY_FORMAT: Partial<Record<FileFormat, string>> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

export async function importTexture(file: InputFile, format: FileFormat, settings: ImportSettings): Promise<TextureImportResult> {
  const mime = MIME_BY_FORMAT[format];
  if (!mime) throw new UserFacingError('import-format', 'This file is not an image.');
  const blob = new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: mime });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (error) {
    throw new UserFacingError('import-image', 'This image could not be decoded.', String(error));
  }
  const notes: string[] = [];
  const target = fitSize(bitmap.width, bitmap.height, settings.maxTextureSize);
  const needsResize = target.width !== bitmap.width || target.height !== bitmap.height;
  const reencode = settings.compressTextures && format !== 'webp';
  let bytes = file.bytes;
  let outFormat = format;
  if (needsResize || reencode) {
    const canvas = makeCanvas(target.width, target.height);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new UserFacingError('import-image', 'Image processing is not available on this device.');
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    const type = settings.compressTextures ? 'image/webp' : mime;
    const encoded = await canvasToBytes(canvas, type, settings.textureQuality);
    // Keep the original if "compression" made it bigger and no resize was needed.
    if (needsResize || encoded.byteLength < bytes.byteLength) {
      bytes = encoded;
      outFormat = type === 'image/webp' ? 'webp' : format;
      if (needsResize) notes.push(`Resized from ${bitmap.width}×${bitmap.height} to ${target.width}×${target.height}.`);
      if (outFormat === 'webp' && format !== 'webp') notes.push('Re-encoded as WebP.');
    } else {
      notes.push('Kept the original file (re-encoding would not make it smaller).');
    }
  }
  bitmap.close();
  const ext = outFormat === 'jpeg' ? 'jpg' : outFormat;
  return {
    bytes,
    format: outFormat,
    fileName: `${stripExtension(file.name) || 'texture'}.${ext}`,
    stats: {
      width: target.width,
      height: target.height,
      gpuBytesEstimate: textureBytesEstimate(target.width, target.height, settings.generateMipmaps),
    },
    notes,
  };
}

/** Reads the duration from metadata only (no full decode). */
export function probeAudioDuration(bytes: Uint8Array, mime: string): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
    const audio = new Audio();
    audio.preload = 'metadata';
    const finish = (value: number | null): void => {
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      resolve(value);
    };
    audio.addEventListener('loadedmetadata', () => finish(Number.isFinite(audio.duration) ? audio.duration : null), { once: true });
    audio.addEventListener('error', () => finish(null), { once: true });
    setTimeout(() => finish(null), 5000);
    audio.src = url;
  });
}

export { decodeTexture };
export { parseModel } from './model-parse.ts';
export type { InputFile } from './glb.ts';
