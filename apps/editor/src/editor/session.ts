import { computed, effect, signal } from '@preact/signals';
import {
  AddSubtreeCommand,
  CommandHistory,
  DeleteEntityCommand,
  EnvironmentCommand,
  GameRuntime,
  HudCommand,
  RenameCommand,
  ReparentCommand,
  SceneModel,
  SetComponentCommand,
  SetFlagCommand,
  TransformCommand,
  UserFacingError,
  addEntityCommand,
  createCameraEntity,
  createEntity,
  createLightEntity,
  createPrimitive,
  defaultAnimator,
  defaultCollider,
  log,
  type Command,
  type Components,
  type Entity,
  type EntityFlag,
  type HistoryState,
  type LightType,
  type PrimitiveType,
  type ProjectAssetMeta,
  type ProjectManifest,
  type SceneEnvironment,
  type SceneHud,
  type Transform,
} from '@mythic-forge/core';
import { PlayInput, Viewport, type AssetSource, type GizmoMode, type ViewportStats } from '@mythic-forge/renderer';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { refreshProjects, reportError, settings, svc, toast } from '../app/state.ts';
import { config } from '../lib/config.ts';
import { currentQuality, powerPreference } from '../lib/quality.ts';
import type { EditPhase } from '../ui/fields.tsx';
import { AudioPlayer } from './audio.ts';

export type PlayState = 'edit' | 'playing' | 'paused';

export interface HudState {
  title: string;
  showScore: boolean;
  score: number;
  collected: number;
  total: number;
  won: string | null;
}

const RECOVERY_DEBOUNCE_MS = 15_000;

/**
 * Everything the editor UI needs for one open project, independent of layout (desktop/phone).
 * Nothing runs on a timer unless there are unsaved changes.
 */
export class EditorSession {
  readonly projectId: string;
  readonly scene: SceneModel;
  readonly history: CommandHistory;
  readonly manifest = signal<ProjectManifest>(null as unknown as ProjectManifest);
  readonly scenePath: string;
  readonly selection = signal<string | null>(null);
  readonly revision = signal(0);
  readonly savedRevision = signal(0);
  readonly historyState = signal<HistoryState>({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null, size: 0 });
  readonly assets = signal<ProjectAssetMeta[]>([]);
  readonly playState = signal<PlayState>('edit');
  readonly hud = signal<HudState | null>(null);
  readonly saving = signal(false);
  readonly gizmoMode = signal<GizmoMode>('translate');
  readonly stats = signal<ViewportStats | null>(null);
  readonly qualityNotice = signal<string | null>(null);
  readonly contextLost = signal(false);
  readonly dirty = computed(() => this.revision.value !== this.savedRevision.value);
  private readonly profileKey = computed(() => `${this.manifest.value.performanceProfile}|${this.manifest.value.customQuality}`);

  viewport: Viewport | null = null;
  readonly input = new PlayInput();
  private runtime: GameRuntime | null = null;
  private readonly audio: AudioPlayer;
  private disposers: (() => void)[] = [];
  private playDisposers: (() => void)[] = [];
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private constructor(manifest: ProjectManifest, scenePath: string, scene: SceneModel) {
    this.projectId = manifest.id;
    this.manifest.value = manifest;
    this.scenePath = scenePath;
    this.scene = scene;
    this.history = new CommandHistory({ maxEntries: settings.value.editor.historyLimit });
    this.audio = new AudioPlayer(svc().store, manifest.id);
    this.disposers.push(
      this.scene.events.on('change', () => {
        this.revision.value = this.scene.revision;
        this.onChanged();
      }),
      this.history.events.on('change', (s) => (this.historyState.value = s)),
    );
  }

  static async open(projectId: string, recovered: boolean): Promise<EditorSession> {
    const { store, recovery } = svc();
    const result = await store.open(projectId);
    if (!result.ok) throw new UserFacingError('open-failed', result.message, result.details.join('\n'));
    let doc = result.scene;
    let recoveredOk = false;
    if (recovered) {
      const snap = await recovery.read(projectId);
      if (snap && snap.scenePath === result.scenePath) {
        doc = snap.scene;
        recoveredOk = true;
      }
    }
    const session = new EditorSession(result.manifest, result.scenePath, new SceneModel(doc));
    await recovery.beginSession(projectId);
    await session.loadAssets();
    if (recoveredOk) {
      session.savedRevision.value = -1; // unsaved until the user saves
      toast('Recovered your unsaved changes. Save to keep them.', 'info');
    }
    for (const w of result.warnings.slice(0, 3)) log.warn('Project', `Repaired while loading: ${w}`);
    if (config.isDev) (window as unknown as { __mfSession?: EditorSession }).__mfSession = session;
    return session;
  }

