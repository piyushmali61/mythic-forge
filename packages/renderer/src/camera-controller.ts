import * as THREE from 'three';

interface PointerInfo {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  button: number;
  type: string;
}

export interface CameraControllerOptions {
  /** Return true when another tool (the transform gizmo) owns this pointer. */
  isPointerCaptured: () => boolean;
  onChange: () => void;
  onTap: (ndc: THREE.Vector2, event: PointerEvent) => void;
}

const TAP_DISTANCE = 8;
const TAP_TIME = 450;

/**
 * Editor camera for mouse and touch.
 *
 * Mouse: left-drag on empty space or right-drag orbits, middle-drag or Shift+left-drag pans,
 * wheel zooms, click selects.
 * Touch: tap selects, one-finger drag orbits, two fingers pan, pinch zooms, twist rotates.
 * 2D mode: rotation is locked (orthographic front view); dragging pans.
 */
export class EditorCameraController {
  readonly target = new THREE.Vector3(0, 0.5, 0);
  private radius = 12;
  private theta = Math.PI / 4; // azimuth
  private phi = Math.PI / 3; // polar
  private pointers = new Map<number, PointerInfo>();
  private pinch: { distance: number; angle: number; mid: THREE.Vector2 } | null = null;
  private element: HTMLElement | null = null;
  private mode2d = false;
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private readonly options: CameraControllerOptions;

  constructor(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, options: CameraControllerOptions) {
    this.camera = camera;
    this.options = options;
    this.apply();
  }

  setCamera(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, mode2d: boolean): void {
    this.camera = camera;
    this.mode2d = mode2d;
    if (mode2d) {
      this.theta = 0;
      this.phi = Math.PI / 2;
    }
    this.apply();
  }

  attach(element: HTMLElement): void {
    this.element = element;
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    const el = this.element;
    if (!el) return;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('contextmenu', this.onContextMenu);
    this.element = null;
  }

  /** Frames a bounding sphere. */
  focus(center: THREE.Vector3, radius: number): void {
    this.target.copy(center);
    const fov = this.camera instanceof THREE.PerspectiveCamera ? THREE.MathUtils.degToRad(this.camera.fov) : Math.PI / 3;
    this.radius = THREE.MathUtils.clamp((Math.max(radius, 0.25) / Math.sin(fov / 2)) * 1.1, 0.5, 5000);
    if (this.camera instanceof THREE.OrthographicCamera) this.camera.zoom = 6 / Math.max(radius, 0.5);
    this.apply();
  }

  getState(): { target: [number, number, number]; radius: number; theta: number; phi: number } {
    return { target: this.target.toArray() as [number, number, number], radius: this.radius, theta: this.theta, phi: this.phi };
  }

  setState(state: { target: [number, number, number]; radius: number; theta: number; phi: number }): void {
    this.target.fromArray(state.target);
    this.radius = state.radius;
    if (!this.mode2d) {
      this.theta = state.theta;
      this.phi = state.phi;
    }
    this.apply();
  }

  // ---- operations ----------------------------------------------------------------------------

  private orbit(dx: number, dy: number): void {
    if (this.mode2d) {
      this.pan(dx, dy);
      return;
    }
    const h = this.element?.clientHeight || 600;
    this.theta -= (dx / h) * Math.PI * 1.4;
    this.phi = THREE.MathUtils.clamp(this.phi - (dy / h) * Math.PI * 1.4, 0.05, Math.PI - 0.05);
    this.apply();
  }

  private pan(dx: number, dy: number): void {
    const h = this.element?.clientHeight || 600;
    let worldPerPixel: number;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      worldPerPixel = (2 * this.radius * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / h;
    } else {
      worldPerPixel = (this.camera.top - this.camera.bottom) / this.camera.zoom / h;
    }
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    this.target.addScaledVector(right, -dx * worldPerPixel).addScaledVector(up, dy * worldPerPixel);
    this.apply();
  }

  private zoom(factor: number): void {
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom / factor, 0.02, 200);
      this.camera.updateProjectionMatrix();
    } else {
      this.radius = THREE.MathUtils.clamp(this.radius * factor, 0.3, 5000);
    }
    this.apply();
  }

  private apply(): void {
    const offset = new THREE.Vector3().setFromSphericalCoords(this.radius, this.phi, this.theta);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    this.options.onChange();
  }

  // ---- events --------------------------------------------------------------------------------

  private readonly onContextMenu = (e: Event): void => e.preventDefault();

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoom(Math.exp(THREE.MathUtils.clamp(delta, -200, 200) * 0.0015));
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.options.isPointerCaptured()) return;
    this.element?.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      button: e.button,
      type: e.pointerType,
    });
    if (this.pointers.size === 2) this.pinch = this.measurePinch();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this.pointers.size >= 2) {
      const next = this.measurePinch();
      if (this.pinch && next) {
        const scale = this.pinch.distance / Math.max(next.distance, 1);
        this.zoom(scale);
        const mdx = next.mid.x - this.pinch.mid.x;
        const mdy = next.mid.y - this.pinch.mid.y;
        this.pan(mdx, mdy);
        if (!this.mode2d) {
          let twist = next.angle - this.pinch.angle;
          twist = Math.atan2(Math.sin(twist), Math.cos(twist));
          this.theta -= twist;
          this.apply();
        }
      }
      this.pinch = next;
      return;
    }

    const moved = Math.hypot(p.x - p.startX, p.y - p.startY) > TAP_DISTANCE;
    if (!moved) return;
    const panning = p.button === 1 || (p.button === 0 && e.shiftKey) || (this.mode2d && p.button !== 2);
    if (panning) this.pan(dx, dy);
    else this.orbit(dx, dy);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const isTap =
      e.type === 'pointerup' &&
      p.button === 0 &&
      Math.hypot(e.clientX - p.startX, e.clientY - p.startY) <= TAP_DISTANCE &&
      performance.now() - p.startTime < TAP_TIME &&
      this.pointers.size === 0;
    if (isTap && this.element) {
      const rect = this.element.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.options.onTap(ndc, e);
    }
  };

  private measurePinch(): { distance: number; angle: number; mid: THREE.Vector2 } | null {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return null;
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mid: new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2),
    };
  }
}
