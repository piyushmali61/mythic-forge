import {
  AUDIO_EXTENSIONS,
  COMPANION_EXTENSIONS,
  DEFAULT_IMPORT_SETTINGS,
  MODEL_EXTENSIONS,
  TEXTURE_EXTENSIONS,
  UserFacingError,
  acceptAttribute,
  checkImportFile,
  defaultMaterial,
  describeError,
  formatBytes,
  stripExtension,
  type FileFormat,
  type ImportKind,
  type ImportSettings,
  type ProjectAssetMeta,
} from '@mythic-forge/core';
import type { ModelAnalysis } from '@mythic-forge/renderer/importer';
import { useEffect, useState } from 'preact/hooks';
import { reportError, svc } from '../app/state.ts';
import { formatNumber } from '../lib/format.ts';
import { Callout, Modal } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';
import type { EditorSession } from './session.ts';

interface Picked {
  name: string;
  bytes: Uint8Array;
  format: FileFormat;
  kind: ImportKind;
}

type Stage =
  | { name: 'pick' }
  | { name: 'review'; main: Picked; companions: Picked[]; rejected: string[] }
  | { name: 'working'; message: string }
  | { name: 'done'; meta: ProjectAssetMeta; notes: string[]; originalBytes: number };

const importer = () => import('@mythic-forge/renderer/importer');

