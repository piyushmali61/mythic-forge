import {
  DEFAULT_SETTINGS,
  ENGINE_NAME,
  ENGINE_VERSION,
  FPS_OPTIONS,
  PROJECT_FORMAT_VERSION,
  QUALITY_LABELS,
  QUALITY_LEVELS,
  RENDERER_VERSION,
  STUDIO_NAME,
  TAGLINE,
  formatBytes,
  log,
  type AutosaveInterval,
  type BatteryMode,
  type QualityLevel,
} from '@mythic-forge/core';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  confirmAction,
  navigate,
  online,
  refreshProjects,
  reportError,
  settings,
  svc,
  toast,
  updateSettings,
} from '../../app/state.ts';
import { config } from '../../lib/config.ts';
import { renderMarkdown } from '../../lib/markdown.ts';
import { currentQuality } from '../../lib/quality.ts';
import { Callout, Modal, NotImplemented, Segmented } from '../../ui/common.tsx';
import { DownloadsCard } from '../../ui/Downloads.tsx';
import { Toggle } from '../../ui/fields.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { lazyComponent } from '../../ui/lazy.tsx';

const BenchmarkModal = lazyComponent(() => import('./Benchmark.tsx').then((m) => m.BenchmarkModal), 'Preparing benchmark…');

