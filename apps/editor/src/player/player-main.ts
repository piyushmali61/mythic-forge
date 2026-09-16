/**
 * Mythic Forge player — the runtime embedded in exported games.
 * Plain DOM (no UI framework) to keep exports small. Reads the scene and assets from the
 * #mf-data script element produced by src/build/web-export.ts.
 */
import {
  GameRuntime,
  SceneModel,
  base64ToBytes,
  classifyDevice,
  isRecord,
  resolveQuality,
  validateScene,
  type AudioSink,
  type FileFormat,
  type PerformanceProfileId,
  type QualityLevel,
} from '@mythic-forge/core';
import { PlayInput, Viewport, type AssetSource } from '@mythic-forge/renderer';
import { probeGpu } from '@mythic-forge/renderer/probe';

interface EmbeddedAsset {
  format: FileFormat;
  mime: string;
  mipmaps: boolean;
  data: string;
}

interface Notice {
  name: string;
  version: string;
  license: string;
  text: string;
}

const STYLE = `
.mfp-overlay{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(10,9,8,.82);z-index:10;text-align:center;padding:24px}
.mfp-title{font-size:26px;font-weight:700;letter-spacing:.06em}
.mfp-sub{color:#c3b8aa;font-size:14px}
.mfp-btn{font:inherit;font-weight:600;padding:12px 26px;border-radius:10px;border:1px solid #d6a84f;background:#d6a84f;color:#1a1409;cursor:pointer;min-width:140px}
.mfp-btn.ghost{background:transparent;color:#e9e1d5;border-color:#6b6055}
.mfp-hud{position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.35);padding:4px 14px;border-radius:999px;font-weight:650;text-shadow:0 1px 3px #000;pointer-events:none;white-space:nowrap}
.mfp-win{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);background:rgba(18,17,16,.85);border:1px solid #d6a84f;color:#d6a84f;padding:14px 22px;border-radius:12px;font-size:20px;font-weight:700;pointer-events:none}
.mfp-stick{position:fixed;left:24px;bottom:24px;width:128px;height:128px;border-radius:50%;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.3);touch-action:none}
.mfp-knob{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:rgba(255,255,255,.4)}
.mfp-jump{position:fixed;right:28px;bottom:36px;width:84px;height:84px;border-radius:50%;border:2px solid rgba(255,255,255,.4);background:rgba(214,168,79,.35);color:#fff;font:inherit;font-weight:700;touch-action:none}
.mfp-corner{position:fixed;top:10px;right:10px;display:flex;gap:6px;z-index:5}
.mfp-small{font:inherit;font-size:13px;padding:6px 10px;border-radius:8px;border:1px solid #6b6055;background:rgba(18,17,16,.7);color:#e9e1d5;cursor:pointer}
.mfp-credits{max-width:640px;width:100%;max-height:70vh;overflow:auto;text-align:left;background:#1a1816;border:1px solid #38322b;border-radius:12px;padding:16px;font-size:13px;line-height:1.5}
.mfp-credits h3{margin:12px 0 4px;font-size:14px}
.mfp-credits pre{white-space:pre-wrap;font-size:11px;color:#b9afa3}
.mfp-stats{position:fixed;left:8px;top:8px;font:11px/1.4 monospace;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px;pointer-events:none}
.mfp-canvas{display:block;width:100%;height:100%;touch-action:none}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function overlay(...children: HTMLElement[]): HTMLElement {
  const o = el('div', 'mfp-overlay');
  o.append(...children);
  document.body.append(o);
  return o;
}

function fatal(message: string): void {
  overlay(el('div', 'mfp-title', 'This game could not start'), el('div', 'mfp-sub', message));
}

function readPayload(): Record<string, unknown> | null {
  const node = document.getElementById('mf-data');
  if (!node?.textContent) return null;
  try {
    const data = JSON.parse(node.textContent) as unknown;
    return isRecord(data) && data.format === 'mythic-forge-web-build' ? data : null;
  } catch {
    return null;
  }
}

class EmbeddedAudio implements AudioSink {
  private playing = new Set<HTMLAudioElement>();
  private urls = new Map<string, string>();
  private readonly assets: Record<string, EmbeddedAsset>;

  constructor(assets: Record<string, EmbeddedAsset>) {
    this.assets = assets;
  }

  play(assetId: string, options: { volume: number; loop: boolean }): void {
    const a = this.assets[assetId];
    if (!a) return;
    let url = this.urls.get(assetId);
    if (!url) {
      url = URL.createObjectURL(new Blob([base64ToBytes(a.data) as Uint8Array<ArrayBuffer>], { type: a.mime }));
      this.urls.set(assetId, url);
    }
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, options.volume));
    audio.loop = options.loop;
    audio.addEventListener('ended', () => this.playing.delete(audio));
    this.playing.add(audio);
    void audio.play().catch(() => this.playing.delete(audio));
  }

  pauseAll(): void {
    for (const a of this.playing) a.pause();
  }

  resumeAll(): void {
    for (const a of this.playing) void a.play().catch(() => undefined);
  }

  stopAll(): void {
    this.pauseAll();
    this.playing.clear();
  }
}

function touchControls(input: PlayInput): HTMLElement {
  const wrap = el('div', '');
  const stick = el('div', 'mfp-stick');
  const knob = el('div', 'mfp-knob');
  stick.append(knob);
  const R = 52;
  let origin: { x: number; y: number; id: number } | null = null;
  const move = (e: PointerEvent): void => {
    if (!origin || origin.id !== e.pointerId) return;
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.setVirtualStick(dx / R, -dy / R);
  };
  const end = (e: PointerEvent): void => {
    if (origin?.id !== e.pointerId) return;
    origin = null;
    knob.style.transform = '';
    input.setVirtualStick(0, 0);
  };
  stick.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const r = stick.getBoundingClientRect();
    origin = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId };
    stick.setPointerCapture(e.pointerId);
    move(e);
  });
  stick.addEventListener('pointermove', move);
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
  const jump = el('button', 'mfp-jump', 'Jump');
  jump.type = 'button';
  jump.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    input.setVirtualJump(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) jump.addEventListener(ev, () => input.setVirtualJump(false));
  wrap.append(stick, jump);
  return wrap;
}

function creditsPanel(name: string, credits: string[], notices: Notice[], onClose: () => void): void {
  const box = el('div', 'mfp-credits');
  box.append(el('h3', '', name), el('div', '', 'Made with Mythic Forge by Mythic Bharat Studios.'));
  if (credits.length) {
    box.append(el('h3', '', 'Asset credits'));
    for (const c of credits) box.append(el('div', '', c));
  }
  if (notices.length) {
    box.append(el('h3', '', 'Open-source software'));
    for (const n of notices) {
      box.append(el('div', '', `${n.name} ${n.version} — ${n.license}`), el('pre', '', n.text));
    }
  }
  const close = el('button', 'mfp-btn ghost', 'Close');
  close.type = 'button';
  const o = overlay(box, close);
  close.addEventListener('click', () => {
    o.remove();
    onClose();
  });
}

function start(): void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);

  const payload = readPayload();
  if (!payload) return fatal('The game data is missing or damaged.');
  const sceneResult = validateScene(payload.scene);
  if (!sceneResult.ok) return fatal('The game scene is damaged.');
  const scene = sceneResult.value;
  const assets = (isRecord(payload.assets) ? payload.assets : {}) as Record<string, EmbeddedAsset>;
  const project = (isRecord(payload.project) ? payload.project : {}) as { name?: string; performanceProfile?: string; customQuality?: QualityLevel | null };
  const credits = Array.isArray(payload.credits) ? payload.credits.filter((c): c is string => typeof c === 'string') : [];
  const notices = (Array.isArray(payload.notices) ? payload.notices : []) as Notice[];
  const debug = payload.debug === true;
  const name = typeof project.name === 'string' ? project.name : 'Mythic Forge game';
  document.title = name;

  const gpu = probeGpu();
  if (!gpu.webgl2) return fatal('This browser or device does not support WebGL 2, which this game needs.');
  const nav = navigator as Navigator & { deviceMemory?: number };
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
  const tier = classifyDevice({
    isMobile,
    memoryGB: nav.deviceMemory ?? null,
    cpuCores: navigator.hardwareConcurrency ?? null,
    gpuRenderer: gpu.renderer,
    maxTextureSize: gpu.maxTextureSize,
    webgl2: gpu.webgl2,
  }).tier;
  const profiles: PerformanceProfileId[] = ['battery-saver', 'balanced', 'performance', 'custom'];
  const profile = profiles.find((p) => p === project.performanceProfile) ?? 'balanced';
  const quality = resolveQuality({
    deviceTier: tier,
    isMobile,
    batteryMode: 'balanced',
    projectProfile: profile,
    projectCustomLevel: project.customQuality ?? null,
    qualityOverride: typeof payload.quality === 'string' && payload.quality !== 'auto' ? (payload.quality as QualityLevel) : 'auto',
    fpsOverride: 'auto',
    lowPowerMode: false,
  }).settings;

  const container = document.getElementById('game');
  if (!container) return fatal('The page is missing its game container.');
  const source: AssetSource = {
    load: async (id) => {
      const a = assets[id];
      return a ? { bytes: base64ToBytes(a.data), format: a.format, generateMipmaps: a.mipmaps } : null;
    },
  };
  const viewport = new Viewport({
    container,
    assets: source,
    quality,
    editor: false,
    mode2d: false,
    showGrid: false,
    gizmoSize: 1,
    powerPreference: 'default',
    geometryDetail: tier === 'ultra-low' || tier === 'low' ? 'low' : 'full',
    adaptiveQuality: true,
  });
  viewport.canvas.classList.add('mfp-canvas');
  // Show the level behind the start screen (one frame, then idle).
  viewport.setScene(new SceneModel(scene));

  const input = new PlayInput();
  const audio = new EmbeddedAudio(assets);
  const hud = el('div', 'mfp-hud');
  hud.hidden = true;
  const win = el('div', 'mfp-win');
  win.hidden = true;
  const corner = el('div', 'mfp-corner');
  const creditsBtn = el('button', 'mfp-small', 'Credits');
  creditsBtn.type = 'button';
  corner.append(creditsBtn);
  const stats = el('div', 'mfp-stats');
  stats.hidden = true;
  document.body.append(hud, win, corner, stats);

  let runtime: GameRuntime | null = null;
  let paused = false;

  const renderHud = (score: number, collected: number, total: number): void => {
    const parts = [scene.hud.title, scene.hud.showScore ? `Score ${score}${total ? ` · ${collected}/${total}` : ''}` : ''].filter(Boolean);
    hud.textContent = parts.join('   ');
    hud.hidden = parts.length === 0;
  };

  const setPaused = (value: boolean): void => {
    if (!runtime || value === paused) return;
    paused = value;
    viewport.setPlayPaused(value);
    if (value) audio.pauseAll();
    else audio.resumeAll();
  };

  const begin = (): void => {
    runtime = new GameRuntime(scene, input, audio);
    runtime.events.on('score', (s) => renderHud(s.score, s.collected, s.total));
    runtime.events.on('won', (w) => {
      win.textContent = w.message;
      win.hidden = false;
    });
    runtime.start();
    input.attach(viewport.canvas);
    viewport.startPlay(runtime);
    if (isMobile) document.body.append(touchControls(input));
    if (debug) {
      stats.hidden = false;
      viewport.setStatsEnabled(true);
    }
  };

  viewport.events.on('stats', (s) => {
    stats.textContent = `${s.fps.toFixed(0)} fps · ${s.frameMs.toFixed(1)} ms · ${s.drawCalls} draws · ${s.triangles.toLocaleString()} tris · q${s.qualityRung}`;
  });
  viewport.events.on('noCamera', ({ message }) => fatal(message));
  viewport.events.on('quality', (c) => {
    if (debug) console.info('[Mythic Forge]', c.reason);
  });

  // Battery: never render in the background.
  document.addEventListener('visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden';
    viewport.setPaused(hidden);
    if (hidden) setPaused(true);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') setPaused(!paused);
  });

  creditsBtn.addEventListener('click', () => {
    const wasPaused = paused;
    setPaused(true);
    creditsPanel(name, credits, notices, () => setPaused(wasPaused));
  });

  // A tap/click to start also unlocks audio on mobile browsers.
  const play = el('button', 'mfp-btn', 'Play');
  play.type = 'button';
  const startScreen = overlay(el('div', 'mfp-title', name), el('div', 'mfp-sub', isMobile ? 'Use the stick to move, drag to look.' : 'WASD / arrows to move · Space to jump · drag to look · P to pause'), play);
  play.addEventListener('click', () => {
    startScreen.remove();
    begin();
  });
  play.focus();
}

try {
  start();
} catch (error) {
  fatal(error instanceof Error ? error.message : String(error));
}
