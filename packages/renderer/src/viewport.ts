import {
  AdaptiveQualityGovernor,
  Emitter,
  FrameScheduler,
  browserSchedulerHost,
  log,
  type GameRuntime,
  type GovernorChange,
  type InputSource,
  type QualitySettings,
  type SceneModel,
  type SchedulerHost,
  type ThermalState,
  type Transform,
} from '@mythic-forge/core';
import * as THREE from 'three';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AssetCache, type AssetSource } from './assets/asset-cache.ts';
import { canvasToBytes, makeCanvas } from './assets/images.ts';
import { EditorCameraController } from './camera-controller.ts';
import { GeometryCache, createColliderBox } from './primitives.ts';
import { SceneView } from './scene-view.ts';

export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface ViewportOptions {
  container: HTMLElement;
  assets: AssetSource;
  quality: QualitySettings;
  /** false for exported games (no gizmos, helpers or editor camera). */
  editor: boolean;
  /**
   * The transform gizmo class (three/addons TransformControls). Passed in by the editor so that
   * exported games don't bundle editor-only code. Required when `editor` is true.
   */
  transformControls?: typeof TransformControls;
  mode2d: boolean;
  showGrid: boolean;
  gizmoSize: number;
  powerPreference: WebGLPowerPreference;
  geometryDetail: 'low' | 'full';
  adaptiveQuality: boolean;
  host?: SchedulerHost;
}

export interface ViewportStats {
  fps: number;
  frameMs: number;
  workMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  loadedAssets: number;
  entities: number;
  jsHeapMB: number | null;
  framesRendered: number;
  renderScale: number;
  qualityRung: number;
}

export interface ViewportEvents {
  select: { id: string | null };
  transformPreview: { id: string; transform: Transform };
  transformCommit: { id: string; before: Transform; after: Transform };
  quality: GovernorChange;
  stats: ViewportStats;
  contextLost: { lost: boolean };
  noCamera: { message: string };
}

const RAD = 180 / Math.PI;
const round = (v: number, p = 1e4): number => Math.round(v * p) / p;

/**
 * The 3D view. In the editor it renders only when something changes; in play mode it runs
 * a frame-limited loop that stops entirely when the app is hidden.
 */
export class Viewport {
  readonly events = new Emitter<ViewportEvents>();
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly view: SceneView;
  private readonly geometry: GeometryCache;
  private readonly assets: AssetCache;
  private readonly scheduler: FrameScheduler;
  private readonly governor: AdaptiveQualityGovernor;
  private editorCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private controller: EditorCameraController | null = null;
  private gizmo: TransformControls | null = null;
  private gizmoHelper: THREE.Object3D | null = null;
  private grid: THREE.GridHelper | null = null;
  private colliderBox: THREE.LineSegments | null = null;
  private envTexture: THREE.Texture | null = null;
  private model: SceneModel | null = null;
  private unsubscribeModel: (() => void) | null = null;
  private selection: string | null = null;
  private dragBefore: Transform | null = null;
  private quality: QualitySettings;
  private baseQuality: QualitySettings;
  private options: ViewportOptions;
  private resizeObserver: ResizeObserver;
  private runtime: GameRuntime | null = null;
  private runtimePaused = false;
  private statsEnabled = false;
  private lastStatsAt = 0;
  private frameTimes: number[] = [];
  private workTimes: number[] = [];
  private contextLost = false;
  private disposed = false;
  private noCameraWarned = false;

  constructor(options: ViewportOptions) {
    this.options = options;
    this.quality = { ...options.quality };
    this.baseQuality = { ...options.quality };
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mf-viewport-canvas';
    this.canvas.setAttribute('aria-label', options.editor ? '3D scene view' : 'Game view');
    options.container.appendChild(this.canvas);
    this.renderer = this.createRenderer();

    this.geometry = new GeometryCache(options.geometryDetail);
    this.assets = new AssetCache(options.assets, this.quality.textureMaxSize);
    this.view = new SceneView({
      editor: options.editor,
      geometry: this.geometry,
      assets: this.assets,
      quality: () => this.quality,
      onAsyncChange: () => this.invalidate(),
    });
    this.scene.add(this.view.root);

    this.editorCamera = this.makeEditorCamera(options.mode2d);
    this.scheduler = new FrameScheduler(options.host ?? browserSchedulerHost(), (info) => this.frame(info.dt, info.intervalMs, info.now));
    this.governor = new AdaptiveQualityGovernor(this.quality);
    this.governor.setEnabled(options.adaptiveQuality);
    this.governor.events.on('change', (c) => {
      this.applyQuality(c.settings, false);
      this.events.emit('quality', c);
    });

    if (options.editor) this.setupEditorTools();
    this.applyQuality(this.quality, true);

    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(options.container);
    this.resize();
  }