function Row({ title, hint, children }: { title: string; hint?: ComponentChildren; children: ComponentChildren }) {
  return (
    <div class="setting-row">
      <div>
        <strong>{title}</strong>
        {hint && <span class="field-hint">{hint}</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ---- General --------------------------------------------------------------------------------------

export function GeneralSection() {
  const s = settings.value;
  return (
    <>
      <Row title="Theme">
        <Segmented
          label="Theme"
          value={s.general.theme}
          onChange={(v) => void updateSettings((d) => (d.general.theme = v))}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Row>
      <Toggle
        label="Ask before deleting"
        hint="Confirm before deleting projects, objects and data."
        checked={s.general.confirmDestructive}
        onChange={(v) => void updateSettings((d) => (d.general.confirmDestructive = v))}
      />
      <Toggle
        label="Developer mode"
        hint="Shows technical error details and records verbose logs in the console."
        checked={s.developer.devMode}
        onChange={(v) =>
          void updateSettings((d) => (d.developer.devMode = v)).then(() => log.configure({ minLevel: v || config.isDev ? 'debug' : 'info' }))
        }
      />
      <Row title="Welcome screen" hint="Show the first-run welcome again.">
        <button type="button" class="btn btn-sm" onClick={() => void updateSettings((d) => (d.general.firstRunComplete = false)).then(() => navigate({ name: 'home' }))}>
          Show again
        </button>
      </Row>
      <Row title="Reset settings" hint="Restores every setting to its default. Projects are not affected.">
        <button
          type="button"
          class="btn btn-sm"
          onClick={async () => {
            if (await confirmAction({ title: 'Reset all settings?', body: 'Your projects and assets are not affected.', confirmLabel: 'Reset' })) {
              await updateSettings((d) => Object.assign(d, structuredClone(DEFAULT_SETTINGS), { general: { ...DEFAULT_SETTINGS.general, firstRunComplete: true } }));
              toast('Settings reset.', 'success');
            }
          }}
        >
          Reset
        </button>
      </Row>
    </>
  );
}

// ---- Editor ---------------------------------------------------------------------------------------

export function EditorSection() {
  const e = settings.value.editor;
  return (
    <>
      <Row title="Auto-save" hint="Saves your project in the background. Separate recovery snapshots are always kept while you edit.">
        <Segmented<AutosaveInterval>
          label="Auto-save interval"
          value={e.autosaveMinutes}
          onChange={(v) => void updateSettings((d) => (d.editor.autosaveMinutes = v))}
          options={[
            { value: 0, label: 'Off' },
            { value: 5, label: '5 min' },
            { value: 10, label: '10 min' },
            { value: 15, label: '15 min' },
          ]}
        />
      </Row>
      <Toggle label="Show grid" checked={e.showGrid} onChange={(v) => void updateSettings((d) => (d.editor.showGrid = v))} />
      <Row title="Gizmo size" hint="Bigger handles are easier to grab on touch screens.">
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={e.gizmoSize}
          aria-label="Gizmo size"
          onChange={(ev) => void updateSettings((d) => (d.editor.gizmoSize = Number(ev.currentTarget.value)))}
        />
      </Row>
      <Row title="Move snapping" hint="0 turns snapping off.">
        <select class="input" aria-label="Move snapping" value={String(e.snapTranslate)} onChange={(ev) => void updateSettings((d) => (d.editor.snapTranslate = Number(ev.currentTarget.value)))}>
          {[0, 0.1, 0.25, 0.5, 1].map((v) => (
            <option key={v} value={String(v)}>
              {v === 0 ? 'Off' : `${v} m`}
            </option>
          ))}
        </select>
      </Row>
      <Row title="Rotation snapping">
        <select class="input" aria-label="Rotation snapping" value={String(e.snapRotate)} onChange={(ev) => void updateSettings((d) => (d.editor.snapRotate = Number(ev.currentTarget.value)))}>
          {[0, 5, 15, 45, 90].map((v) => (
            <option key={v} value={String(v)}>
              {v === 0 ? 'Off' : `${v}°`}
            </option>
          ))}
        </select>
      </Row>
      <Row title="Undo history" hint="More steps use more memory. Applies when a project is next opened.">
        <select class="input" aria-label="Undo history length" value={String(e.historyLimit)} onChange={(ev) => void updateSettings((d) => (d.editor.historyLimit = Number(ev.currentTarget.value)))}>
          {[50, 100, 200, 500].map((v) => (
            <option key={v} value={String(v)}>
              {v} steps
            </option>
          ))}
        </select>
      </Row>
    </>
  );
}

// ---- Graphics -------------------------------------------------------------------------------------

export function GraphicsSection() {
  const g = settings.value.graphics;
  const { device, gpu } = svc();
  const resolved = currentQuality();
  const q = resolved.settings;
  return (
    <>
      <Callout kind="info" title={`This device: ${QUALITY_LABELS[device.tier]}`}>
        {device.reasons.join(' · ')}
        {gpu.renderer && (
          <>
            <br />
            <span class="dim">GPU: {gpu.renderer}</span>
          </>
        )}
      </Callout>
      <Row title="Quality" hint="Auto picks a level from the device and battery mode. The engine can still lower it during play if frames are late.">
        <select
          class="input"
          aria-label="Quality"
          value={g.quality}
          onChange={(e) => void updateSettings((d) => (d.graphics.quality = e.currentTarget.value as QualityLevel | 'auto'))}
        >
          <option value="auto">Auto ({QUALITY_LABELS[device.tier]})</option>
          {QUALITY_LEVELS.map((l) => (
            <option key={l} value={l}>
              {QUALITY_LABELS[l]}
            </option>
          ))}
        </select>
      </Row>
      <Row title="Frame rate (play mode)" hint="The editor draws only when something changes, whatever this is set to. Higher rates use more battery; the display's refresh rate is the upper limit.">
        <select
          class="input"
          aria-label="Frame rate"
          value={String(g.targetFps)}
          onChange={(e) => void updateSettings((d) => (d.graphics.targetFps = e.currentTarget.value === 'auto' ? 'auto' : Number(e.currentTarget.value)))}
        >
          <option value="auto">Auto</option>
          {FPS_OPTIONS.map((f) => (
            <option key={f} value={String(f)}>
              {f} FPS
            </option>
          ))}
        </select>
      </Row>
      <Row title="Editor preview detail" hint="Low uses fewer polygons for built-in shapes.">
        <Segmented
          label="Preview detail"
          value={g.editorPreviewQuality}
          onChange={(v) => void updateSettings((d) => (d.graphics.editorPreviewQuality = v))}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'full', label: 'Full' },
          ]}
        />
      </Row>
      <h3 style={{ marginTop: '20px' }}>Current effective settings</h3>
      <dl class="kv">
        <dt>Level</dt>
        <dd>{QUALITY_LABELS[q.level]}</dd>
        <dt>Target FPS</dt>
        <dd>{q.targetFps}</dd>
        <dt>Resolution</dt>
        <dd>
          {Math.round(q.renderScale * 100)}% (max pixel ratio {q.maxPixelRatio})
        </dd>
        <dt>Shadows</dt>
        <dd>{q.shadows}</dd>
        <dt>Texture limit</dt>
        <dd>{q.textureMaxSize}px</dd>
        <dt>Anti-aliasing</dt>
        <dd>{q.antialias ? 'On' : 'Off'} (applies when the editor opens)</dd>
        <dt>Reflections</dt>
        <dd>{q.reflections ? 'On' : 'Off'}</dd>
        <dt>Fog / ambient effects</dt>
        <dd>{q.ambientEffects ? 'On' : 'Off'}</dd>
        <dt>Draw distance</dt>
        <dd>{q.drawDistance} m</dd>
        <dt>Why</dt>
        <dd>{resolved.reasons.join(' · ')}</dd>
      </dl>
      <p class="dim" style={{ fontSize: '0.86em', marginTop: '12px' }}>
        Post-processing, particle density and LOD distance settings will appear when those features are added. <NotImplemented label="Planned" />
      </p>
    </>
  );
}

