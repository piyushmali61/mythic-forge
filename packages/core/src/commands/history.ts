import { Emitter } from '../util/emitter.ts';

export interface Command {
  readonly label: string;
  execute(): void;
  undo(): void;
  /** Approximate memory held by this command, in bytes. Used to budget history size. */
  readonly cost?: number;
  /**
   * Absorb a following command of the same kind (e.g. successive edits of one field),
   * so that one undo reverts the whole gesture. Return true if merged.
   */
  merge?(next: Command): boolean;
}

export interface HistoryOptions {
  maxEntries: number;
  maxBytes: number;
  /** Commands arriving within this window may merge. */
  mergeWindowMs: number;
  now: () => number;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  size: number;
}

const DEFAULT_COST = 256;

/**
 * Undo/redo stack with bounded memory. Oldest entries are discarded first when either
 * the entry limit or the byte budget is exceeded.
 */
export class CommandHistory {
  readonly events = new Emitter<{ change: HistoryState }>();
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private bytes = 0;
  private lastPushAt = -Infinity;
  private mergeBlocked = false;
  private readonly options: HistoryOptions;

  constructor(options: Partial<HistoryOptions> = {}) {
    this.options = {
      maxEntries: 200,
      maxBytes: 32 * 1024 * 1024,
      mergeWindowMs: 800,
      now: () => Date.now(),
      ...options,
    };
  }

  /** Runs a command and records it. If it throws, nothing is recorded. */
  execute(command: Command): void {
    command.execute();
    this.record(command);
  }

  /** Records a command whose effect has already been applied (e.g. a finished gizmo drag). */
  record(command: Command): void {
    const now = this.options.now();
    const top = this.undoStack[this.undoStack.length - 1];
    const canMerge = !this.mergeBlocked && top?.merge && now - this.lastPushAt <= this.options.mergeWindowMs;
    this.mergeBlocked = false;
    this.lastPushAt = now;
    this.clearRedo();
    if (canMerge && top.merge!(command)) {
      this.emit();
      return;
    }
    this.undoStack.push(command);
    this.bytes += command.cost ?? DEFAULT_COST;
    this.trim();
    this.emit();
  }

  /** The next recorded command will not merge into the previous one. */
  breakMerge(): void {
    this.mergeBlocked = true;
  }

  undo(): string | null {
    const command = this.undoStack.pop();
    if (!command) return null;
    this.bytes -= command.cost ?? DEFAULT_COST;
    try {
      command.undo();
    } catch (error) {
      // A failed undo leaves history in an unknown state; safest is to drop it.
      this.clear();
      throw error;
    }
    this.redoStack.push(command);
    this.mergeBlocked = true;
    this.emit();
    return command.label;
  }

  redo(): string | null {
    const command = this.redoStack.pop();
    if (!command) return null;
    try {
      command.execute();
    } catch (error) {
      this.clear();
      throw error;
    }
    this.undoStack.push(command);
    this.bytes += command.cost ?? DEFAULT_COST;
    this.mergeBlocked = true;
    this.emit();
    return command.label;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.bytes = 0;
    this.emit();
  }

  get state(): HistoryState {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: this.undoStack[this.undoStack.length - 1]?.label ?? null,
      redoLabel: this.redoStack[this.redoStack.length - 1]?.label ?? null,
      size: this.undoStack.length,
    };
  }

  get approximateBytes(): number {
    return this.bytes;
  }

  private clearRedo(): void {
    this.redoStack = [];
  }

  private trim(): void {
    while (
      this.undoStack.length > 1 &&
      (this.undoStack.length > this.options.maxEntries || this.bytes > this.options.maxBytes)
    ) {
      const dropped = this.undoStack.shift()!;
      this.bytes -= dropped.cost ?? DEFAULT_COST;
    }
  }

  private emit(): void {
    this.events.emit('change', this.state);
  }
}

/** Groups several commands into one undo step. */
export class CompositeCommand implements Command {
  readonly label: string;
  private readonly commands: Command[];

  constructor(label: string, commands: Command[]) {
    this.label = label;
    this.commands = commands;
  }

  get cost(): number {
    return this.commands.reduce((sum, c) => sum + (c.cost ?? DEFAULT_COST), 0);
  }

  execute(): void {
    for (const c of this.commands) c.execute();
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) this.commands[i]!.undo();
  }
}