  // ---- setup -----------------------------------------------------------------------------------

  private createRenderer(): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality.antialias,
      powerPreference: this.options.powerPreference,
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    // PCF (filtered) shadows; three r186 folded the "soft" variant into PCFShadowMap.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = true;
    return renderer;
  }

  private makeEditorCamera(mode2d: boolean): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    if (mode2d) {
      const cam = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.05, 2000);
      cam.zoom = 1;
      return cam;
    }
    return new THREE.PerspectiveCamera(55, 1, 0.05, 2000);
  }

  private setupEditorTools(): void {
    // Gizmo listeners must be registered before the camera controller's, so the controller
    // can see that the gizmo grabbed the pointer.
    const Gizmo = this.options.transformControls;
    if (!Gizmo) throw new Error('Viewport: editor mode requires the transformControls option');
    const gizmo = new Gizmo(this.editorCamera, this.canvas);
    gizmo.setSize(this.options.gizmoSize);
    gizmo.addEventListener('change', () => this.invalidate());
    gizmo.addEventListener('dragging-changed', (e) => {
      const dragging = (e as unknown as { value: boolean }).value;
      if (!this.selection || !this.model) return;
      if (dragging) {
        this.dragBefore = structuredClone(this.model.get(this.selection)?.transform ?? null);
      } else if (this.dragBefore) {
        const after = this.readGizmoTransform();
        if (after) this.events.emit('transformCommit', { id: this.selection, before: this.dragBefore, after });
        this.dragBefore = null;
      }
    });
    gizmo.addEventListener('objectChange', () => {
      if (!this.selection) return;
      const t = this.readGizmoTransform();
      if (t) this.events.emit('transformPreview', { id: this.selection, transform: t });
      this.updateColliderBox();
    });
    this.gizmo = gizmo;
    this.gizmoHelper = gizmo.getHelper();
    this.scene.add(this.gizmoHelper);

    this.controller = new EditorCameraController(this.editorCamera, {
      isPointerCaptured: () => gizmo.dragging || gizmo.axis !== null,
      onChange: () => this.invalidate(),
      onTap: (ndc) => this.pickAt(ndc),
    });
    this.controller.attach(this.canvas);
    if (this.options.mode2d) this.controller.setCamera(this.editorCamera, true);

    this.grid = new THREE.GridHelper(100, 100, 0x5a5145, 0x302c28);
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.6;
    if (this.options.mode2d) this.grid.rotation.x = Math.PI / 2;
    this.grid.visible = this.options.showGrid;
    this.grid.raycast = () => undefined;
    this.scene.add(this.grid);
  }

  private readGizmoTransform(): Transform | null {
    const group = this.selection ? this.view.groupOf(this.selection) : undefined;
    if (!group) return null;
    return {
      position: [round(group.position.x), round(group.position.y), round(group.position.z)],
      rotation: [round(group.rotation.x * RAD, 100), round(group.rotation.y * RAD, 100), round(group.rotation.z * RAD, 100)],
      scale: [round(group.scale.x), round(group.scale.y), round(group.scale.z)],
    };
  }

  // ---- scene binding ---------------------------------------------------------------------------

  setScene(model: SceneModel): void {
    this.unsubscribeModel?.();
    this.model = model;
    this.view.build(model.document);
    this.view.applyEnvironment(model.document.environment, this.scene, this.quality);
    this.unsubscribeModel = model.events.on('change', (change) => {
      if (this.runtime) return; // play mode works on its own copy
      this.view.handle(change, model);
      if (change.type === 'environment' || change.type === 'reset') {
        this.view.applyEnvironment(model.document.environment, this.scene, this.quality);
      }
      if (change.type === 'removed' && this.selection && change.ids.includes(this.selection)) this.setSelection(null);
      if (this.selection) this.attachGizmo();
      this.updateColliderBox();
      this.invalidate();
    });
    this.frameAll();
    this.invalidate();
  }

  setSelection(id: string | null): void {
    this.selection = id;
    this.attachGizmo();
    this.updateColliderBox();
    this.invalidate();
  }

  private attachGizmo(): void {
    if (!this.gizmo) return;
    const group = this.selection ? this.view.groupOf(this.selection) : undefined;
    const locked = this.selection ? this.model?.get(this.selection)?.locked : false;
    if (group && !locked && !this.runtime) {
      if (this.gizmo.object !== group) this.gizmo.attach(group);
    } else if (this.gizmo.object) {
      this.gizmo.detach();
    }
  }

  private updateColliderBox(): void {
    if (this.colliderBox) {
      this.colliderBox.removeFromParent();
      this.colliderBox.geometry.dispose();
      (this.colliderBox.material as THREE.Material).dispose();
      this.colliderBox = null;
    }
    if (!this.options.editor || this.runtime || !this.selection || !this.model) return;
    const col = this.model.get(this.selection)?.components.collider;
    const group = this.view.groupOf(this.selection);
    if (!col || !group) return;
    this.colliderBox = createColliderBox(
      { x: col.size[0], y: col.size[1], z: col.size[2] },
      { x: col.center[0], y: col.center[1], z: col.center[2] },
      col.isTrigger,
    );
    group.add(this.colliderBox);
  }

  setGizmoMode(mode: GizmoMode): void {
    this.gizmo?.setMode(mode);
    this.invalidate();
  }

  setSnapping(translate: number, rotateDeg: number): void {
    this.gizmo?.setTranslationSnap(translate > 0 ? translate : null);
    this.gizmo?.setRotationSnap(rotateDeg > 0 ? rotateDeg / RAD : null);
  }

  setGizmoSize(size: number): void {
    this.gizmo?.setSize(size);
    this.invalidate();
  }

  setShowGrid(show: boolean): void {
    if (this.grid) this.grid.visible = show && !this.runtime;
    this.invalidate();
  }

  private pickAt(ndc: THREE.Vector2): void {
    if (this.runtime) return;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.editorCamera);
    const id = this.view.pick(raycaster);
    this.events.emit('select', { id });
  }

  focusSelection(): void {
    const box = this.selection ? this.view.bounds(this.selection) : null;
    if (!box || !this.controller) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.controller.focus(sphere.center, sphere.radius);
  }

  frameAll(): void {
    if (!this.controller) return;
    const box = new THREE.Box3();
    this.view.root.updateWorldMatrix(true, true);
    this.view.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.userData.kind !== 'editor-helper') box.expandByObject(mesh);
    });
    if (box.isEmpty()) {
      this.controller.focus(new THREE.Vector3(0, 0.5, 0), 4);
      return;
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    // Very large grounds would push the camera far away; cap the framing radius.
    this.controller.focus(sphere.center.setY(Math.max(0, sphere.center.y)), Math.min(sphere.radius, 18));
  }

  getCameraState() {
    return this.controller?.getState() ?? null;
  }

  setCameraState(state: ReturnType<EditorCameraController['getState']>): void {
    this.controller?.setState(state);
  }

  // ---- quality ---------------------------------------------------------------------------------

  /** Base quality from settings/profile; the governor may lower it further in play mode. */
  setQuality(q: QualitySettings): void {
    const needsNewContext = q.antialias !== this.baseQuality.antialias;
    this.baseQuality = { ...q };
    this.governor.reset(q, performance.now());
    this.applyQuality(this.governor.current, true);
    if (needsNewContext) log.info('Viewport', 'Anti-aliasing changes apply the next time the editor is opened.');
  }

  setAdaptiveQuality(enabled: boolean): void {
    this.governor.setEnabled(enabled);
    if (!enabled) {
      this.governor.reset(this.baseQuality, performance.now());
      this.applyQuality(this.baseQuality, false);
    }
  }

  onThermal(state: ThermalState): void {
    if (state === 'unknown') return;
    this.governor.onThermal(state, performance.now());
  }

  private applyQuality(q: QualitySettings, full: boolean): void {
    this.quality = { ...q };
    this.renderer.shadowMap.enabled = q.shadows !== 'off';
    this.renderer.shadowMap.type = q.shadows === 'low' ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    this.view.applyQuality(q);
    if (this.model) this.view.applyEnvironment(this.model.document.environment, this.scene, q);
    if (q.reflections && !this.envTexture) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const room = new RoomEnvironment();
      this.envTexture = pmrem.fromScene(room, 0.04).texture;
      room.dispose();
      pmrem.dispose();
    }
    this.scene.environment = q.reflections ? this.envTexture : null;
    this.scene.environmentIntensity = 0.35;
    if (!q.reflections && this.envTexture && full) {
      this.envTexture.dispose();
      this.envTexture = null;
    }
    this.scheduler.setTargetFps(q.targetFps);
    this.resize();
  }

  // ---- lifecycle ---------------------------------------------------------------------------------

  invalidate(): void {
    this.scheduler.invalidate();
  }

  /** Called when the app is hidden/backgrounded: no rendering at all. */
  setPaused(paused: boolean): void {
    this.scheduler.setPaused(paused);
  }

  /** Moves the view into another element (e.g. when the editor switches between phone and desktop layouts). */
  setContainer(container: HTMLElement): void {
    if (container === this.options.container) return;
    this.resizeObserver.unobserve(this.options.container);
    this.options = { ...this.options, container };
    container.appendChild(this.canvas);
    this.resizeObserver.observe(container);
    this.resize();
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.options.container;
    const w = Math.max(1, clientWidth);
    const h = Math.max(1, clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio) * this.quality.renderScale;
    this.renderer.setPixelRatio(Math.max(0.25, dpr));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    const aspect = w / h;
    if (this.editorCamera instanceof THREE.PerspectiveCamera) {
      this.editorCamera.aspect = aspect;
    } else {
      const half = 5;
      this.editorCamera.left = -half * aspect;
      this.editorCamera.right = half * aspect;
      this.editorCamera.top = half;
      this.editorCamera.bottom = -half;
    }
    this.editorCamera.updateProjectionMatrix();
    this.invalidate();
  }

  // ---- play mode -------------------------------------------------------------------------------

  startPlay(runtime: GameRuntime): void {
    this.runtime = runtime;
    this.runtimePaused = false;
    this.noCameraWarned = false;
    this.gizmo?.detach();
    if (this.gizmoHelper) this.gizmoHelper.visible = false;
    if (this.grid) this.grid.visible = false;
    this.updateColliderBox();
    this.view.setPlaying(true);
    if (this.model) this.view.syncAll(this.model.document);
    this.governor.reset(this.baseQuality, performance.now());
    this.applyQuality(this.governor.current, false);
    this.frameTimes = [];
    this.workTimes = [];
    this.scheduler.setMode('continuous');
  }

  setPlayPaused(paused: boolean): void {
    this.runtimePaused = paused;
    this.scheduler.setMode(paused ? 'on-demand' : 'continuous');
    this.invalidate();
  }

  stopPlay(): void {
    this.runtime = null;
    this.scheduler.setMode('on-demand');
    this.view.setPlaying(false);
    if (this.model) this.view.syncAll(this.model.document);
    if (this.gizmoHelper) this.gizmoHelper.visible = true;
    if (this.grid) this.grid.visible = this.options.showGrid;
    this.governor.reset(this.baseQuality, performance.now());
    this.applyQuality(this.baseQuality, false);
    this.attachGizmo();
    this.updateColliderBox();
    this.invalidate();
  }

  /** Exported builds: the viewport shows only the game. */
  get isPlaying(): boolean {
    return this.runtime !== null;
  }

  // ---- frame -----------------------------------------------------------------------------------

  private frame(dt: number, intervalMs: number, now: number): void {
    if (this.contextLost || this.disposed) return;
    const start = performance.now();
    let camera: THREE.Camera = this.editorCamera;
    if (this.runtime) {
      if (!this.runtimePaused) {
        this.runtime.update(dt);
        for (const id of this.runtime.changed) {
          const e = this.runtime.entities.get(id);
          if (e) this.view.setRuntimeTransform(id, e.position, e.rotation, e.scale, this.runtime.isActive(id));
        }
      }
      const { clientWidth, clientHeight } = this.options.container;
      const main = this.view.mainCamera(clientWidth / Math.max(1, clientHeight), this.quality.drawDistance);
      if (main) {
        camera = main;
      } else if (!this.noCameraWarned) {
        this.noCameraWarned = true;
        this.events.emit('noCamera', { message: 'This scene has no active Main Camera; showing the editor view instead.' });
      }
    }
    this.renderer.render(this.scene, camera);
    const work = performance.now() - start;

    if (this.runtime && !this.runtimePaused && intervalMs > 0) this.governor.sample(intervalMs, work, now);
    if (this.statsEnabled) this.collectStats(intervalMs, work, now);
  }

  setStatsEnabled(enabled: boolean): void {
    this.statsEnabled = enabled;
    this.frameTimes = [];
    this.workTimes = [];
    if (enabled) this.invalidate();
  }

  private collectStats(intervalMs: number, workMs: number, now: number): void {
    if (intervalMs > 0) this.frameTimes.push(intervalMs);
    this.workTimes.push(workMs);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    if (this.workTimes.length > 240) this.workTimes.shift();
    if (now - this.lastStatsAt < 500) return;
    this.lastStatsAt = now;
    const avg = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const frameMs = avg(this.frameTimes);
    const info = this.renderer.info;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    this.events.emit('stats', {
      fps: frameMs > 0 && this.runtime ? 1000 / frameMs : 0,
      frameMs,
      workMs: avg(this.workTimes),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      loadedAssets: this.assets.loadedCount,
      entities: this.view.size,
      jsHeapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
      framesRendered: this.scheduler.framesRendered,
      renderScale: this.quality.renderScale,
      qualityRung: this.governor.currentRung,
    });
  }

  get framesRendered(): number {
    return this.scheduler.framesRendered;
  }

  /** Recent intervals between rendered frames (ms). Recorded only while stats are enabled. */
  recentFrameIntervals(): number[] {
    return [...this.frameTimes];
  }

  /** Renders the current view into a small WebP (project thumbnails). */
  async captureThumbnail(width = 320, height = 180): Promise<Uint8Array | null> {
    if (this.contextLost) return null;
    if (this.gizmoHelper) this.gizmoHelper.visible = false;
    const gridVisible = this.grid?.visible ?? false;
    if (this.grid) this.grid.visible = false;
    this.view.setHelpersVisible(false);
    this.renderer.render(this.scene, this.editorCamera);
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    // Must copy in the same task as render(): the drawing buffer is not preserved.
    // Centre-crop to the thumbnail's aspect ratio so tall (phone) views aren't squashed.
    const sw = this.canvas.width;
    const sh = this.canvas.height;
    let cw = sw;
    let ch = sw / (width / height);
    if (ch > sh) {
      ch = sh;
      cw = sh * (width / height);
    }
    ctx?.drawImage(this.canvas, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, width, height);
    this.view.setHelpersVisible(!this.runtime);
    if (this.gizmoHelper) this.gizmoHelper.visible = !this.runtime;
    if (this.grid) this.grid.visible = gridVisible;
    this.invalidate();
    if (!ctx) return null;
    return canvasToBytes(canvas, 'image/webp', 0.8);
  }

  /** Resolves once all models/textures requested by the scene have loaded. */
  assetsSettled(): Promise<void> {
    return this.assets.settled();
  }

  /** Frees models/textures no entity uses any more. */
  trimAssets(): void {
    this.assets.trim(this.view.referencedAssets());
  }

  invalidateAsset(assetId: string): void {
    this.assets.invalidate(assetId);
  }

  private readonly onContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.scheduler.setPaused(true);
    log.warn('Viewport', 'The graphics context was lost. Rendering is paused until it is restored.');
    this.events.emit('contextLost', { lost: true });
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    if (this.model) this.view.build(this.model.document);
    this.envTexture = null;
    this.applyQuality(this.quality, true);
    this.scheduler.setPaused(false);
    log.info('Viewport', 'Graphics context restored.');
    this.events.emit('contextLost', { lost: false });
  };

  dispose(): void {
    this.disposed = true;
    this.scheduler.dispose();
    this.resizeObserver.disconnect();
    this.unsubscribeModel?.();
    this.controller?.detach();
    this.gizmo?.detach();
    this.gizmo?.dispose();
    this.view.dispose();
    this.geometry.dispose();
    void this.assets.dispose();
    this.envTexture?.dispose();
    this.grid?.geometry.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this.events.clear();
  }
}

export type { InputSource };
