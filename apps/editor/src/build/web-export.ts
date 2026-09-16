import {
  ENGINE_VERSION,
  UserFacingError,
  buildAttribution,
  bytesToBase64,
  jsonForHtmlScript,
  type ProjectManifest,
  type QualityLevel,
  type SceneDocument,
} from '@mythic-forge/core';
import { svc } from '../app/state.ts';

export interface WebBuildOptions {
  debug: boolean;
  quality: QualityLevel | 'auto';
}

export interface WebBuildAsset {
  format: string;
  mime: string;
  mipmaps: boolean;
  data: string;
}

/** The data block embedded in exported games (read by src/player/player-main.ts). */
export interface WebBuildPayload {
  format: 'mythic-forge-web-build';
  formatVersion: 1;
  engineVersion: string;
  builtAt: string;
  debug: boolean;
  quality: QualityLevel | 'auto';
  project: Pick<ProjectManifest, 'name' | 'performanceProfile' | 'customQuality'>;
  scene: SceneDocument;
  assets: Record<string, WebBuildAsset>;
  credits: string[];
  notices: { name: string; version: string; license: string; text: string }[];
}

export interface WebBuildResult {
  bytes: Uint8Array;
  fileName: string;
  assetCount: number;
  assetBytes: number;
  runtimeBytes: number;
  warnings: string[];
}

const MIME: Record<string, string> = {
  glb: 'model/gltf-binary',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
};

/** Runtime packages that end up inside exported games and whose notices must travel with them. */
const PLAYER_PACKAGES = ['three', 'fflate'];

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function referencedAssetIds(scene: SceneDocument): Set<string> {
  const ids = new Set<string>();
  for (const e of Object.values(scene.entities)) {
    const c = e.components;
    if (c.model) ids.add(c.model.assetId);
    if (c.material?.textureAssetId) ids.add(c.material.textureAssetId);
    if (c.audioSource) ids.add(c.audioSource.assetId);
    for (const b of c.behaviours ?? []) if (b.type === 'collectible' && b.soundAssetId) ids.add(b.soundAssetId);
  }
  return ids;
}

/**
 * Builds a single self-contained HTML file that runs the scene in any modern browser
 * (and can be wrapped by the Android/desktop player shells later).
 */
export async function buildWebExport(manifest: ProjectManifest, scene: SceneDocument, options: WebBuildOptions): Promise<WebBuildResult> {
  const { store } = svc();
  const warnings: string[] = [];
  const res = await fetch('./player/mythic-forge-player.js');
  if (!res.ok) {
    throw new UserFacingError('player-missing', 'The game runtime is missing from this installation.', 'player/mythic-forge-player.js was not found. Run `npm run build:player`.');
  }
  const runtime = await res.text();

  const assets: Record<string, WebBuildAsset> = {};
  const credits = new Set<string>();
  let assetBytes = 0;
  for (const id of referencedAssetIds(scene)) {
    const meta = await store.getAsset(manifest.id, id);
    const bytes = meta ? await store.readAssetFile(manifest.id, id) : null;
    if (!meta || !bytes) {
      warnings.push(`An object uses an asset that is missing from the project (${id}); it will be skipped.`);
      continue;
    }
    assets[id] = {
      format: meta.fileFormat,
      mime: MIME[meta.fileFormat] ?? 'application/octet-stream',
      mipmaps: meta.importSettings?.generateMipmaps ?? true,
      data: bytesToBase64(bytes),
    };
    assetBytes += bytes.byteLength;
    const lic = meta.provenance.license;
    if (lic?.attributionRequired) credits.add(buildAttribution(lic));
    else if (meta.provenance.source === 'official') credits.add('Contains assets by Mythic Bharat Studios.');
  }

  let notices: WebBuildPayload['notices'] = [];
  try {
    const list = (await (await fetch('./third-party-licenses.json')).json()) as { packages: { name: string; version: string; license: string; licenseText: string }[] };
    notices = list.packages.filter((p) => PLAYER_PACKAGES.includes(p.name)).map((p) => ({ name: p.name, version: p.version, license: p.license, text: p.licenseText }));
  } catch {
    warnings.push('Open-source notices could not be loaded; add them to your game credits before publishing.');
  }

  const payload: WebBuildPayload = {
    format: 'mythic-forge-web-build',
    formatVersion: 1,
    engineVersion: ENGINE_VERSION,
    builtAt: new Date().toISOString(),
    debug: options.debug,
    quality: options.quality,
    project: { name: manifest.name, performanceProfile: manifest.performanceProfile, customQuality: manifest.customQuality },
    scene,
    assets,
    credits: [...credits],
    notices,
  };

  if (!Object.values(scene.entities).some((e) => e.components.camera?.isMain && e.enabled)) {
    warnings.push('The scene has no enabled Main Camera, so the game will show nothing.');
  }
  if (assetBytes > 50 * 1024 * 1024) warnings.push('This build is large (over 50 MB). Consider reducing texture sizes.');

  const title = escapeHtml(manifest.name);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="Mythic Forge ${ENGINE_VERSION}">
<title>${title}</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:system-ui,sans-serif;color:#fff}#game{position:fixed;inset:0}</style>
</head>
<body>
<div id="game"></div>
<noscript>This game needs JavaScript and WebGL 2.</noscript>
<script id="mf-data" type="application/json">${jsonForHtmlScript(payload)}</script>
<script>${runtime.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
  const bytes = new TextEncoder().encode(html);
  const safe = manifest.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-') || 'game';
  return {
    bytes,
    fileName: `${safe}${options.debug ? '-debug' : ''}.html`,
    assetCount: Object.keys(assets).length,
    assetBytes,
    runtimeBytes: runtime.length,
    warnings,
  };
}
