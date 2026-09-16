const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random, path-safe identifier. The prefix helps humans read project files. */
export function createId(prefix = '', length = 12): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value) && !value.includes('..');
}
