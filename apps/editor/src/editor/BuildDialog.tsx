import { QUALITY_LABELS, QUALITY_LEVELS, formatBytes, type QualityLevel } from '@mythic-forge/core';
import { useState } from 'preact/hooks';
import { navigate, reportError, svc, toast } from '../app/state.ts';
import type { BuildResult } from '../build/web-export.ts';
import { Callout, Modal, NotImplemented, Segmented } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';
import type { EditorSession } from './session.ts';

type Target = 'web' | 'android' | 'windows';

export function BuildDialog({ session, onClose }: { session: EditorSession; onClose: () => void }) {
  const manifest = session.manifest.value;
  const [target, setTarget] = useState<Target>('web');
  const [buildType, setBuildType] = useState<'debug' | 'release'>('release');
  const [quality, setQuality] = useState<QualityLevel | 'auto'>('auto');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BuildResult | null>(null);

  const build = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      const options = { debug: buildType === 'debug', quality };
      if (target === 'windows') {
        const { buildWindowsExport } = await import('../build/windows-export.ts');
        setResult(await buildWindowsExport(manifest, session.scene.toJSON(), options));
      } else {
        const { buildWebExport } = await import('../build/web-export.ts');
        setResult(await buildWebExport(manifest, session.scene.toJSON(), options));
      }
    } catch (error) {
      reportError(error, 'The build failed.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    if (!result) return;
    try {
      const outcome = await svc().platform.files.save(result.fileName, result.bytes, result.mime);
      if (outcome !== 'cancelled') toast(`Build saved as ${result.fileName}.`, 'success');
    } catch (error) {
      reportError(error, 'The build could not be saved.');
    }
  };

  return (
    <Modal
      title="Build & Export"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" class="btn" onClick={onClose}>
            Close
          </button>
          {result ? (
            <button type="button" class="btn btn-primary" onClick={() => void save()}>
              <Icon name="download" /> Save {formatBytes(result.bytes.byteLength)} file
            </button>
          ) : (
            <button type="button" class="btn btn-primary" disabled={busy || target === 'android'} onClick={() => void build()}>
              <Icon name="hammer" /> {busy ? 'Building…' : 'BUILD'}
            </button>
          )}
        </>
      }
    >
      <dl class="kv" style={{ marginBottom: '14px' }}>
        <dt>Project</dt>
        <dd>{manifest.name}</dd>
        <dt>Engine</dt>
        <dd>Mythic Forge {manifest.engineVersion}</dd>
      </dl>
      <div class="field">
        <span class="field-label">Target</span>
        <div class="choice-grid" role="radiogroup" aria-label="Target">
          <button type="button" role="radio" class="choice" aria-checked={target === 'web'} onClick={() => (setTarget('web'), setResult(null))}>
            <strong>
              <Icon name="globe" /> Web (single HTML file)
            </strong>
            <span>Runs in Chrome, Edge and Android browsers. Works offline once downloaded.</span>
          </button>
          <button type="button" role="radio" class="choice" aria-checked={target === 'android'} onClick={() => (setTarget('android'), setResult(null))}>
            <strong>
              Android (APK / AAB) <NotImplemented />
            </strong>
            <span>Architecture: ARM64. Needs signing and the Android SDK.</span>
          </button>
          <button type="button" role="radio" class="choice" aria-checked={target === 'windows'} onClick={() => (setTarget('windows'), setResult(null))}>
            <strong>
              <Icon name="monitor" /> Windows (portable .zip)
            </strong>
            <span>Windows 10/11. A small launcher opens the game in a Microsoft Edge app window. No install needed.</span>
          </button>
        </div>
      </div>
      {target === 'android' ? (
        <Callout kind="info" title="Not available yet">
          Packaging games as Android apps from inside the editor is planned. It needs the Android SDK, a signing key and Google Play's current requirements, checked at release time. For now, export a Web build and see{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onClose();
              navigate({ name: 'docs', page: 'building' });
            }}
          >
            Building & Exporting
          </a>{' '}
          for how to wrap it with the provided shells.
        </Callout>
      ) : (
        <>
          <div class="row wrap" style={{ gap: '24px' }}>
            <div class="field">
              <span class="field-label">Build type</span>
              <Segmented
                label="Build type"
                value={buildType}
                onChange={(v) => (setBuildType(v), setResult(null))}
                options={[
                  { value: 'debug', label: 'Debug' },
                  { value: 'release', label: 'Release' },
                ]}
              />
              <span class="field-hint">Debug shows a frame-rate counter.</span>
            </div>
            <div class="field">
              <label for="build-quality">Quality</label>
              <select id="build-quality" class="input" value={quality} onChange={(e) => (setQuality(e.currentTarget.value as QualityLevel | 'auto'), setResult(null))}>
                <option value="auto">Auto — adapt to each player's device ({manifest.performanceProfile.replace('-', ' ')} profile)</option>
                {QUALITY_LEVELS.map((q) => (
                  <option key={q} value={q}>
                    {QUALITY_LABELS[q]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {session.dirty.value && <Callout kind="info">The build uses the scene as it is now, including unsaved changes.</Callout>}
          {result && (
            <Callout kind={result.warnings.length ? 'warning' : 'success'} title="Build complete">
              <div>
                {result.fileName} — {formatBytes(result.bytes.byteLength)} ({result.assetCount} asset(s), {formatBytes(result.assetBytes)}; runtime {formatBytes(result.runtimeBytes)})
              </div>
              {result.warnings.map((w) => (
                <div key={w}>⚠ {w}</div>
              ))}
            </Callout>
          )}
        </>
      )}
    </Modal>
  );
}
