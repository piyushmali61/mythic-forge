import { log, type FileFormat } from '@mythic-forge/core';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { decodeTexture, downscaleTexture } from './images.ts';
import { parseGlb } from './glb.ts';

export interface LoadedAssetBytes {
  bytes: Uint8Array;
  format: FileFormat;
  generateMipmaps: boolean;
}

/** Where the renderer gets asset bytes from (project store, exported build, library). */
export interface AssetSource {
  load(assetId: string): Promise<LoadedAssetBytes | null>;
}

const TEXTURE_MIME: Partial<Record<FileFormat, string>> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

/**
 * Loads each model/texture once and hands out clones. Nothing is loaded until an entity
 * actually needs it (lazy), and `trim` unloads assets no entity references any more.
 */
export class AssetCache {
  private models = new Map<string, Promise<THREE.Object3D | null>>();
  private textures = new Map<string, Promise<THREE.Texture | null>>();
  private readonly source: AssetSource;
  private textureMaxSize: number;

  constructor(source: AssetSource, textureMaxSize: number) {
    this.source = source;
    this.textureMaxSize = textureMaxSize;
  }

  get loadedCount(): number {
    return this.models.size + this.textures.size;
  }

  /** Resolves when every asset requested so far has finished loading (or failed). */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.models.values(), ...this.textures.values()]);
  }

  /** Returns a fresh instance of the model (skinned meshes are cloned correctly). */
  async model(assetId: string): Promise<THREE.Object3D | null> {
    let entry = this.models.get(assetId);
    if (!entry) {
      entry = this.loadModel(assetId);
      this.models.set(assetId, entry);
    }
    const template = await entry;
    if (!template) return null;
    let skinned = false;
    template.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    });
    return skinned ? cloneSkinned(template) : template.clone(true);
  }

  async texture(assetId: string): Promise<THREE.Texture | null> {
    let entry = this.textures.get(assetId);
    if (!entry) {
      entry = this.loadTexture(assetId);
      this.textures.set(assetId, entry);
    }
    return entry;
  }

  /** Changing the limit reloads textures lazily on next use. */
  setTextureMaxSize(max: number): void {
    if (max === this.textureMaxSize) return;
    this.textureMaxSize = max;
    void this.disposeTextures();
  }

  invalidate(assetId: string): void {
    void this.models.get(assetId)?.then((m) => m && disposeTemplate(m));
    void this.textures.get(assetId)?.then((t) => t?.dispose());
    this.models.delete(assetId);
    this.textures.delete(assetId);
  }

  /** Frees assets that are no longer referenced by the scene. */
  trim(inUse: ReadonlySet<string>): void {
    for (const id of [...this.models.keys(), ...this.textures.keys()]) {
      if (!inUse.has(id)) this.invalidate(id);
    }
  }

  async dispose(): Promise<void> {
    for (const p of this.models.values()) {
      const m = await p;
      if (m) disposeTemplate(m);
    }
    this.models.clear();
    await this.disposeTextures();
  }

  private async disposeTextures(): Promise<void> {
    const list = [...this.textures.values()];
    this.textures.clear();
    for (const p of list) (await p)?.dispose();
  }

  private async loadModel(assetId: string): Promise<THREE.Object3D | null> {
    try {
      const data = await this.source.load(assetId);
      if (!data) {
        log.warn('Assets', `Model asset ${assetId} is missing from the project.`);
        return null;
      }
      if (data.format !== 'glb') {
        log.warn('Assets', `Model asset ${assetId} is not in the optimised GLB format.`);
        return null;
      }
      const { root } = await parseGlb(data.bytes);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const map = (m as THREE.MeshStandardMaterial).map;
          if (map) {
            downscaleTexture(map, this.textureMaxSize);
            map.generateMipmaps = data.generateMipmaps;
            if (!data.generateMipmaps) map.minFilter = THREE.LinearFilter;
          }
        }
      });
      return root;
    } catch (error) {
      log.error('Assets', 'A model could not be loaded.', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private async loadTexture(assetId: string): Promise<THREE.Texture | null> {
    try {
      const data = await this.source.load(assetId);
      const mime = data ? TEXTURE_MIME[data.format] : undefined;
      if (!data || !mime) return null;
      return await decodeTexture(data.bytes, mime, this.textureMaxSize, data.generateMipmaps);
    } catch (error) {
      log.error('Assets', 'A texture could not be loaded.', error instanceof Error ? error.message : String(error));
      return null;
    }
  }
}

function disposeTemplate(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
  });
}