// ---- Performance ----------------------------------------------------------------------------------

export function PerformanceSection() {
  const p = settings.value.performance;
  const [bench, setBench] = useState(false);
  return (
    <>
      <Toggle
        label="Adaptive quality"
        hint="During play, gradually lowers shadows, then resolution, then frame rate if the device can't keep up — and restores them when it can."
        checked={p.adaptiveQuality}
        onChange={(v) => void updateSettings((d) => (d.performance.adaptiveQuality = v))}
      />
      <Toggle
        label="Performance overlay"
        hint="Shows FPS, frame time, draw calls, triangles and memory in the editor. Measuring costs a little extra, so it's off by default."
        checked={p.showOverlay}
        onChange={(v) => void updateSettings((d) => (d.performance.showOverlay = v))}
      />
      <Row title="Benchmark" hint="Measures startup, project loading, asset import, play-mode frame rate and memory on this device, and compares them with Mythic Forge's performance budgets.">
        <button type="button" class="btn" onClick={() => setBench(true)}>
          <Icon name="gauge" /> Run benchmark
        </button>
      </Row>
      <p class="dim" style={{ fontSize: '0.86em' }}>
        GPU utilisation isn't available to web-based renderers; frame time is used instead. Temperature is reported only where the operating system provides it (Android thermal status, desktop Chromium pressure API).
      </p>
      {bench && <BenchmarkModal onClose={() => setBench(false)} />}
    </>
  );
}

// ---- Battery --------------------------------------------------------------------------------------

const BATTERY_MODES: { value: BatteryMode; label: string; text: string }[] = [
  { value: 'max-saving', label: 'Maximum Battery Saving', text: '30 FPS, low quality, no animations in the interface. Best for long sessions on a phone.' },
  { value: 'balanced', label: 'Balanced', text: 'Good-looking scenes without wasting power. 30 FPS on phones, 60 on PCs.' },
  { value: 'performance', label: 'Performance', text: 'Highest quality and frame rate this device supports. Uses the most power and may warm the device.' },
];

