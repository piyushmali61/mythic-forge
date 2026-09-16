import { fileExtension } from './paths.ts';
import type { ResourceLimits } from './limits.ts';

export type ImportKind = 'model' | 'texture' | 'audio' | 'model-companion' | 'project-pack';
export type FileFormat =
  | 'glb'
  | 'gltf'
  | 'obj'
  | 'mtl'
  | 'fbx'
  | 'bin'
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'wav'
  | 'ogg'
  | 'mp3'
  | 'mfpack';

interface FormatInfo {
  format: FileFormat;
  kind: ImportKind;
  mime: string;
  label: string;
  /** Text formats are checked for binary content instead of magic bytes. */
  text?: boolean;
}

/** The complete allow-list. Anything else is rejected. */
export const IMPORT_FORMATS: Readonly<Record<string, FormatInfo>> = {
  glb: { format: 'glb', kind: 'model', mime: 'model/gltf-binary', label: 'glTF Binary' },
  gltf: { format: 'gltf', kind: 'model', mime: 'model/gltf+json', label: 'glTF', text: true },
  obj: { format: 'obj', kind: 'model', mime: 'model/obj', label: 'Wavefront OBJ', text: true },
  fbx: { format: 'fbx', kind: 'model', mime: 'application/octet-stream', label: 'FBX (experimental)' },
  bin: { format: 'bin', kind: 'model-companion', mime: 'application/octet-stream', label: 'glTF buffer' },
  mtl: { format: 'mtl', kind: 'model-companion', mime: 'model/mtl', label: 'OBJ material', text: true },
  png: { format: 'png', kind: 'texture', mime: 'image/png', label: 'PNG' },
  jpg: { format: 'jpeg', kind: 'texture', mime: 'image/jpeg', label: 'JPEG' },
  jpeg: { format: 'jpeg', kind: 'texture', mime: 'image/jpeg', label: 'JPEG' },
  webp: { format: 'webp', kind: 'texture', mime: 'image/webp', label: 'WebP' },
  wav: { format: 'wav', kind: 'audio', mime: 'audio/wav', label: 'WAV' },
  ogg: { format: 'ogg', kind: 'audio', mime: 'audio/ogg', label: 'Ogg Vorbis/Opus' },
  oga: { format: 'ogg', kind: 'audio', mime: 'audio/ogg', label: 'Ogg Vorbis/Opus' },
  mp3: { format: 'mp3', kind: 'audio', mime: 'audio/mpeg', label: 'MP3' },
  mfpack: { format: 'mfpack', kind: 'project-pack', mime: 'application/zip', label: 'Mythic Forge project' },
};

export const MODEL_EXTENSIONS = ['glb', 'gltf', 'obj', 'fbx'] as const;
export const TEXTURE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;
export const AUDIO_EXTENSIONS = ['wav', 'ogg', 'oga', 'mp3'] as const;
export const COMPANION_EXTENSIONS = ['bin', 'mtl', 'png', 'jpg', 'jpeg', 'webp'] as const;

export function acceptAttribute(extensions: readonly string[]): string {
  return extensions.map((e) => `.${e}`).join(',');
}

export type Sniffed = FileFormat | 'zip' | 'executable' | 'unknown';

function startsWith(bytes: Uint8Array, sig: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[offset + i] !== sig[i]) return false;
  return true;
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

const EXECUTABLE_SIGNATURES: readonly (readonly number[])[] = [
  ascii('MZ'), // Windows PE / DOS
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xfe, 0xed, 0xfa, 0xce], // Mach-O 32
  [0xfe, 0xed, 0xfa, 0xcf], // Mach-O 64
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O fat / Java class
  ascii('#!'), // shebang scripts
  [0x00, 0x61, 0x73, 0x6d], // WebAssembly
  ascii('dex\n'), // Android DEX
  [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00], // Windows .lnk
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // OLE (MSI, legacy Office with macros)
];

/** Identifies a file by its content, ignoring the name. */
export function sniffFormat(bytes: Uint8Array): Sniffed {
  for (const sig of EXECUTABLE_SIGNATURES) if (startsWith(bytes, sig)) return 'executable';
  if (startsWith(bytes, ascii('glTF'))) return 'glb';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'webp';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WAVE'), 8)) return 'wav';
  if (startsWith(bytes, ascii('OggS'))) return 'ogg';
  if (startsWith(bytes, ascii('ID3'))) return 'mp3';
  if (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) return 'mp3';
  if (startsWith(bytes, ascii('Kaydara FBX Binary'))) return 'fbx';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return 'zip';
  return 'unknown';
}

/** True when the sample looks like text: no NUL bytes and no executable/script header. */
function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 64 * 1024);
  for (const b of sample) if (b === 0) return false;
  return true;
}

export type FileCheck =
  | { ok: true; format: FileFormat; kind: ImportKind; mime: string; label: string }
  | { ok: false; reason: string };

export interface FileCheckOptions {
  /** Allow companion formats (glTF .bin, OBJ .mtl) — only when imported next to a main model. */
  allowCompanions?: boolean;
  /** Restrict to these kinds. */
  kinds?: readonly ImportKind[];
}