  // ---- viewport ------------------------------------------------------------------------------

  attach(container: HTMLElement): void {
    const store = svc().store;
    const source: AssetSource = {
      load: async (assetId) => {
        const meta = await store.getAsset(this.projectId, assetId);
        if (!meta) return null;
        const bytes = await store.readAssetFile(this.projectId, assetId);
        return bytes ? { bytes, format: meta.fileFormat, generateMipmaps: meta.importSettings?.generateMipmaps ?? true } : null;
      },
    };
    const s = settings.value;
    const viewport = new Viewport({
      container,
      assets: source,
      quality: currentQuality(this.manifest.value).settings,
      editor: true,
      transformControls: TransformControls,
      mode2d: this.manifest.value.editorMode === '2d',
      showGrid: s.editor.showGrid,
      gizmoSize: s.editor.gizmoSize,
      powerPreference: powerPreference(),
      geometryDetail: s.graphics.editorPreviewQuality,
      adaptiveQuality: s.performance.adaptiveQuality,
    });
    this.viewport = viewport;
    viewport.setScene(this.scene);
    viewport.setGizmoMode(this.gizmoMode.value);
    viewport.setSnapping(s.editor.snapTranslate, s.editor.snapRotate);

    const platform = svc().platform;
    this.disposers.push(
      viewport.events.on('select', ({ id }) => this.select(id)),
      viewport.events.on('transformPreview', ({ id, transform }) => this.scene.setTransform(id, transform)),
      viewport.events.on('transformCommit', ({ id, before, after }) => {
        this.history.record(new TransformCommand(this.scene, id, before, after, 'Transform'));
        this.history.breakMerge();
      }),
      viewport.events.on('stats', (st) => (this.stats.value = st)),
      viewport.events.on('quality', (c) => {
        this.qualityNotice.value = c.direction === 'down' ? c.reason : null;
        if (c.thermal) toast(c.reason, 'warning');
        else log.info('Performance', c.reason);
      }),
      viewport.events.on('contextLost', ({ lost }) => {
        this.contextLost.value = lost;
        if (lost) toast('Graphics were reset by the system. The view will return shortly.', 'warning');
      }),
      viewport.events.on('noCamera', ({ message }) => toast(message, 'warning')),
      platform.lifecycle.subscribe((state) => {
        const hidden = state !== 'active';
        viewport.setPaused(hidden);
        if (hidden) {
          if (this.playState.value === 'playing') this.pause();
          svc().downloads.pauseAll();
          void this.writeRecovery();
        }
      }),
      platform.lifecycle.onBeforeExit(() => void this.writeRecovery()),
      effect(() => {
        const st = settings.value;
        void this.profileKey.value; // re-apply only when the project's performance profile changes
        viewport.setQuality(currentQuality(this.manifest.peek()).settings);
        viewport.setShowGrid(st.editor.showGrid);
        viewport.setGizmoSize(st.editor.gizmoSize);
        viewport.setSnapping(st.editor.snapTranslate, st.editor.snapRotate);
        viewport.setAdaptiveQuality(st.performance.adaptiveQuality);
        viewport.setStatsEnabled(st.performance.showOverlay);
      }),
    );
    viewport.setPaused(platform.lifecycle.state !== 'active');
  }

  setGizmoMode(mode: GizmoMode): void {
    this.gizmoMode.value = mode;
    this.viewport?.setGizmoMode(mode);
  }

  select(id: string | null): void {
    if (id && !this.scene.has(id)) id = null;
    this.selection.value = id;
    this.viewport?.setSelection(id);
  }

  focusSelected(): void {
    if (this.selection.value) this.viewport?.focusSelection();
    else this.viewport?.frameAll();
  }

  // ---- editing ---------------------------------------------------------------------------------

