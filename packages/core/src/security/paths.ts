const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
// Control characters and characters Windows forbids in file names.
const FORBIDDEN_CHARS = /[\u0000-\u001f<>:"|?*\u007f]/;
const MAX_PATH_LENGTH = 240;
const MAX_SEGMENT_LENGTH = 120;

export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafePathError';
  }
}

/**
 * Normalises a relative path from untrusted input (archives, glTF URIs, project files)
 * and rejects anything that could escape its root: absolute paths, drive letters, UNC paths,
 * `..` segments, reserved device names, control characters.
 *
 * Returns a forward-slash path with no leading/trailing slash.
 */
export function safeRelativePath(input: string): string {
  if (typeof input !== 'string' || input.length === 0) throw new UnsafePathError('Empty path');
  if (input.length > MAX_PATH_LENGTH) throw new UnsafePathError('Path is too long');
  const unified = input.replace(/\\/g, '/');
  if (unified.startsWith('/')) throw new UnsafePathError('Absolute paths are not allowed');
  if (/^[a-zA-Z]:/.test(unified)) throw new UnsafePathError('Drive-letter paths are not allowed');
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(unified)) throw new UnsafePathError('URL schemes are not allowed');

  const segments: string[] = [];
  for (const raw of unified.split('/')) {
    if (raw === '' || raw === '.') continue;
    if (raw === '..') throw new UnsafePathError('Parent-directory segments are not allowed');
    if (raw.length > MAX_SEGMENT_LENGTH) throw new UnsafePathError('Path segment is too long');
    if (FORBIDDEN_CHARS.test(raw)) throw new UnsafePathError('Path contains forbidden characters');
    if (WINDOWS_RESERVED.test(raw)) throw new UnsafePathError('Path uses a reserved device name');
    if (/[. ]$/.test(raw)) throw new UnsafePathError('Path segments may not end with a dot or space');
    segments.push(raw);
  }
  if (segments.length === 0) throw new UnsafePathError('Empty path');
  return segments.join('/');
}

export function isSafeRelativePath(input: string): boolean {
  try {
    safeRelativePath(input);
    return true;
  } catch {
    return false;
  }
}

/** Joins a trusted root with an untrusted relative path. */
export function joinSafe(root: string, untrusted: string): string {
  const rel = safeRelativePath(untrusted);
  const base = root.replace(/\/+$/, '');
  return base ? `${base}/${rel}` : rel;
}

/**
 * Makes a user-supplied name usable as a single file name.
 * Never throws; always returns something non-empty.
 */
export function sanitizeFileName(name: string, fallback = 'file'): string {
  const base = (name.split(/[\\/]/).pop() ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f<>:"|?*\u007f]/g, '_')
    .replace(/[. ]+$/, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, MAX_SEGMENT_LENGTH);
  if (!base || WINDOWS_RESERVED.test(base)) return fallback;
  return base;
}

export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function stripExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}
