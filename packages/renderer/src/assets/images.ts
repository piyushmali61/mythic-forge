import * as THREE from 'three';

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

export async function canvasToBytes(canvas: AnyCanvas, type: string, quality?: number): Promise<Uint8Array> {
  let blob: Blob | null;
  if ('convertToBlob' in canvas) {
    blob = await canvas.convertToBlob({ type, ...(quality !== undefined ? { quality } : {}) });
  } else {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  }
  if (!blob) throw new Error('Image encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}

type ImageLike = { width: number; height: number };

export function imageSize(image: unknown): { width: number; height: number } | null {
  const img = image as Partial<ImageLike> | null;
  if (!img || typeof img.width !== 'number' || typeof img.height !== 'number') return null;
  return { width: img.width, height: img.height };
}

/** Fits (w, h) inside `max` preserving aspect ratio. */
export function fitSize(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Downscales a texture's image in place when it exceeds `max` (keeps aspect ratio).
 * Returns true if the image was replaced.
 */
export function downscaleTexture(texture: THREE.Texture, max: number): boolean {
  const size = imageSize(texture.image);
  if (!size || Math.max(size.width, size.height) <= max) return false;
  const target = fitSize(size.width, size.height, max);
  const canvas = makeCanvas(target.width, target.height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return false;
  ctx.drawImage(texture.image as CanvasImageSource, 0, 0, target.width, target.height);
  const old = texture.image as { close?: () => void };
  texture.image = canvas;
  old.close?.();
  texture.needsUpdate = true;
  return true;
}

export function textureBytesEstimate(width: number, height: number, mipmaps: boolean): number {
  return Math.round(width * height * 4 * (mipmaps ? 4 / 3 : 1));
}

/** Decodes image bytes into a texture, downscaled to `max` during decode where supported. */
export async function decodeTexture(bytes: Uint8Array, mime: string, max: number, mipmaps = true): Promise<THREE.Texture> {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
  const probe = await createImageBitmap(blob);
  const target = fitSize(probe.width, probe.height, max);
  probe.close();
  // WebGL ignores flipY for ImageBitmaps, so flip during decode (and resize in the same step).
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: 'flipY',
    resizeWidth: target.width,
    resizeHeight: target.height,
    resizeQuality: 'high',
  });
  const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  texture.flipY = false;
  texture.addEventListener('dispose', () => bitmap.close());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = mipmaps;
  texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
