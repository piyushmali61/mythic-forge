import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { isWindowsExecutable, launcherConfig, packageWindowsGame } from '../src/build/windows-package.ts';

const root = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const launcher = new Uint8Array(readFileSync(root('apps/editor/public/export/windows-game-launcher.bin')));
const manifest = JSON.parse(readFileSync(root('apps/editor/public/export/windows-game-launcher.json'), 'utf8')) as {
  sourceSha256: string;
  sha256: string;
  size: number;
};

describe('Windows game launcher binary', () => {
  it('is a Windows executable matching its manifest', () => {
    expect(isWindowsExecutable(launcher)).toBe(true);
    expect(launcher.byteLength).toBe(manifest.size);
    expect(sha256(launcher)).toBe(manifest.sha256);
  });

  it('was built from the current GameLauncher.cs (run tools/desktop/build-game-launcher.py after editing it)', () => {
    expect(sha256(new Uint8Array(readFileSync(root('tools/desktop/GameLauncher.cs'))))).toBe(manifest.sourceSha256);
  });
});

describe('packageWindowsGame', () => {
  it('zips the launcher, game and instructions into one folder', () => {
    const html = new TextEncoder().encode('<!doctype html><title>x</title>');
    const zip = packageWindowsGame({ gameName: 'Shrine of Lamps', fileBase: 'Shrine-of-Lamps', launcher, html });
    expect(zip.fileName).toBe('Shrine-of-Lamps-windows.zip');
    const files = unzipSync(zip.bytes);
    expect(Object.keys(files).sort()).toEqual([
      'Shrine-of-Lamps/README.txt',
      'Shrine-of-Lamps/Shrine-of-Lamps.exe',
      'Shrine-of-Lamps/game.html',
      'Shrine-of-Lamps/launcher.txt',
    ]);
    expect(files['Shrine-of-Lamps/Shrine-of-Lamps.exe']).toEqual(launcher);
    expect(files['Shrine-of-Lamps/game.html']).toEqual(html);
    expect(new TextDecoder().decode(files['Shrine-of-Lamps/README.txt'])).toContain('Double-click Shrine-of-Lamps.exe');
  });

  it('keeps project names from injecting launcher settings or unsafe file names', () => {
    expect(launcherConfig('Evil\r\nwidth=1\r\nheight=1')).toBe('title=Evil  width 1  height 1\r\nwidth=1280\r\nheight=720\r\n');
    const zip = packageWindowsGame({ gameName: 'x', fileBase: 'CON', launcher, html: new Uint8Array(1) });
    expect(Object.keys(unzipSync(zip.bytes))).toContain('game/game.exe');
  });

  it('refuses a launcher that is not an executable', () => {
    expect(() => packageWindowsGame({ gameName: 'x', fileBase: 'x', launcher: new Uint8Array(4096), html: new Uint8Array(1) })).toThrow(/damaged/);
  });
});