export function BatterySection() {
  const b = settings.value.battery;
  const pw = svc().platform.power.state;
  return (
    <>
      <div class="choice-grid" role="radiogroup" aria-label="Battery mode">
        {BATTERY_MODES.map((m) => (
          <button key={m.value} type="button" role="radio" class="choice" aria-checked={b.mode === m.value} onClick={() => void updateSettings((d) => (d.battery.mode = m.value))}>
            <strong>
              <Icon name={m.value === 'performance' ? 'cpu' : m.value === 'balanced' ? 'gauge' : 'battery'} /> {m.label}
            </strong>
            <span>{m.text}</span>
          </button>
        ))}
      </div>
      <h3 style={{ marginTop: '20px' }}>Advanced</h3>
      <Row title="Target FPS" hint="Set in Graphics. Battery Saving always uses 30 FPS.">
        <button type="button" class="btn btn-sm" onClick={() => navigate({ name: 'settings', section: 'graphics' }, true)}>
          Open Graphics
        </button>
      </Row>
      <Row title="Background rendering" hint="Mythic Forge always stops drawing when it's in the background or the screen is off. This can't be turned on.">
        <span class="badge success">
          <Icon name="check" size={12} /> Always off
        </span>
      </Row>
      <Row title="Preview quality" hint="Detail of built-in shapes in the editor.">
        <Segmented
          label="Preview quality"
          value={settings.value.graphics.editorPreviewQuality}
          onChange={(v) => void updateSettings((d) => (d.graphics.editorPreviewQuality = v))}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'full', label: 'Full' },
          ]}
        />
      </Row>
      <Row title="Thumbnail quality" hint="Asset previews are made only for items you scroll to, one at a time, and are cached.">
        <Segmented
          label="Thumbnail quality"
          value={b.thumbnailQuality}
          onChange={(v) => void updateSettings((d) => (d.battery.thumbnailQuality = v))}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
          ]}
        />
      </Row>
      <Row title="Asset processing" hint="Imported files are analysed when you choose them and optimised only when you press Import. Nothing is processed in the background.">
        <span class="badge">On demand</span>
      </Row>
      <h3 style={{ marginTop: '20px' }}>Device status</h3>
      <dl class="kv">
        <dt>Battery</dt>
        <dd>{pw.batteryLevel === null ? 'Not reported by this device' : `${Math.round(pw.batteryLevel * 100)}%${pw.charging ? ' (charging)' : ''}`}</dd>
        <dt>System battery saver</dt>
        <dd>{pw.lowPowerMode === null ? 'Not reported' : pw.lowPowerMode ? 'On — Mythic Forge uses Battery Saving' : 'Off'}</dd>
        <dt>Thermal state</dt>
        <dd>{pw.thermal === 'unknown' ? 'Checked only while a game is running' : pw.thermal}</dd>
      </dl>
    </>
  );
}

// ---- Storage --------------------------------------------------------------------------------------

interface Usage {
  projects: number;
  library: number;
  cache: number;
  recovery: number;
  quota: number | null;
  used: number | null;
}

export function StorageSection() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const { platform, store, catalogs } = svc();
  const load = async (): Promise<void> => {
    const sum = async (prefix: string): Promise<number> => (await platform.fs.list(prefix)).reduce((a, f) => a + f.size, 0);
    const projectFiles = await platform.fs.list('projects');
    const projectCache = projectFiles.filter((f) => /^projects\/[^/]+\/cache\//.test(f.path)).reduce((a, f) => a + f.size, 0);
    const est = await platform.storageEstimate();
    setUsage({
      projects: projectFiles.reduce((a, f) => a + f.size, 0) - projectCache,
      library: await sum('library'),
      cache: (await sum('cache')) + projectCache,
      recovery: await sum('recovery'),
      quota: est.quota,
      used: est.usage,
    });
  };
  useEffect(() => {
    void load();
  }, []);

  const clearCache = async (): Promise<void> => {
    try {
      await catalogs.clearThumbnails();
      await platform.fs.apply([{ kind: 'delete-prefix', prefix: 'cache' }]);
      for (const p of await store.list()) await store.clearCache(p.id);
      toast('Cache cleared. Your projects and assets were not touched.', 'success');
      await load();
    } catch (error) {
      reportError(error, 'The cache could not be cleared.');
    }
  };

  const total = usage ? usage.projects + usage.library + usage.cache + usage.recovery : 0;
  const pct = (n: number): string => `${total ? (n / total) * 100 : 0}%`;
  return (
    <>
      {!platform.fs.persistent && (
        <Callout kind="warning" title="Temporary storage">
          Storage isn't available in this browser mode; nothing will be kept after closing.
        </Callout>
      )}
      {usage ? (
        <>
          <div class="storage-bar" aria-hidden="true">
            <span style={{ width: pct(usage.projects), background: 'var(--gold)' }} />
            <span style={{ width: pct(usage.library), background: 'var(--info)' }} />
            <span style={{ width: pct(usage.cache), background: 'var(--text-3)' }} />
            <span style={{ width: pct(usage.recovery), background: 'var(--warning)' }} />
          </div>
          <dl class="kv">
            <dt>Projects</dt>
            <dd>{formatBytes(usage.projects)}</dd>
            <dt>Downloaded assets</dt>
            <dd>{formatBytes(usage.library)}</dd>
            <dt>Cache (thumbnails, derived data)</dt>
            <dd>{formatBytes(usage.cache)}</dd>
            <dt>Recovery snapshots</dt>
            <dd>{formatBytes(usage.recovery)}</dd>
            <dt>Application</dt>
            <dd>{svc().platform.shell === 'browser' ? 'Served by the browser (see "Total")' : 'Installed with the app'}</dd>
            <dt>Total used by Mythic Forge</dt>
            <dd>
              {usage.used !== null ? formatBytes(usage.used) : formatBytes(total)}
              {usage.quota !== null && <span class="dim"> of {formatBytes(usage.quota)} available</span>}
            </dd>
            <dt>Protected from clean-up</dt>
            <dd>{svc().persistentStorage ? 'Yes' : 'No — the browser may remove data if the device runs low on space. Export important projects.'}</dd>
          </dl>
        </>
      ) : (
        <p class="dim">Measuring…</p>
      )}
      <Row title="Clear cache" hint="Removes thumbnails and other data that can be rebuilt. Never deletes projects or downloaded assets.">
        <button type="button" class="btn" onClick={() => void clearCache()}>
          Clear Cache
        </button>
      </Row>
      <Row title="Downloaded assets" hint="Assets you add to a project are copied into it, so removing downloads never breaks projects.">
        <button type="button" class="btn btn-sm" onClick={() => navigate({ name: 'library', tab: 'official' })}>
          Manage in Library
        </button>
      </Row>
    </>
  );
}

