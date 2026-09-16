import type { Vec3 } from '../math/vec3.ts';
import type { FileFormat } from '../security/file-types.ts';
import type { AssetLicenseRecord } from './license.ts';

export type AssetKind = 'model' | 'texture' | 'audio';

export interface AssetStats {
  vertices?: number;
  triangles?: number;
  meshes?: number;
  materials?: number;
  textures?: number;
  animations?: number;
  bones?: number;
  boundsMin?: Vec3;
  boundsMax?: Vec3;
  width?: number;
  height?: number;
  durationSec?: number;
  /** Estimated GPU memory once loaded (vertex/index buffers + textures incl. mipmaps). */
  gpuBytesEstimate?: number;
}

export type AssetSource = 'user-import' | 'official' | 'free-open';

export interface AssetProvenance {
  source: AssetSource;
  /** User imports: the user confirmed they have the right to use the file. */
  userConfirmedRights: boolean;
  originalFileName: string;
  /** Library assets: which catalog entry and version this came from. */
  catalogId: string | null;
  catalogVersion: string | null;
  /** Library assets carry their licence record so it travels with the project. */
  license: AssetLicenseRecord | null;
}

export interface AssetFileRecord {
  name: string;
  size: number;
  sha256: string;
}

export interface ImportSettings {
  compressTextures: boolean;
  textureQuality: number;
  maxTextureSize: number;
  generateMipmaps: boolean;
  optimizeMesh: boolean;
  removeUnused: boolean;
  generateCollider: boolean;
}

export const DEFAULT_IMPORT_SETTINGS: ImportSettings = {
  compressTextures: true,
  textureQuality: 0.85,
  maxTextureSize: 2048,
  generateMipmaps: true,
  optimizeMesh: true,
  removeUnused: true,
  generateCollider: true,
};

/** Stored at `assets/<id>/asset.meta.json` inside a project. */
export interface ProjectAssetMeta {
  format: 'mythic-forge-asset';
  formatVersion: 1;
  id: string;
  name: string;
  kind: AssetKind;
  fileFormat: FileFormat;
  /** File name of the primary file inside the asset folder. */
  mainFile: string;
  files: AssetFileRecord[];
  importedAt: string;
  originalBytes: number;
  storedBytes: number;
  provenance: AssetProvenance;
  importSettings: ImportSettings | null;
  stats: AssetStats;
}