  execute(command: Command): boolean {
    if (this.playState.value !== 'edit') {
      toast('Stop play mode to edit the scene.', 'info');
      return false;
    }
    try {
      this.history.execute(command);
      return true;
    } catch (error) {
      reportError(error, `"${command.label}" could not be completed.`);
      return false;
    }
  }

  private placementPoint(): [number, number, number] {
    const t = this.viewport?.getCameraState()?.target ?? [0, 0, 0];
    const snap = (v: number): number => Math.round(v * 2) / 2;
    return [snap(t[0]), Math.max(0, snap(t[1])), snap(t[2])];
  }

  addEntity(entity: Entity, parent: string | null = null): void {
    if (this.execute(addEntityCommand(this.scene, entity, parent))) {
      this.history.breakMerge();
      this.select(entity.id);
    }
  }

  addPrimitive(type: PrimitiveType): void {
    const e = createPrimitive(type);
    const p = this.placementPoint();
    e.transform.position = [p[0], p[1] + (type === 'plane' ? 0 : type === 'capsule' ? 1 : 0.5), p[2]];
    this.addEntity(e);
  }

  addLight(type: LightType): void {
    const e = createLightEntity(type);
    if (type !== 'directional') {
      const p = this.placementPoint();
      e.transform.position = [p[0], p[1] + 3, p[2]];
    }
    this.addEntity(e);
  }

  addCamera(): void {
    const hasMain = this.scene.all().some((e) => e.components.camera?.isMain);
    const e = createCameraEntity(!hasMain);
    if (hasMain) e.name = 'Camera';
    this.addEntity(e);
  }

  addEmpty(): void {
    const e = createEntity('Empty');
    e.transform.position = this.placementPoint();
    this.addEntity(e);
  }

  /** Places a model asset so it sits on the ground at the view centre, with a matching collider. */
  addModel(meta: ProjectAssetMeta): void {
    const e = createEntity(meta.name, { model: { assetId: meta.id, castShadow: true, receiveShadow: true } });
    // Animated models play their first clip in play mode until the user picks another.
    if (meta.stats.clips?.length) e.components.animator = defaultAnimator();
    const p = this.placementPoint();
    const min = meta.stats.boundsMin;
    const max = meta.stats.boundsMax;
    e.transform.position = [p[0], p[1] - (min?.[1] ?? 0), p[2]];
    const wantsCollider = meta.importSettings ? meta.importSettings.generateCollider : meta.provenance.source !== 'user-import';
    if (wantsCollider && min && max) {
      const size: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
      e.components.collider = {
        ...defaultCollider(size.map((v) => Math.max(0.01, Math.round(v * 1000) / 1000)) as [number, number, number]),
        center: [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2].map((v) => Math.round(v * 1000) / 1000) as [number, number, number],
      };
      e.isStatic = true;
    }
    this.addEntity(e);
  }

  deleteSelected(): void {
    const id = this.selection.value;
    if (!id) return;
    if (this.execute(new DeleteEntityCommand(this.scene, id))) this.select(null);
  }

