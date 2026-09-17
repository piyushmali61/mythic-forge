import type { MaterialPresetValues } from '@mythic-forge/core';
import * as THREE from 'three';
import { canvasToBytes, makeCanvas } from './assets/images.ts';
import { parseGlb } from './assets/glb.ts';
import { buildLods } from './assets/lod.ts';

const IDLE_RELEASE_MS = 20_000;

/**
 * Renders small previews for the asset library. Work is serialised (one job at a time), only
 * happens for cards the user is looking at, and the GPU context is released when idle.
 */
export class ThumbnailRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  renderModel(bytes: Uint8Array, size: number): Promise<Uint8Array> {
    return this.enqueue(async () => {
      const { root } = await parseGlb(bytes);
      buildLods(root);
      try {
        return await this.capture(root, size);
      } finally {
        disposeTree(root);
      }
    });
  }

  renderMaterial(values: MaterialPresetValues, size: number): Promise<Uint8Array> {
    return this.enqueue(async () => {
      const material = new THREE.MeshStandardMaterial({
        color: values.color,
        metalness: values.metalness,
        roughness: values.roughness,
        emissive: values.emissive,
        emissiveIntensity: values.emissiveIntensity,
        flatShading: values.flatShading,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), material);
      try {
        return await this.capture(mesh, size);
      } finally {
        disposeTree(mesh);
      }
    });
  }

  dispose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
    this.canvas = null;
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    void next.finally(() => this.scheduleRelease());
    return next;
  }

  private scheduleRelease(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.dispose(), IDLE_RELEASE_MS);
  }

  private async capture(object: THREE.Object3D, size: number): Promise<Uint8Array> {
    if (!this.renderer) {
      this.canvas = document.createElement('canvas');
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    const renderer = this.renderer;
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a2420, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    scene.add(object);

    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const sphere = box.isEmpty() ? new THREE.Sphere(new THREE.Vector3(), 1) : box.getBoundingSphere(new THREE.Sphere());
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(35) / 2);
    camera.position.copy(sphere.center).add(new THREE.Vector3(0.9, 0.6, 1).normalize().multiplyScalar(distance * 1.05));
    camera.lookAt(sphere.center);

    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    const out = makeCanvas(size, size);
    const ctx = out.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    ctx?.drawImage(this.canvas!, 0, 0);
    scene.remove(object);
    return canvasToBytes(out, 'image/webp', 0.82);
  }
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
