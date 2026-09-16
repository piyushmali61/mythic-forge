import type { Vec3 } from '../math/vec3.ts';
import { isRecord } from '../util/json.ts';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type ValidationResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

/**
 * Small helper for reading untrusted JSON into typed, normalised values.
 * Soft problems (bad number, unknown enum) fall back to defaults and are recorded as warnings.
 * Hard problems are recorded as errors; the caller decides whether to reject the document.
 */
export class Reader {
  readonly errors: string[] = [];
  readonly warnings: string[] = [];
  private readonly maxString: number;

  constructor(maxString = 2000) {
    this.maxString = maxString;
  }

  warn(path: string, message: string): void {
    if (this.warnings.length < 200) this.warnings.push(`${path}: ${message}`);
  }

  fail(path: string, message: string): void {
    if (this.errors.length < 200) this.errors.push(`${path}: ${message}`);
  }

  obj(value: unknown, path: string): Record<string, unknown> {
    if (isRecord(value)) return value;
    if (value !== undefined) this.warn(path, 'expected an object');
    return {};
  }

  num(value: unknown, path: string, def: number, min = -Infinity, max = Infinity): number {
    if (value === undefined) return def;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.warn(path, 'expected a finite number');
      return def;
    }
    if (value < min || value > max) {
      this.warn(path, `clamped to [${min}, ${max}]`);
      return Math.min(max, Math.max(min, value));
    }
    return value;
  }

  int(value: unknown, path: string, def: number, min = -Infinity, max = Infinity): number {
    return Math.round(this.num(value, path, def, min, max));
  }

  bool(value: unknown, path: string, def: boolean): boolean {
    if (value === undefined) return def;
    if (typeof value !== 'boolean') {
      this.warn(path, 'expected true/false');
      return def;
    }
    return value;
  }

  str(value: unknown, path: string, def: string, max = this.maxString): string {
    if (value === undefined) return def;
    if (typeof value !== 'string') {
      this.warn(path, 'expected text');
      return def;
    }
    // Strip control characters except tab/newline.
    const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    if (cleaned.length > max) {
      this.warn(path, `truncated to ${max} characters`);
      return cleaned.slice(0, max);
    }
    return cleaned;
  }

  nullableStr(value: unknown, path: string, max = 256): string | null {
    if (value === null || value === undefined) return null;
    const s = this.str(value, path, '', max);
    return s === '' ? null : s;
  }

  color(value: unknown, path: string, def: string): string {
    if (value === undefined) return def;
    if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
      this.warn(path, 'expected a #rrggbb colour');
      return def;
    }
    return value.toLowerCase();
  }

  oneOf<T extends string>(value: unknown, path: string, options: readonly T[], def: T): T {
    if (value === undefined) return def;
    if (typeof value === 'string' && (options as readonly string[]).includes(value)) return value as T;
    this.warn(path, `expected one of ${options.join(', ')}`);
    return def;
  }

  vec3(value: unknown, path: string, def: Vec3, min = -1e6, max = 1e6): Vec3 {
    if (value === undefined) return [def[0], def[1], def[2]];
    if (!Array.isArray(value) || value.length !== 3) {
      this.warn(path, 'expected [x, y, z]');
      return [def[0], def[1], def[2]];
    }
    return [
      this.num(value[0], `${path}[0]`, def[0], min, max),
      this.num(value[1], `${path}[1]`, def[1], min, max),
      this.num(value[2], `${path}[2]`, def[2], min, max),
    ];
  }

  strArray(value: unknown, path: string, maxItems: number, maxLen = 256): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      this.warn(path, 'expected a list');
      return [];
    }
    const out: string[] = [];
    for (let i = 0; i < value.length && out.length < maxItems; i++) {
      const v = value[i];
      if (typeof v === 'string' && v.length <= maxLen) out.push(v);
      else this.warn(`${path}[${i}]`, 'ignored invalid entry');
    }
    return out;
  }

  isoDate(value: unknown, path: string, def: string): string {
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
    if (value !== undefined) this.warn(path, 'expected an ISO date');
    return def;
  }
}
