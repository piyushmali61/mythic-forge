import { Unzip, UnzipInflate, zipSync, type Zippable } from 'fflate';
import { concatBytes } from '../util/bytes.ts';
import { isBlockedExtension } from './file-types.ts';
import type { ResourceLimits } from './limits.ts';
import { safeRelativePath, UnsafePathError } from './paths.ts';

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

export interface ExtractedFile {
  path: string;
  bytes: Uint8Array;
}

type ArchiveLimits = Pick<
  ResourceLimits,
  'maxArchiveBytes' | 'maxArchiveExpandedBytes' | 'maxArchiveEntries' | 'maxCompressionRatio'
>;

/**
 * Extracts a zip archive in memory with defences against:
 * - zip bombs (entry count, total expanded size, per-entry ratio — counted on *actual* output, not headers)
 * - path traversal / absolute paths / reserved names
 * - duplicate entries (later entry silently overwriting an earlier one)
 * - executable or script files
 *
 * Directory entries are ignored. Nothing is ever written to a real file system here.
 */
export function safeUnzip(archive: Uint8Array, limits: ArchiveLimits): ExtractedFile[] {
  if (archive.byteLength > limits.maxArchiveBytes) {
    throw new ArchiveError('The archive is larger than the allowed size.');
  }
  const files: ExtractedFile[] = [];
  const seen = new Set<string>();
  let entries = 0;
  let totalExpanded = 0;
  let failure: Error | null = null;

  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (failure) return;
    entries++;
    if (entries > limits.maxArchiveEntries) {
      failure = new ArchiveError('The archive contains too many files.');
      return;
    }
    if (file.name.endsWith('/')) return; // directory entry
    let path: string;
    try {
      path = safeRelativePath(file.name);
    } catch (e) {
      failure = new ArchiveError(`Unsafe path in archive: ${e instanceof UnsafePathError ? e.message : 'invalid'}`);
      return;
    }
    const key = path.toLowerCase();
    if (seen.has(key)) {
      failure = new ArchiveError(`Duplicate entry in archive: ${path}`);
      return;
    }
    seen.add(key);
    if (isBlockedExtension(path)) {
      failure = new ArchiveError(`The archive contains a blocked file type: ${path}`);
      return;
    }
    if (file.originalSize !== undefined && totalExpanded + file.originalSize > limits.maxArchiveExpandedBytes) {
      failure = new ArchiveError('The archive expands beyond the allowed size.');
      return;
    }

    const chunks: Uint8Array[] = [];
    let written = 0;
    const compressedSize = Math.max(file.size ?? 1, 1);
    file.ondata = (error, data, final) => {
      if (failure) return;
      if (error) {
        failure = new ArchiveError(`Corrupt archive entry: ${path}`);
        return;
      }
      written += data.byteLength;
      totalExpanded += data.byteLength;
      if (totalExpanded > limits.maxArchiveExpandedBytes) {
        failure = new ArchiveError('The archive expands beyond the allowed size.');
        file.terminate();
        return;
      }
      if (written > 1024 * 1024 && written / compressedSize > limits.maxCompressionRatio) {
        failure = new ArchiveError(`Suspicious compression ratio in ${path}.`);
        file.terminate();
        return;
      }
      chunks.push(data);
      if (final) files.push({ path, bytes: concatBytes(chunks) });
    };
    file.start();
  };

  try {
    unzip.push(archive, true);
  } catch (e) {
    if (!failure) failure = new ArchiveError(`The archive could not be read (${e instanceof Error ? e.message : 'unknown error'}).`);
  }
  if (failure) throw failure;
  return files;
}

const STORED_EXTENSIONS = /\.(glb|png|jpe?g|webp|ogg|oga|mp3|zip|mfpack)$/i;

/** Creates a zip. Already-compressed formats are stored without recompression to save CPU. */
export function createZip(files: readonly ExtractedFile[]): Uint8Array {
  const tree: Zippable = {};
  for (const f of files) {
    const path = safeRelativePath(f.path);
    tree[path] = [f.bytes, { level: STORED_EXTENSIONS.test(path) ? 0 : 6 }];
  }
  return zipSync(tree, { mtime: new Date('2020-01-01T00:00:00Z') });
}