export function ImportDialog({ session, onClose }: { session: EditorSession; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>({ name: 'pick' });
  const [rights, setRights] = useState(false);
  const [settings, setSettings] = useState<ImportSettings>({ ...DEFAULT_IMPORT_SETTINGS, maxTextureSize: svc().platform.device.isMobile ? 1024 : 2048 });
  const [analysis, setAnalysis] = useState<ModelAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { platform, limits, store } = svc();

  const pick = async (): Promise<void> => {
    setError(null);
    const accept = acceptAttribute([...MODEL_EXTENSIONS, ...TEXTURE_EXTENSIONS, ...AUDIO_EXTENSIONS, ...COMPANION_EXTENSIONS]);
    const files = await platform.files.pick({ accept, multiple: true });
    if (files.length === 0) return;
    if (files.length > limits.maxFilesPerImport) {
      setError(`Select at most ${limits.maxFilesPerImport} files at once.`);
      return;
    }
    const oversized = files.find((f) => f.size > limits.maxImportFileBytes);
    if (oversized) {
      setError(`"${oversized.name}" is larger than the ${formatBytes(limits.maxImportFileBytes)} limit on this device.`);
      return;
    }
    setStage({ name: 'working', message: 'Checking files…' });
    const accepted: Picked[] = [];
    const rejected: string[] = [];
    const hasModel = files.some((f) => (MODEL_EXTENSIONS as readonly string[]).includes(f.name.split('.').pop()?.toLowerCase() ?? ''));
    for (const f of files) {
      const bytes = await f.bytes();
      const check = checkImportFile(f.name, bytes, limits, { allowCompanions: hasModel });
      if (check.ok) accepted.push({ name: f.name, bytes, format: check.format, kind: check.kind });
      else rejected.push(`${f.name}: ${check.reason}`);
    }
    const main = accepted.find((p) => p.kind === 'model') ?? accepted.find((p) => p.kind === 'texture' || p.kind === 'audio');
    if (!main) {
      setStage({ name: 'pick' });
      setError(rejected.length ? rejected.join('\n') : 'No importable file was selected.');
      return;
    }
    const companions = main.kind === 'model' ? accepted.filter((p) => p !== main) : [];
    const ignored = main.kind !== 'model' ? accepted.filter((p) => p !== main).map((p) => `${p.name}: import one image or sound at a time.`) : [];
    setStage({ name: 'review', main, companions, rejected: [...rejected, ...ignored] });
    if (main.kind === 'model') {
      try {
        const { analyzeModel } = await importer();
        setAnalysis(await analyzeModel(main, main.format, companions));
      } catch (e) {
        setStage({ name: 'pick' });
        setError(describeError(e, 'This model could not be read.').message);
      }
    }
  };

  const runImport = async (review: Extract<Stage, { name: 'review' }>): Promise<void> => {
    const { main } = review;
    const original = main.bytes.byteLength + review.companions.reduce((s, c) => s + c.bytes.byteLength, 0);
    const provenance = {
      source: 'user-import' as const,
      userConfirmedRights: true,
      originalFileName: main.name,
      catalogId: null,
      catalogVersion: null,
      license: null,
    };
    try {
      if (main.kind === 'model') {
        if (!analysis) throw new UserFacingError('import-analysis', 'The model has not been analysed yet.');
        setStage({ name: 'working', message: 'Optimising model…' });
        const { optimizeModel } = await importer();
        const result = await optimizeModel(analysis, settings);
        setStage({ name: 'working', message: 'Saving to project…' });
        const { meta, deduplicated } = await store.addAsset(session.projectId, {
          name: analysis.name,
          kind: 'model',
          fileFormat: 'glb',
          mainFile: `${stripExtension(main.name) || 'model'}.glb`,
          files: [{ name: `${stripExtension(main.name) || 'model'}.glb`, bytes: result.bytes }],
          originalBytes: original,
          provenance,
          importSettings: settings,
          stats: result.analysis.stats,
        });
        await session.loadAssets();
        setStage({ name: 'done', meta, notes: deduplicated ? ['This exact model was already in the project; the existing copy is used.'] : result.notes, originalBytes: original });
      } else if (main.kind === 'texture') {
        setStage({ name: 'working', message: 'Processing image…' });
        const { importTexture } = await importer();
        const result = await importTexture(main, main.format, settings);
        const { meta } = await store.addAsset(session.projectId, {
          name: stripExtension(main.name) || 'Texture',
          kind: 'texture',
          fileFormat: result.format,
          mainFile: result.fileName,
          files: [{ name: result.fileName, bytes: result.bytes }],
          originalBytes: original,
          provenance,
          importSettings: settings,
          stats: result.stats,
        });
        await session.loadAssets();
        setStage({ name: 'done', meta, notes: result.notes, originalBytes: original });
      } else {
        setStage({ name: 'working', message: 'Reading audio…' });
        const { probeAudioDuration } = await importer();
        const mime = main.format === 'wav' ? 'audio/wav' : main.format === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
        const duration = await probeAudioDuration(main.bytes, mime);
        const notes: string[] = [];
        if (main.format === 'wav' && main.bytes.byteLength > 2 * 1024 * 1024) {
          notes.push('WAV files are uncompressed. Converting to OGG in an audio tool will make your game much smaller.');
        }
        const { meta } = await store.addAsset(session.projectId, {
          name: stripExtension(main.name) || 'Sound',
          kind: 'audio',
          fileFormat: main.format,
          mainFile: main.name,
          files: [{ name: main.name, bytes: main.bytes }],
          originalBytes: original,
          provenance,
          importSettings: null,
          stats: duration === null ? {} : { durationSec: duration },
        });
        await session.loadAssets();
        setStage({ name: 'done', meta, notes, originalBytes: original });
      }
    } catch (e) {
      setStage(review);
      reportError(e, 'The import failed.');
    }
  };

  const selected = session.selection.value ? session.scene.get(session.selection.value) : undefined;

  const body = (() => {
    switch (stage.name) {
      case 'pick':
        return (
          <>
            <p>Choose a 3D model (GLB, glTF, OBJ, FBX), an image (PNG, JPEG, WebP) or a sound (OGG, MP3, WAV).</p>
            <p class="dim" style={{ fontSize: '0.88em' }}>
              For glTF or OBJ files, select the model together with its .bin, .mtl and texture files. Files are checked before anything is read, and executable or unknown files are rejected.
            </p>
            {error && <Callout kind="danger">{error.split('\n').map((l) => <div key={l}>{l}</div>)}</Callout>}
            <button type="button" class="btn btn-primary btn-lg" onClick={() => void pick()}>
              <Icon name="upload" /> Select files
            </button>
          </>
        );
      case 'working':
        return (
          <div class="empty-state" role="status">
            <Icon name="refresh" size={32} />
            <p>{stage.message}</p>
          </div>
        );
      case 'review': {
        const { main, companions, rejected } = stage;
        return (
          <>
            {rejected.length > 0 && (
              <Callout kind="warning" title="Some files were skipped">
                {rejected.map((r) => (
                  <div key={r}>{r}</div>
                ))}
              </Callout>
            )}
            <dl class="kv">
              <dt>Asset name</dt>
              <dd>{stripExtension(main.name)}</dd>
              <dt>File</dt>
              <dd>
                {main.name} ({formatBytes(main.bytes.byteLength)}){companions.length > 0 && ` + ${companions.length} companion file(s)`}
              </dd>
            </dl>
            {main.kind === 'model' && !analysis && <p role="status">Analysing model…</p>}
            {main.kind === 'model' && analysis && <ModelReview analysis={analysis} settings={settings} setSettings={setSettings} />}
            {main.kind === 'texture' && <TextureOptions settings={settings} setSettings={setSettings} />}
            {main.kind === 'audio' && <p class="muted">Sounds are stored as they are and can be played by Audio Source components or collectibles.</p>}
            <label class="checkbox" style={{ marginTop: '12px' }}>
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.currentTarget.checked)} />
              <span>
                <strong>I have the legal right to use these files.</strong> Only import assets you created, bought with a suitable licence, or have permission to use. Imported files stay private to this project.
              </span>
            </label>
          </>
        );
      }
      case 'done': {
        const { meta, notes, originalBytes } = stage;
        return (
          <>
            <Callout kind="success" title={`Imported "${meta.name}"`}>
              Stored size {formatBytes(meta.storedBytes)} (original {formatBytes(originalBytes)})
              {meta.stats.gpuBytesEstimate !== undefined && <> · estimated GPU memory {formatBytes(meta.stats.gpuBytesEstimate)}</>}
            </Callout>
            {notes.length > 0 && (
              <ul>
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </>
        );
      }
    }
  })();

  const footer = (() => {
    if (stage.name === 'review') {
      const ready = rights && (stage.main.kind !== 'model' || analysis !== null);
      return (
        <>
          <button type="button" class="btn" onClick={() => (setStage({ name: 'pick' }), setAnalysis(null))}>
            Choose other files
          </button>
          <button type="button" class="btn btn-primary" disabled={!ready} onClick={() => void runImport(stage)}>
            Import
          </button>
        </>
      );
    }
    if (stage.name === 'done') {
      const { meta } = stage;
      return (
        <>
          <button type="button" class="btn" onClick={onClose}>
            Close
          </button>
          {meta.kind === 'model' && (
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => {
                session.addModel(meta);
                onClose();
              }}
            >
              Add to scene
            </button>
          )}
          {meta.kind === 'texture' && selected?.components.mesh && (
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => {
                const m = selected.components.material ?? defaultMaterial();
                session.updateComponent(selected.id, 'material', { ...m, textureAssetId: meta.id, color: '#ffffff' }, 'Apply texture');
                onClose();
              }}
            >
              Apply to "{selected.name}"
            </button>
          )}
          {meta.kind === 'audio' && selected && (
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => {
                session.updateComponent(selected.id, 'audioSource', { assetId: meta.id, volume: 1, loop: false, playOnStart: true }, 'Add audio source');
                onClose();
              }}
            >
              Play on "{selected.name}"
            </button>
          )}
        </>
      );
    }
    return null;
  })();

  return (
    <Modal title="Import Asset" onClose={onClose} wide footer={footer}>
      {body}
    </Modal>
  );
}

