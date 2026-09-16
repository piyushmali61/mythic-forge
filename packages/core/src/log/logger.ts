export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'perf';

export interface LogEntry {
  id: number;
  time: number;
  level: LogLevel;
  source: string;
  message: string;
  detail?: string;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, perf: 1, info: 2, warn: 3, error: 4 };

export interface LoggerOptions {
  /** Ring-buffer size. Old entries are dropped so the console never grows unbounded. */
  maxEntries: number;
  minLevel: LogLevel;
  /** Mirror to the JS console (development builds). */
  mirrorToConsole: boolean;
}

/**
 * Removes things that should never end up in a shared diagnostic log:
 * user names in home-directory paths and e-mail addresses.
 */
export function redact(text: string): string {
  return text
    .replace(/([A-Za-z]:\\Users\\)[^\\/\s]+/g, '$1<user>')
    .replace(/(\/(?:home|Users)\/)[^/\s]+/g, '$1<user>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>');
}

export class Logger {
  private buffer: LogEntry[] = [];
  private nextId = 1;
  private listeners = new Set<(entries: readonly LogEntry[]) => void>();
  private options: LoggerOptions;

  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = { maxEntries: 500, minLevel: 'info', mirrorToConsole: false, ...options };
  }

  configure(options: Partial<LoggerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  log(level: LogLevel, source: string, message: string, detail?: string): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.options.minLevel]) return;
    const entry: LogEntry = {
      id: this.nextId++,
      time: Date.now(),
      level,
      source,
      message: redact(message),
      ...(detail ? { detail: redact(detail) } : {}),
    };
    this.buffer.push(entry);
    if (this.buffer.length > this.options.maxEntries) {
      this.buffer.splice(0, this.buffer.length - this.options.maxEntries);
    }
    if (this.options.mirrorToConsole) {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      fn(`[${source}] ${entry.message}`, detail ?? '');
    }
    for (const listener of this.listeners) listener(this.buffer);
  }

  debug(source: string, message: string, detail?: string): void {
    this.log('debug', source, message, detail);
  }
  info(source: string, message: string, detail?: string): void {
    this.log('info', source, message, detail);
  }
  warn(source: string, message: string, detail?: string): void {
    this.log('warn', source, message, detail);
  }
  error(source: string, message: string, detail?: string): void {
    this.log('error', source, message, detail);
  }
  perf(source: string, message: string, detail?: string): void {
    this.log('perf', source, message, detail);
  }

  entries(): readonly LogEntry[] {
    return this.buffer;
  }

  subscribe(listener: (entries: readonly LogEntry[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.buffer = [];
    for (const listener of this.listeners) listener(this.buffer);
  }

  /** Plain-text export for "Export diagnostic logs". The user decides where it goes. */
  exportText(header: string): string {
    const lines = this.buffer.map((e) => {
      const time = new Date(e.time).toISOString();
      const detail = e.detail ? `\n    ${e.detail.replace(/\n/g, '\n    ')}` : '';
      return `${time} ${e.level.toUpperCase().padEnd(5)} [${e.source}] ${e.message}${detail}`;
    });
    return `${header}\n${'-'.repeat(60)}\n${lines.join('\n')}\n`;
  }
}

/** Shared application log. */
export const log = new Logger();
