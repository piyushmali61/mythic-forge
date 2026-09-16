import type { InputSource, InputState } from '@mythic-forge/core';

const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
};

const isTypingTarget = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/**
 * Play-mode input: keyboard (WASD/arrows/space), drag-to-look on the game view,
 * and an on-screen stick/jump button fed by the UI on touch devices.
 * Listeners exist only while play mode runs.
 */
export class PlayInput implements InputSource {
  private pressed = new Set<string>();
  private virtual = { x: 0, y: 0, jump: false };
  private look = { x: 0, y: 0 };
  private lookPointer: number | null = null;
  private last = { x: 0, y: 0 };
  private element: HTMLElement | null = null;

  attach(lookSurface: HTMLElement): void {
    this.element = lookSurface;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    lookSurface.addEventListener('pointerdown', this.onPointerDown);
    lookSurface.addEventListener('pointermove', this.onPointerMove);
    lookSurface.addEventListener('pointerup', this.onPointerUp);
    lookSurface.addEventListener('pointercancel', this.onPointerUp);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    const el = this.element;
    if (el) {
      el.removeEventListener('pointerdown', this.onPointerDown);
      el.removeEventListener('pointermove', this.onPointerMove);
      el.removeEventListener('pointerup', this.onPointerUp);
      el.removeEventListener('pointercancel', this.onPointerUp);
    }
    this.element = null;
    this.onBlur();
  }

  /** On-screen stick, -1..1 on each axis (y up = forward). */
  setVirtualStick(x: number, y: number): void {
    this.virtual.x = Math.max(-1, Math.min(1, x));
    this.virtual.y = Math.max(-1, Math.min(1, y));
  }

  setVirtualJump(down: boolean): void {
    this.virtual.jump = down;
  }

  read(): InputState {
    const has = (codes: string[]): boolean => codes.some((c) => this.pressed.has(c));
    const kx = (has(KEYS.right) ? 1 : 0) - (has(KEYS.left) ? 1 : 0);
    const ky = (has(KEYS.forward) ? 1 : 0) - (has(KEYS.back) ? 1 : 0);
    const state: InputState = {
      moveX: Math.max(-1, Math.min(1, kx + this.virtual.x)),
      moveY: Math.max(-1, Math.min(1, ky + this.virtual.y)),
      jump: has(KEYS.jump) || this.virtual.jump,
      lookX: this.look.x,
      lookY: this.look.y,
    };
    this.look.x = 0;
    this.look.y = 0;
    return state;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target)) return;
    const all = Object.values(KEYS).flat();
    if (all.includes(e.code)) {
      this.pressed.add(e.code);
      e.preventDefault();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.virtual = { x: 0, y: 0, jump: false };
    this.lookPointer = null;
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.lookPointer !== null) return;
    this.lookPointer = e.pointerId;
    this.last = { x: e.clientX, y: e.clientY };
    this.element?.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.lookPointer) return;
    this.look.x += e.clientX - this.last.x;
    this.look.y += e.clientY - this.last.y;
    this.last = { x: e.clientX, y: e.clientY };
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.lookPointer) this.lookPointer = null;
  };
}