function ModelReview({ analysis: a, settings, setSettings }: { analysis: ModelAnalysis; settings: ImportSettings; setSettings: (s: ImportSettings) => void }) {
  const [estimate, setEstimate] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void importer().then(({ estimateOptimizedGpuBytes }) => {
      if (alive) setEstimate(estimateOptimizedGpuBytes(a, settings));
    });
    return () => {
      alive = false;
    };
  }, [a, settings]);
  const s = a.stats;
  const size = s.boundsMin && s.boundsMax ? s.boundsMax.map((v, i) => (v - s.boundsMin![i]!).toFixed(2)).join(' × ') : '—';
  const opt = (key: keyof ImportSettings, label: string, hint?: string) => (
    <label class="checkbox">
      <input type="checkbox" checked={settings[key] as boolean} onChange={(e) => setSettings({ ...settings, [key]: e.currentTarget.checked })} />
      <span>
        {label}
        {hint && <span class="field-hint"> — {hint}</span>}
      </span>
    </label>
  );
  return (
    <>
      {a.warnings.length > 0 && (
        <Callout kind="warning">
          {a.warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </Callout>
      )}
      <dl class="kv" style={{ marginTop: '8px' }}>
        <dt>Vertices</dt>
        <dd>{formatNumber(s.vertices)}</dd>
        <dt>Triangles</dt>
        <dd>{formatNumber(s.triangles)}</dd>
        <dt>Meshes / materials</dt>
        <dd>
          {formatNumber(s.meshes)} / {formatNumber(s.materials)}
        </dd>
        <dt>Textures</dt>
        <dd>
          {formatNumber(s.textures)}
          {a.textures.length > 0 && <span class="dim"> ({a.textures.map((t) => `${t.width}×${t.height}`).join(', ')})</span>}
        </dd>
        <dt>Animations</dt>
        <dd>
          {formatNumber(s.animations)}
          {s.clips && s.clips.length > 0 && <span class="dim"> ({s.clips.map((c) => c.name).join(', ')})</span>}
        </dd>
        <dt>Bones</dt>
        <dd>{formatNumber(s.bones)}</dd>
        <dt>Bounding box (m)</dt>
        <dd>{size}</dd>
      </dl>
      <h3 style={{ marginTop: '14px' }}>Optimise asset</h3>
      {opt('compressTextures', 'Compress textures', 'WebP encoding')}
      {opt('generateMipmaps', 'Generate mipmaps', 'smoother distant textures, +33% texture memory')}
      {opt('optimizeMesh', 'Optimise mesh', 'merge duplicate vertices')}
      {opt('removeUnused', 'Remove hidden objects and unused materials')}
      {opt('generateCollider', 'Generate collision', 'box collider from the bounds')}
      {opt('generateLods', 'Generate LODs', 'simpler copies of large meshes for distant views')}
      <div class="field" style={{ maxWidth: '260px', marginTop: '6px' }}>
        <label for="max-tex">Reduce texture resolution to</label>
        <select id="max-tex" class="input" value={String(settings.maxTextureSize)} onChange={(e) => setSettings({ ...settings, maxTextureSize: Number(e.currentTarget.value) })}>
          {[4096, 2048, 1024, 512, 256].map((v) => (
            <option key={v} value={String(v)}>
              {v} px (max side)
            </option>
          ))}
        </select>
      </div>
      <div class="row wrap" style={{ gap: '18px', marginTop: '6px' }}>
        <div>
          <div class="field-label">Original</div>
          <strong>{formatBytes(a.fileBytes)}</strong>
        </div>
        <div>
          <div class="field-label">GPU memory now</div>
          <strong>{formatBytes(s.gpuBytesEstimate ?? 0)}</strong>
        </div>
        <div>
          <div class="field-label">GPU memory after</div>
          <strong>{estimate === null ? '…' : `≈ ${formatBytes(estimate)}`}</strong>
        </div>
      </div>
      <p class="dim" style={{ fontSize: '0.84em' }}>The optimised file size is shown after import, measured from the file actually written.</p>
    </>
  );
}

function TextureOptions({ settings, setSettings }: { settings: ImportSettings; setSettings: (s: ImportSettings) => void }) {
  return (
    <>
      <label class="checkbox">
        <input type="checkbox" checked={settings.compressTextures} onChange={(e) => setSettings({ ...settings, compressTextures: e.currentTarget.checked })} />
        <span>Compress as WebP (kept only if smaller)</span>
      </label>
      <label class="checkbox">
        <input type="checkbox" checked={settings.generateMipmaps} onChange={(e) => setSettings({ ...settings, generateMipmaps: e.currentTarget.checked })} />
        <span>Generate mipmaps</span>
      </label>
      <div class="field" style={{ maxWidth: '260px' }}>
        <label for="tex-max">Maximum size</label>
        <select id="tex-max" class="input" value={String(settings.maxTextureSize)} onChange={(e) => setSettings({ ...settings, maxTextureSize: Number(e.currentTarget.value) })}>
          {[4096, 2048, 1024, 512, 256].map((v) => (
            <option key={v} value={String(v)}>
              {v} px
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