/**
 * Validates an imported file: allow-listed extension, size limit, content matches extension,
 * no executable content. Does not parse the file — parsers run afterwards with their own guards.
 */
export function checkImportFile(
  name: string,
  bytes: Uint8Array,
  limits: ResourceLimits,
  options: FileCheckOptions = {},
): FileCheck {
  const ext = fileExtension(name);
  const info = IMPORT_FORMATS[ext];
  if (!info) {
    return { ok: false, reason: `".${ext || '?'}" files can't be imported. Supported: GLB, glTF, OBJ, FBX, PNG, JPEG, WebP, WAV, OGG, MP3.` };
  }
  if (info.kind === 'model-companion' && !options.allowCompanions) {
    return { ok: false, reason: `A .${ext} file can only be imported together with its model.` };
  }
  if (options.kinds && !options.kinds.includes(info.kind)) {
    return { ok: false, reason: `This file type (${info.label}) isn't accepted here.` };
  }
  const maxBytes = info.kind === 'project-pack' ? limits.maxArchiveBytes : limits.maxImportFileBytes;
  if (bytes.byteLength > maxBytes) {
    return { ok: false, reason: `The file is too large (limit ${Math.round(maxBytes / 1048576)} MB).` };
  }
  if (bytes.byteLength === 0) return { ok: false, reason: 'The file is empty.' };

  const sniffed = sniffFormat(bytes);
  if (sniffed === 'executable') {
    return { ok: false, reason: 'The file contains executable code and was blocked.' };
  }

  if (info.text) {
    if (sniffed !== 'unknown' || !looksLikeText(bytes)) {
      return { ok: false, reason: `The file does not look like a valid ${info.label} text file.` };
    }
  } else if (info.format === 'bin') {
    // glTF buffers are raw data; only executables are rejected (above).
  } else if (info.format === 'mfpack') {
    if (sniffed !== 'zip') return { ok: false, reason: 'The file is not a valid Mythic Forge project package.' };
  } else if (info.format === 'fbx') {
    const asciiFbx = sniffed === 'unknown' && looksLikeText(bytes) && startsWithText(bytes, ';');
    if (sniffed !== 'fbx' && !asciiFbx) {
      return { ok: false, reason: 'The file is not a valid FBX file.' };
    }
  } else if (sniffed !== info.format) {
    return {
      ok: false,
      reason: `The file's contents don't match its .${ext} extension${sniffed !== 'unknown' ? ` (looks like ${sniffed.toUpperCase()})` : ''}.`,
    };
  }

  if (info.kind === 'texture') {
    const size = readImageSize(bytes, info.format);
    if (!size) return { ok: false, reason: 'The image header could not be read.' };
    if (size.width > limits.maxTextureDimension || size.height > limits.maxTextureDimension) {
      return {
        ok: false,
        reason: `The image is ${size.width}×${size.height}; the limit is ${limits.maxTextureDimension}px per side.`,
      };
    }
  }

  return { ok: true, format: info.format, kind: info.kind, mime: info.mime, label: info.label };
}

function startsWithText(bytes: Uint8Array, prefix: string): boolean {
  let i = 0;
  // skip UTF-8 BOM and whitespace
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09)) i++;
  return startsWith(bytes, ascii(prefix), i);
}

const u16be = (b: Uint8Array, o: number): number => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const u16le = (b: Uint8Array, o: number): number => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, o: number): number => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, o: number): number =>
  (((b[o] ?? 0) << 24) >>> 0) + ((b[o + 1] ?? 0) << 16) + ((b[o + 2] ?? 0) << 8) + (b[o + 3] ?? 0);

/**
 * Reads image dimensions from the header without decoding pixels,
 * so oversized images ("decompression bombs") are rejected cheaply.
 */
export function readImageSize(bytes: Uint8Array, format: FileFormat): { width: number; height: number } | null {
  if (format === 'png') {
    if (bytes.length < 24) return null;
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (format === 'jpeg') {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1] ?? 0;
      if (marker === 0xff) {
        i++;
        continue;
      }
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { height: u16be(bytes, i + 5), width: u16be(bytes, i + 7) };
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = u16be(bytes, i + 2);
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  if (format === 'webp') {
    if (bytes.length < 30) return null;
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === 'VP8 ') return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b0 = bytes[21] ?? 0;
      const b1 = bytes[22] ?? 0;
      const b2 = bytes[23] ?? 0;
      const b3 = bytes[24] ?? 0;
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }
    if (chunk === 'VP8X') return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
    return null;
  }
  return null;
}

/** File names inside asset packages that must never be executed or even stored. */
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'dll', 'com', 'scr', 'msi', 'msix', 'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'mjs', 'cjs',
  'jse', 'wsf', 'hta', 'sh', 'bash', 'zsh', 'command', 'app', 'apk', 'aab', 'dex', 'jar', 'class', 'so',
  'dylib', 'py', 'pyc', 'rb', 'pl', 'php', 'lnk', 'reg', 'scpt', 'wasm', 'html', 'htm', 'svg', 'xhtml',
]);

export function isBlockedExtension(name: string): boolean {
  return BLOCKED_EXTENSIONS.has(fileExtension(name));
}