// ---- Projects -------------------------------------------------------------------------------------

export function ProjectsSection() {
  const shell = svc().platform.shell;
  return (
    <>
      <p>
        Projects are kept in Mythic Forge's private storage on this device ({shell === 'capacitor' ? 'app storage' : shell === 'tauri' ? 'app data' : 'browser storage'}). Each save is written in one step, so an interrupted save can't damage a project, and the three previous saves are kept as backups.
      </p>
      <Row title="Project folder on disk" hint="Choosing a folder on your computer is planned for the Windows desktop app.">
        <NotImplemented />
      </Row>
      <Row title="Move projects between devices" hint="Export a project as a .mfpack file and import it on another phone, laptop or PC.">
        <button type="button" class="btn btn-sm" onClick={() => navigate({ name: 'docs', page: 'moving-projects' })}>
          How it works
        </button>
      </Row>
      <Row title="Project format" hint="Files are versioned JSON plus the original asset files.">
        <span class="mono">format v{PROJECT_FORMAT_VERSION}</span>
      </Row>
    </>
  );
}

// ---- Assets ---------------------------------------------------------------------------------------

export function AssetsSection() {
  const l = svc().limits;
  return (
    <>
      <Callout kind="info">Only import assets you have the legal right to use. Imported files stay private to your project unless you export it.</Callout>
      <h3>Import limits on this device</h3>
      <p class="dim">Limits protect the app from damaged or malicious files and keep memory use in check.</p>
      <dl class="kv">
        <dt>Largest file</dt>
        <dd>{formatBytes(l.maxImportFileBytes)}</dd>
        <dt>Files per import</dt>
        <dd>{l.maxFilesPerImport}</dd>
        <dt>Largest texture</dt>
        <dd>
          {l.maxTextureDimension} × {l.maxTextureDimension}
        </dd>
        <dt>Largest project package</dt>
        <dd>{formatBytes(l.maxArchiveBytes)}</dd>
        <dt>Objects per scene</dt>
        <dd>{l.maxEntitiesPerScene.toLocaleString()}</dd>
      </dl>
      <h3 style={{ marginTop: '18px' }}>Supported formats</h3>
      <p>
        Models: GLB and glTF (recommended), OBJ (+MTL), FBX (experimental). Images: PNG, JPEG, WebP. Audio: OGG, MP3, WAV. Models are converted to optimised GLB when imported.
      </p>
      <p class="dim">Executable files and scripts are never imported or run.</p>
    </>
  );
}

// ---- Privacy ----------------------------------------------------------------------------------------

