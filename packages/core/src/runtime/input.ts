/** Normalised player input, independent of keyboard/touch/gamepad. */
export interface InputState {
  /** -1 (left) .. 1 (right) */
  moveX: number;
  /** -1 (back) .. 1 (forward) */
  moveY: number;
  jump: boolean;
  /** Look deltas accumulated since the previous read (pixels-ish units). */
  lookX: number;
  lookY: number;
}

export interface InputSource {
  /** Returns the current state and resets accumulated look deltas. */
  read(): InputState;
}

export const idleInput = (): InputState => ({ moveX: 0, moveY: 0, jump: false, lookX: 0, lookY: 0 });

/** Input source for tests and benchmarks. */
export class ScriptedInput implements InputSource {
  state: InputState = idleInput();

  read(): InputState {
    const s = { ...this.state };
    this.state.lookX = 0;
    this.state.lookY = 0;
    return s;
  }
}