  duplicateSelected(): void {
    const id = this.selection.value;
    if (!id) return;
    const clone = this.scene.cloneSubtree(id);
    const root = clone.entities[0]!;
    root.transform.position = [root.transform.position[0] + 1, root.transform.position[1], root.transform.position[2]];
    if (this.execute(new AddSubtreeCommand(this.scene, clone, `Duplicate ${this.scene.get(id)?.name ?? ''}`))) {
      this.history.breakMerge();
      this.select(clone.rootId);
    }
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed || trimmed === this.scene.get(id)?.name) return;
    this.execute(new RenameCommand(this.scene, id, trimmed));
  }

  setFlag(id: string, flag: EntityFlag, value: boolean): void {
    this.execute(new SetFlagCommand(this.scene, id, flag, value));
    if (flag === 'locked' && value && this.selection.value === id) this.viewport?.setSelection(id);
  }

  reparent(id: string, parent: string | null): void {
    if (!ReparentCommand.isValid(this.scene, id, parent)) {
      toast("An object can't be placed inside itself.", 'info');
      return;
    }
    this.execute(new ReparentCommand(this.scene, id, parent));
  }

  updateTransform(id: string, next: Transform, phase: EditPhase, field: string): void {
    const before = this.scene.get(id)?.transform;
    if (!before) return;
    // Live edits (dragging a value) and the final commit merge into one undo step per field.
    this.execute(new TransformCommand(this.scene, id, before, next, 'Transform', `inspector:${id}:${field}`));
    if (phase === 'commit') this.history.breakMerge();
  }

  updateComponent<K extends keyof Components>(id: string, key: K, value: Components[K] | undefined, label: string, phase: EditPhase = 'commit', field = ''): void {
    this.execute(new SetComponentCommand(this.scene, id, key, value, label, `component:${id}:${String(key)}:${field}`));
    if (phase === 'commit') this.history.breakMerge();
  }

  updateEnvironment(env: SceneEnvironment, phase: EditPhase, field: string): void {
    this.execute(new EnvironmentCommand(this.scene, env, `env:${field}`));
    if (phase === 'commit') this.history.breakMerge();
  }

  updateHud(hud: SceneHud): void {
    this.execute(new HudCommand(this.scene, hud));
    this.history.breakMerge();
  }

  undo(): void {
    if (this.playState.value !== 'edit') return;
    try {
      const label = this.history.undo();
      if (label) log.debug('Editor', `Undo: ${label}`);
      if (this.selection.value && !this.scene.has(this.selection.value)) this.select(null);
    } catch (error) {
      reportError(error, 'Undo failed. The undo history was cleared to protect your scene.');
    }
  }

  redo(): void {
    if (this.playState.value !== 'edit') return;
    try {
      this.history.redo();
      if (this.selection.value && !this.scene.has(this.selection.value)) this.select(null);
    } catch (error) {
      reportError(error, 'Redo failed. The undo history was cleared to protect your scene.');
    }
  }

  // ---- assets ----------------------------------------------------------------------------------

  async loadAssets(): Promise<void> {
    this.assets.value = await svc().store.listAssets(this.projectId);
  }

  assetUsage(assetId: string): number {
    let n = 0;
    for (const e of this.scene.all()) {
      const c = e.components;
      if (c.model?.assetId === assetId || c.material?.textureAssetId === assetId || c.audioSource?.assetId === assetId) n++;
      else if (c.behaviours?.some((b) => b.type === 'collectible' && b.soundAssetId === assetId)) n++;
    }
    return n;
  }

  /** Makes objects that use an asset load it again (after the asset file was replaced). */
  reloadAssetUsers(assetId: string): void {
    this.viewport?.invalidateAsset(assetId);
    for (const e of this.scene.all()) {
      if (e.components.model?.assetId === assetId) this.scene.setComponent(e.id, 'model', e.components.model);
      else if (e.components.material?.textureAssetId === assetId) this.scene.setComponent(e.id, 'material', e.components.material);
    }
  }

  async removeAsset(meta: ProjectAssetMeta): Promise<void> {
    await svc().store.removeAsset(this.projectId, meta.id);
    this.viewport?.invalidateAsset(meta.id);
    await this.loadAssets();
    // Scenes referencing it keep the reference (shown as a missing-asset marker) so undo stays valid.
  }

  // ---- persistence -----------------------------------------------------------------------------

  private onChanged(): void {
    if (this.playState.value !== 'edit') return;
    if (!this.recoveryTimer) {
      this.recoveryTimer = setTimeout(() => {
        this.recoveryTimer = null;
        void this.writeRecovery();
      }, RECOVERY_DEBOUNCE_MS);
    }
    const minutes = settings.value.editor.autosaveMinutes;
    if (minutes > 0 && !this.autosaveTimer) {
      this.autosaveTimer = setTimeout(() => {
        this.autosaveTimer = null;
        if (this.disposed || !this.dirty.value) return;
        if (this.playState.value !== 'edit') {
          this.onChanged();
          return;
        }
        void this.save({ silent: true, backup: false });
      }, minutes * 60_000);
    }
  }

  async writeRecovery(): Promise<void> {
    if (!this.dirty.value || this.disposed) return;
    try {
      await svc().recovery.write({
        projectId: this.projectId,
        projectName: this.manifest.value.name,
        scenePath: this.scenePath,
        scene: this.scene.toJSON(),
        savedAt: new Date().toISOString(),
        baseModifiedAt: this.manifest.value.modifiedAt,
      });
    } catch (error) {
      log.warn('Recovery', 'Recovery snapshot could not be written.', String(error));
    }
  }

  async save(options: { silent?: boolean; backup?: boolean } = {}): Promise<boolean> {
    if (this.saving.value) return false;
    this.saving.value = true;
    const revision = this.scene.revision;
    try {
      const { store, recovery } = svc();
      const thumbnail = await this.viewport?.captureThumbnail().catch(() => null);
      this.manifest.value = await store.save(this.manifest.value, this.scenePath, this.scene.toJSON(), { backup: options.backup ?? true });
      if (thumbnail) await store.writeThumbnail(this.projectId, thumbnail);
      this.savedRevision.value = revision;
      if (!this.dirty.value) await recovery.clear(this.projectId);
      if (this.autosaveTimer) {
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = null;
      }
      if (!options.silent) toast('Saved.', 'success', { timeoutMs: 1800 });
      else log.info('Editor', 'Auto-saved.');
      void refreshProjects();
      return true;
    } catch (error) {
      reportError(error, 'Your project could not be saved. Your changes are still open — try again.', () => void this.save(options));
      return false;
    } finally {
      this.saving.value = false;
    }
  }

  async updateManifest(patch: Partial<ProjectManifest>): Promise<void> {
    const next = { ...this.manifest.value, ...patch };
    this.manifest.value = await svc().store.save(next, this.scenePath, this.scene.toJSON(), { backup: false });
    this.savedRevision.value = this.scene.revision;
    void refreshProjects();
  }

  // ---- play mode -------------------------------------------------------------------------------

  play(): void {
    const viewport = this.viewport;
    if (!viewport) return;
    if (this.playState.value === 'paused') {
      viewport.setPlayPaused(false);
      this.playState.value = 'playing';
      return;
    }
    if (this.playState.value === 'playing') return;
    try {
      const doc = this.scene.toJSON();
      const runtime = new GameRuntime(doc, this.input, this.audio);
      this.runtime = runtime;
      this.hud.value = { title: doc.hud.title, showScore: doc.hud.showScore, score: 0, collected: 0, total: 0, won: null };
      this.playDisposers.push(
        runtime.events.on('score', (s) => {
          if (this.hud.value) this.hud.value = { ...this.hud.value, score: s.score, collected: s.collected, total: s.total };
        }),
        runtime.events.on('won', (w) => {
          if (this.hud.value) this.hud.value = { ...this.hud.value, won: w.message };
        }),
        runtime.events.on('error', (e) => toast(`A behaviour stopped with an error: ${e.message}`, 'warning')),
        // Thermal/battery signals are only observed while the game runs.
        svc().platform.power.subscribe((p) => viewport.onThermal(p.thermal)),
      );
      runtime.start();
      this.input.attach(viewport.canvas);
      if (config.isDev || settings.value.developer.devMode) {
        // Developer aid: inspect the running game from the browser console.
        (window as unknown as { __mfPlay?: unknown }).__mfPlay = { runtime, input: this.input, viewport };
      }
      this.select(null);
      viewport.startPlay(runtime);
      this.playState.value = 'playing';
      log.info('Play', 'Play mode started.');
    } catch (error) {
      this.stop();
      reportError(error, 'The game could not start.');
    }
  }

  pause(): void {
    if (this.playState.value !== 'playing') return;
    this.viewport?.setPlayPaused(true);
    this.audio.stopAll();
    this.playState.value = 'paused';
  }

  stop(): void {
    if (this.playState.value === 'edit' && !this.runtime) return;
    for (const d of this.playDisposers) d();
    this.playDisposers = [];
    this.input.detach();
    this.audio.stopAll();
    this.runtime?.stop();
    this.runtime = null;
    this.viewport?.stopPlay();
    this.hud.value = null;
    this.qualityNotice.value = null;
    this.playState.value = 'edit';
    log.info('Play', 'Play mode stopped; the scene was restored.');
  }

  togglePlay(): void {
    if (this.playState.value === 'edit') this.play();
    else this.stop();
  }

  // ---- teardown --------------------------------------------------------------------------------

  async close(): Promise<void> {
    this.stop();
    if (this.dirty.value) await this.writeRecovery();
    else {
      await svc().recovery.clear(this.projectId);
    }
    await svc().recovery.endSession();
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    for (const d of this.disposers) d();
    this.disposers = [];
    this.viewport?.dispose();
    this.viewport = null;
    this.audio.dispose();
  }
}