export function PrivacySection() {
  const { platform, recovery } = svc();
  const exportLogs = async (): Promise<void> => {
    const header = [
      `${ENGINE_NAME} ${ENGINE_VERSION} diagnostic log`,
      `Generated: ${new Date().toISOString()}`,
      `Shell: ${platform.shell}; platform: ${platform.device.platform}; quality tier: ${svc().device.tier}`,
      'This file contains app events only — no project content. Review it before sharing.',
    ].join('\n');
    const bytes = new TextEncoder().encode(log.exportText(header));
    await platform.files.save('mythic-forge-diagnostics.txt', bytes, 'text/plain');
  };
  const eraseAll = async (): Promise<void> => {
    const ok = await confirmAction({
      title: 'Erase everything?',
      body: 'This permanently deletes ALL projects, downloaded assets, recovery snapshots, cache and settings on this device. Export anything you want to keep first.',
      confirmLabel: 'Erase all data',
      requireText: 'DELETE',
    });
    if (!ok) return;
    try {
      await platform.fs.apply(['projects', 'library', 'cache', 'recovery'].map((prefix) => ({ kind: 'delete-prefix' as const, prefix })));
      await recovery.endSession();
      await platform.kv.delete('settings');
      await refreshProjects();
      toast('All Mythic Forge data on this device was erased.', 'success');
      location.reload();
    } catch (error) {
      reportError(error, 'Data could not be erased.');
    }
  };
  return (
    <>
      <Callout kind="success" title="No analytics or tracking">
        This version of Mythic Forge contains no analytics, advertising or crash-reporting code, and sends nothing about you or your projects anywhere.
      </Callout>
      <Row title="Analytics" hint="There is nothing to switch off. If optional, anonymous analytics are added in the future, they will be off until you turn them on here.">
        <span class="badge success">Not collected</span>
      </Row>
      <h3 style={{ marginTop: '18px' }}>What is stored on this device</h3>
      <ul>
        <li>Your projects, imported assets and their backups</li>
        <li>Assets you downloaded from the library, and cached thumbnails</li>
        <li>Recovery snapshots of unsaved work</li>
        <li>Your settings</li>
      </ul>
      <h3>When Mythic Forge uses the network</h3>
      <ul>
        <li>Only when you ask it to check an online asset repository (if one is configured), or open an external link.</li>
        <li>The bundled library, templates, documentation and editor work fully offline.</li>
      </ul>
      <Row title="Diagnostic logs" hint="Save the app log to a file so you can attach it to a bug report yourself. Nothing is uploaded.">
        <button type="button" class="btn btn-sm" onClick={() => void exportLogs()}>
          Export logs
        </button>
      </Row>
      <Row title="Privacy policy">
        {config.privacyPolicyUrl ? (
          <a class="btn btn-sm" href={config.privacyPolicyUrl} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        ) : (
          <button type="button" class="btn btn-sm" onClick={() => navigate({ name: 'docs', page: 'privacy-policy' })}>
            Read draft
          </button>
        )}
      </Row>
      <Row title="Erase all data" hint="Permanently removes everything Mythic Forge stored on this device.">
        <button type="button" class="btn btn-danger btn-sm" onClick={() => void eraseAll()}>
          Erase…
        </button>
      </Row>
    </>
  );
}

// ---- Network ----------------------------------------------------------------------------------------

export function NetworkSection() {
  const n = settings.value.network;
  return (
    <>
      <p>
        Status: <strong>{online.value ? 'Online' : 'Offline'}</strong>. Mythic Forge never polls servers or syncs in the background.
      </p>
      <Toggle
        label="Allow network access"
        hint="When off, Mythic Forge makes no requests to online services. Everything bundled with the app keeps working."
        checked={n.allowNetwork}
        onChange={(v) =>
          void updateSettings((d) => (d.network.allowNetwork = v)).then(() => {
            if (!v) svc().downloads.pauseAll();
          })
        }
      />
      <Toggle
        label="Respect data saver"
        hint="Don't start online downloads while the system reports a data-saver connection."
        checked={n.respectDataSaver}
        onChange={(v) => void updateSettings((d) => (d.network.respectDataSaver = v))}
      />
      <Row title="Asset repository" hint="Where library updates come from.">
        <span class="mono" style={{ fontSize: '0.86em' }}>
          {config.assetRepositoryUrl || 'Bundled with the app (no online repository configured)'}
        </span>
      </Row>
      <Row title="Cloud sync" hint="Optional cloud backup is planned for a later version.">
        <NotImplemented />
      </Row>
    </>
  );
}

