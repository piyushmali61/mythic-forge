import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  ArchiveError,
  MOBILE_LIMITS,
  checkImportFile,
  clampLimits,
  createZip,
  isBlockedExtension,
  readImageSize,
  safeRelativePath,
  safeUnzip,
  sanitizeFileName,
  sniffFormat,
} from '../src/index.ts';

const png = (w: number, h: number): Uint8Array => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
const text = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('safeRelativePath', () => {
  it('normalises benign paths', () => {
    expect(safeRelativePath('a/b/c.png')).toBe('a/b/c.png');
    expect(safeRelativePath('a\\b\\c.png')).toBe('a/b/c.png');
    expect(safeRelativePath('./a//b/')).toBe('a/b');
  });

  it.each([
    '../secret',
    'a/../../b',
    '/etc/passwd',
    'C:\\Windows\\system.ini',
    'c:relative',
    'file:///etc/passwd',
    'https://evil.example/x',
    'a/CON',
    'a/nul.txt',
    'bad\u0000name',
    'trailing./x',
    '',
    '...',
  ])('rejects %j', (p) => {
    expect(() => safeRelativePath(p)).toThrow();
  });

  it('sanitises file names without throwing', () => {
    expect(sanitizeFileName('../../evil.exe')).toBe('evil.exe');
    expect(sanitizeFileName('C:\\x\\model.glb')).toBe('model.glb');
    expect(sanitizeFileName('con')).toBe('file');
    expect(sanitizeFileName('a<b>c.png')).toBe('a_b_c.png');
    expect(sanitizeFileName('   ')).toBe('file');
  });
});

describe('file type validation', () => {
  it('sniffs formats by content', () => {
    expect(sniffFormat(text('glTF\x02\x00\x00\x00'))).toBe('glb');
    expect(sniffFormat(png(4, 4))).toBe('png');
    expect(sniffFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffFormat(text('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(sniffFormat(text('RIFF\0\0\0\0WAVEfmt '))).toBe('wav');
    expect(sniffFormat(text('OggS'))).toBe('ogg');
    expect(sniffFormat(text('ID3\x04'))).toBe('mp3');
    expect(sniffFormat(text('MZ\x90\x00'))).toBe('executable');
    expect(sniffFormat(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]))).toBe('executable');
    expect(sniffFormat(text('#!/bin/sh\nrm -rf /'))).toBe('executable');
  });

  it('accepts a valid PNG texture', () => {
    const r = checkImportFile('wood.png', png(512, 512), MOBILE_LIMITS);
    expect(r).toMatchObject({ ok: true, format: 'png', kind: 'texture' });
  });

  it('blocks an executable renamed to .png', () => {
    const r = checkImportFile('photo.png', text('MZ this is a program'), MOBILE_LIMITS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/executable/);
  });

  it('blocks content that does not match the extension', () => {
    const r = checkImportFile('model.glb', png(2, 2), MOBILE_LIMITS);
    expect(r.ok).toBe(false);
  });

  it('rejects unknown and dangerous extensions', () => {
    expect(checkImportFile('run.exe', text('x'), MOBILE_LIMITS).ok).toBe(false);
    expect(checkImportFile('script.ps1', text('x'), MOBILE_LIMITS).ok).toBe(false);
    expect(isBlockedExtension('a/b/installer.BAT')).toBe(true);
    expect(isBlockedExtension('model.glb')).toBe(false);
  });

  it('rejects oversized files and textures', () => {
    const limits = clampLimits({ maxImportFileBytes: 10 }, MOBILE_LIMITS);
    expect(checkImportFile('big.png', png(2, 2), limits).ok).toBe(false);
    const huge = checkImportFile('huge.png', png(20000, 100), MOBILE_LIMITS);
    expect(huge.ok).toBe(false);
  });

  it('requires companion files to be imported with a model', () => {
    expect(checkImportFile('buffer.bin', new Uint8Array([1, 2, 3]), MOBILE_LIMITS).ok).toBe(false);
    expect(checkImportFile('buffer.bin', new Uint8Array([1, 2, 3]), MOBILE_LIMITS, { allowCompanions: true }).ok).toBe(true);
  });

  it('rejects binary data disguised as a text format', () => {
    expect(checkImportFile('mesh.obj', new Uint8Array([0x76, 0x20, 0x00, 0x01]), MOBILE_LIMITS).ok).toBe(false);
    expect(checkImportFile('mesh.obj', text('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'), MOBILE_LIMITS).ok).toBe(true);
  });

  it('reads JPEG and WebP dimensions from headers', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x00, 0x02, 0x00, 0x03]);
    expect(readImageSize(jpeg, 'jpeg')).toEqual({ width: 512, height: 256 });
    const webp = new Uint8Array(30);
    webp.set(text('RIFF'), 0);
    webp.set(text('WEBPVP8X'), 8);
    webp.set([0xff, 0x03, 0x00], 24); // width-1 = 1023
    webp.set([0xff, 0x01, 0x00], 27); // height-1 = 511
    expect(readImageSize(webp, 'webp')).toEqual({ width: 1024, height: 512 });
  });
});

describe('safeUnzip', () => {
  const limits = MOBILE_LIMITS;

  it('round-trips files created by createZip', () => {
    const zip = createZip([
      { path: 'project.mfproj', bytes: text('{"a":1}') },
      { path: 'assets/a_1/model.glb', bytes: text('glTF....') },
    ]);
    const out = safeUnzip(zip, limits);
    expect(out.map((f) => f.path).sort()).toEqual(['assets/a_1/model.glb', 'project.mfproj']);
    expect(new TextDecoder().decode(out.find((f) => f.path === 'project.mfproj')!.bytes)).toBe('{"a":1}');
  });

  it('rejects path traversal entries', () => {
    const zip = zipSync({ '../../evil.txt': text('x') });
    expect(() => safeUnzip(zip, limits)).toThrow(ArchiveError);
  });

  it('rejects executables inside archives', () => {
    const zip = zipSync({ 'assets/tool.exe': text('MZ') });
    expect(() => safeUnzip(zip, limits)).toThrow(/blocked/);
  });

  it('rejects too many entries', () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 20; i++) files[`f${i}.txt`] = text('x');
    expect(() => safeUnzip(zipSync(files), { ...limits, maxArchiveEntries: 10 })).toThrow(/too many/);
  });

  it('stops zip bombs by counting actual output', () => {
    const bomb = zipSync({ 'big.bin': new Uint8Array(8 * 1024 * 1024) }, { level: 9 });
    expect(bomb.byteLength).toBeLessThan(64 * 1024);
    expect(() => safeUnzip(bomb, { ...limits, maxArchiveExpandedBytes: 1024 * 1024 })).toThrow(/expands/);
    expect(() => safeUnzip(bomb, { ...limits, maxCompressionRatio: 50 })).toThrow(/ratio/);
  });

  it('rejects duplicate entries (case-insensitive)', () => {
    const both = zipSync({ 'x/A.txt': text('1'), 'x/a.txt': text('2') });
    expect(() => safeUnzip(both, limits)).toThrow(/Duplicate/);
  });

  it('rejects oversized archives before reading them', () => {
    const zip = createZip([{ path: 'a.txt', bytes: text('hello') }]);
    expect(() => safeUnzip(zip, { ...limits, maxArchiveBytes: 10 })).toThrow(/larger/);
  });
});
