import { utf8Decode } from './bytes.ts';

export class JsonLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonLimitError';
  }
}

/**
 * Parses untrusted JSON with a size limit.
 * Returns `undefined` for malformed input; throws `JsonLimitError` when too large.
 */
export function parseJsonLimited(input: string | Uint8Array, maxBytes: number): unknown {
  const size = typeof input === 'string' ? input.length : input.byteLength;
  if (size > maxBytes) throw new JsonLimitError(`JSON document is larger than ${maxBytes} bytes`);
  let text: string;
  try {
    text = typeof input === 'string' ? input : utf8Decode(input);
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Pretty JSON for files meant to be human-readable and diff-friendly. */
export function stringifyPretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Serialises JSON so it can be embedded inside an HTML script element without breaking out of it. */
export function jsonForHtmlScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