// ---- Accounts ---------------------------------------------------------------------------------------

export function AccountsSection() {
  return (
    <>
      <Callout kind="info" title="No account needed">
        Creating projects, importing models, editing scenes and playing your games all work without an account.
      </Callout>
      <p>Accounts are planned for optional features that need a server: cloud backup, publishing and community assets.</p>
      <Row title="Sign in">
        <NotImplemented />
      </Row>
    </>
  );
}

// ---- Keyboard ---------------------------------------------------------------------------------------

export const SHORTCUTS: [string, string][] = [
  ['Ctrl/Cmd + S', 'Save'],
  ['Ctrl/Cmd + Z', 'Undo'],
  ['Ctrl/Cmd + Shift + Z  or  Ctrl + Y', 'Redo'],
  ['Ctrl/Cmd + D', 'Duplicate selected object'],
  ['Delete / Backspace', 'Delete selected object'],
  ['F', 'Focus selected object'],
  ['W / E / R', 'Move / Rotate / Scale tool'],
  ['Ctrl/Cmd + P', 'Play / Stop'],
  ['Esc', 'Stop play mode, close dialogs'],
  ['Ctrl/Cmd + K', 'Search (outside the editor)'],
  ['Mouse: left drag / right drag', 'Orbit the view'],
  ['Mouse: middle drag / Shift + left drag', 'Pan the view'],
  ['Mouse wheel', 'Zoom'],
  ['Play mode: W A S D / arrows, Space', 'Move, jump'],
  ['Play mode: drag', 'Look around'],
];

