import { fileExtension, safeRelativePath } from '@mythic-forge/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface InputFile {
  name: string;
  bytes: Uint8Array;
}

export interface ParsedModel {
  root: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bin: 'application/octet-stream',
  mtl: 'text/plain',
};

export const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

export interface SandboxedManager {
  manager: THREE.LoadingManager;
  /** Resolves once every resource that started loading has finished (or failed). */
  settled(timeoutMs?: number): Promise<void>;
  revoke(): void;
}

/**
 * A loading manager that can only resolve resources from the files the user selected
 * (or embedded data URIs). Untrusted models can therefore never make network requests
 * or read other files — external references simply fail to load.
 */
export function sandboxedManager(companions: readonly InputFile[], blocked: string[]): SandboxedManager {
  const urls = new Map<string, string>();
  const byName = new Map<string, InputFile>();
  for (const f of companions) byName.set((f.name.split(/[\\/]/).pop() ?? f.name).toLowerCase(), f);

  let busy = false;
  let waiters: (() => void)[] = [];
  const manager = new THREE.LoadingManager();
  manager.onStart = () => {
    busy = true;
  };
  manager.onLoad = () => {
    busy = false;
    const w = waiters;
    waiters = [];
    for (const fn of w) fn();
  };
  manager.setURLModifier((url) => {
    if (url.startsWith('data:application/octet-stream') || url.startsWith('data:image/') || url.startsWith('blob:')) {
      return url;
    }
    let key: string;
    try {
      key = (safeRelativePath(decodeURIComponent(url)).split('/').pop() ?? '').toLowerCase();
    } catch {
      blocked.push(url);
      return 'data:,';
    }
    const file = byName.get(key);
    if (!file) {
      blocked.push(url);
      return 'data:,';
    }
    let objectUrl = urls.get(key);
    if (!objectUrl) {
      objectUrl = URL.createObjectURL(
        new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: MIME[fileExtension(file.name)] ?? 'application/octet-stream' }),
      );
      urls.set(key, objectUrl);
    }
    return objectUrl;
  });
  return {
    manager,
    settled: (timeoutMs = 15_000) =>
      new Promise<void>((resolve) => {
        if (!busy) {
          resolve();
          return;
        }
        const timer = setTimeout(resolve, timeoutMs);
        waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      }),
    revoke: () => {
      for (const u of urls.values()) URL.revokeObjectURL(u);
      urls.clear();
    },
  };
}

/** Parses glTF (binary or JSON with companion files) inside the sandbox. */
export async function parseGltf(main: InputFile, binary: boolean, companions: readonly InputFile[], sandbox: SandboxedManager): Promise<ParsedModel> {
  const loader = new GLTFLoader(sandbox.manager);
  const data = binary ? toArrayBuffer(main.bytes) : new TextDecoder().decode(main.bytes);
  const gltf = await loader.parseAsync(data, '');
  return { root: gltf.scene, animations: gltf.animations };
}

/** Parses a self-contained GLB (project and library assets, exported games). */
export async function parseGlb(bytes: Uint8Array): Promise<ParsedModel> {
  const sandbox = sandboxedManager([], []);
  try {
    return await parseGltf({ name: 'model.glb', bytes }, true, [], sandbox);
  } finally {
    setTimeout(() => sandbox.revoke(), 5000);
  }
}
