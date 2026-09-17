import { UserFacingError, type ProjectManifest, type SceneDocument } from '@mythic-forge/core';
import { buildWebExport, type BuildResult, type WebBuildOptions } from './web-export.ts';
import { packageWindowsGame } from './windows-package.ts';

/** Prebuilt by tools/desktop/build-game-launcher.py and shipped with the editor. */
const LAUNCHER_URL = './export/windows-game-launcher.bin';

/**
 * Builds a portable Windows package around the single-file web build. Needs no SDK or network,
 * so it works on every device the editor runs on, phones included.
 */
export async function buildWindowsExport(manifest: ProjectManifest, scene: SceneDocument, options: WebBuildOptions): Promise<BuildResult> {
  const web = await buildWebExport(manifest, scene, options);
  const res = await fetch(LAUNCHER_URL);
  if (!res.ok) {
    throw new UserFacingError('launcher-missing', 'The Windows launcher is missing from this installation.', `${LAUNCHER_URL} was not found.`);
  }
  const launcher = new Uint8Array(await res.arrayBuffer());
  const zip = packageWindowsGame({ gameName: manifest.name, fileBase: web.fileName.replace(/\.html$/, ''), launcher, html: web.bytes });
  return {
    ...web,
    bytes: zip.bytes,
    fileName: zip.fileName,
    mime: 'application/zip',
    warnings: [...web.warnings, 'The launcher is not code-signed: Windows SmartScreen may ask players to confirm the first run.'],
  };
}