export function KeyboardSection() {
  return (
    <>
      <table class="table">
        <thead>
          <tr>
            <th>Keys</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map(([k, a]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{a}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="dim" style={{ marginTop: '12px' }}>
        Custom key bindings are planned. <NotImplemented label="Planned" />
      </p>
    </>
  );
}

// ---- Accessibility ----------------------------------------------------------------------------------

export function AccessibilitySection() {
  const a = settings.value.accessibility;
  return (
    <>
      <Row title="Interface size" hint="Scales all text and controls.">
        <div class="row">
          <input
            type="range"
            min={0.8}
            max={1.6}
            step={0.05}
            value={a.uiScale}
            aria-label="Interface size"
            onChange={(e) => void updateSettings((d) => (d.accessibility.uiScale = Number(e.currentTarget.value)))}
          />
          <span class="mono">{Math.round(a.uiScale * 100)}%</span>
        </div>
      </Row>
      <Toggle label="Large text" checked={a.largeText} onChange={(v) => void updateSettings((d) => (d.accessibility.largeText = v))} />
      <Toggle label="High contrast" checked={a.highContrast} onChange={(v) => void updateSettings((d) => (d.accessibility.highContrast = v))} />
      <Row title="Reduce motion" hint="Turns off interface animations. Battery Saving mode also reduces motion.">
        <Segmented
          label="Reduce motion"
          value={a.reducedMotion}
          onChange={(v) => void updateSettings((d) => (d.accessibility.reducedMotion = v))}
          options={[
            { value: 'system', label: 'System' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </Row>
      <p class="dim" style={{ marginTop: '12px' }}>
        All controls work with a keyboard and have labels for screen readers. Status is always shown with text or icons, not colour alone.
      </p>
    </>
  );
}

// ---- About ------------------------------------------------------------------------------------------

interface ThirdParty {
  name: string;
  version: string;
  license: string;
  source: string;
  usage: string;
  licenseText: string;
}

export function AboutSection() {
  const [packages, setPackages] = useState<ThirdParty[] | null>(null);
  const [assetLicense, setAssetLicense] = useState<string | null>(null);
  const [open, setOpen] = useState<ThirdParty | null>(null);
  const loadNotices = async (): Promise<void> => {
    try {
      const res = await fetch('./third-party-licenses.json');
      const data = (await res.json()) as { packages: ThirdParty[] };
      setPackages(data.packages);
    } catch (error) {
      reportError(error, 'The licence list could not be loaded.');
    }
  };
  const link = (label: string, url: string) =>
    url ? (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    ) : (
      <span class="dim">{label}: not configured for this build</span>
    );

  return (
    <>
      <div class="row" style={{ gap: '16px', marginBottom: '16px' }}>
        <img src="./icons/logo.svg" alt="" width="72" height="72" />
        <div>
          <div style={{ fontWeight: 750, letterSpacing: '0.2em', fontSize: '1.2em' }}>MYTHIC FORGE</div>
          <div class="muted">Produced by {STUDIO_NAME}</div>
          <div class="dim">
            Version {ENGINE_VERSION} · project format v{PROJECT_FORMAT_VERSION} · renderer v{RENDERER_VERSION}
          </div>
          <div style={{ color: 'var(--gold)' }}>{TAGLINE}</div>
        </div>
      </div>
      <dl class="kv">
        <dt>Website</dt>
        <dd>{link('Website', config.websiteUrl)}</dd>
        <dt>Documentation</dt>
        <dd>
          <a href="#" onClick={(e) => (e.preventDefault(), navigate({ name: 'docs' }))}>
            Built-in documentation
          </a>
        </dd>
        <dt>Support</dt>
        <dd>{link('Support', config.supportUrl)}</dd>
        <dt>Privacy</dt>
        <dd>
          <a href="#" onClick={(e) => (e.preventDefault(), navigate({ name: 'settings', section: 'privacy' }, true))}>
            Privacy settings
          </a>
          {' · '}
          {config.privacyPolicyUrl ? link('Privacy policy', config.privacyPolicyUrl) : <a href="#" onClick={(e) => (e.preventDefault(), navigate({ name: 'docs', page: 'privacy-policy' }))}>Privacy policy (draft)</a>}
        </dd>
        <dt>Terms</dt>
        <dd>
          {config.termsUrl ? link('Terms of use', config.termsUrl) : <a href="#" onClick={(e) => (e.preventDefault(), navigate({ name: 'docs', page: 'terms-of-use' }))}>Terms of use (draft)</a>}
        </dd>
        <dt>Report a bug</dt>
        <dd>
          Export a diagnostic log (Settings → Privacy) and send it with a description through the support channel. {!config.supportUrl && <span class="dim">(No support channel is configured for this build.)</span>}
        </dd>
      </dl>

      <DownloadsCard title="Standalone apps" text="Native builds of this version. They work fully offline." />

      <h3 style={{ marginTop: '22px' }}>Licences</h3>
      <p class="muted">
        Mythic Forge is built on open-source software. Those components stay under their own licences, listed below. Mythic Bharat Studios assets are under the Mythic Bharat Studios Asset License; third-party assets keep their original licences.
      </p>
      <div class="row wrap">
        <button type="button" class="btn btn-sm" onClick={() => void loadNotices()} disabled={packages !== null}>
          Open-source notices
        </button>
        <button
          type="button"
          class="btn btn-sm"
          onClick={() =>
            void fetch('./asset-packs/official/licenses/MBS-ASSET-1.0.md')
              .then((r) => r.text())
              .then(setAssetLicense)
              .catch((e: unknown) => reportError(e, 'The licence could not be opened.'))
          }
        >
          Mythic Bharat Studios Asset License
        </button>
      </div>
      {packages && (
        <table class="table" style={{ marginTop: '12px' }}>
          <thead>
            <tr>
              <th>Component</th>
              <th>Licence</th>
              <th>Used for</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.name}>
                <td>
                  <button type="button" class="btn btn-ghost btn-sm" style={{ padding: 0 }} onClick={() => setOpen(p)}>
                    {p.name} {p.version}
                  </button>
                </td>
                <td>{p.license}</td>
                <td class="muted">{p.usage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && (
        <Modal title={`${open.name} ${open.version} — ${open.license}`} onClose={() => setOpen(null)} wide>
          {open.source && <p class="dim">{open.source}</p>}
          <pre class="mono" style={{ whiteSpace: 'pre-wrap', fontSize: '0.84em' }}>
            {open.licenseText}
          </pre>
        </Modal>
      )}
      {assetLicense !== null && (
        <Modal title="Mythic Bharat Studios Asset License" onClose={() => setAssetLicense(null)} wide>
          <div class="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(assetLicense) }} />
        </Modal>
      )}
    </>
  );
}
