import {
  PERFORMANCE_PROFILES,
  PROJECT_TYPE_LABELS,
  QUALITY_LABELS,
  QUALITY_LEVELS,
  type BackupInfo,
  type PerformanceProfileId,
  type QualityLevel,
  type TargetPlatform,
} from '@mythic-forge/core';
import { useEffect, useState } from 'preact/hooks';
import { exportProject } from '../app/project-actions.ts';
import { confirmAction, navigate, reportError, svc, toast } from '../app/state.ts';
import { Modal } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';
import type { EditorSession } from './session.ts';

const PROFILE_LABELS: Record<PerformanceProfileId, string> = {
  'battery-saver': 'Battery Saver',
  balanced: 'Balanced',
  performance: 'Performance',
  custom: 'Custom',
};

export function ProjectSettings({ session, onClose }: { session: EditorSession; onClose: () => void }) {
  const m = session.manifest.value;
  const [name, setName] = useState(m.name);
  const [description, setDescription] = useState(m.description);
  const [targets, setTargets] = useState<TargetPlatform[]>(m.targets);
  const [profile, setProfile] = useState<PerformanceProfileId>(m.performanceProfile);
  const [custom, setCustom] = useState<QualityLevel>(m.customQuality ?? 'medium');
  const [backups, setBackups] = useState<BackupInfo[]>([]);

  useEffect(() => {
    void svc().store.listBackups(m.id).then(setBackups);
  }, []);

  const apply = async (): Promise<void> => {
    try {
      await session.updateManifest({
        name: name.trim() || m.name,
        description: description.slice(0, 500),
        targets: targets.length ? targets : m.targets,
        performanceProfile: profile,
        customQuality: profile === 'custom' ? custom : null,
      });
      toast('Project settings saved.', 'success');
      onClose();
    } catch (error) {
      reportError(error, 'Project settings could not be saved.');
    }
  };

  const restore = async (b: BackupInfo): Promise<void> => {
    const ok = await confirmAction({
      title: 'Restore this backup?',
      body: `The project will be returned to how it was saved on ${new Date(b.createdAt).toLocaleString()}. The current version is backed up first. The editor will reopen.`,
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    try {
      session.stop();
      await svc().store.restoreBackup(m.id, b.id);
      await svc().recovery.clear(m.id);
      session.savedRevision.value = session.revision.value;
      onClose();
      navigate({ name: 'projects' }, true);
      setTimeout(() => navigate({ name: 'editor', projectId: m.id }), 0);
      toast('Backup restored.', 'success');
    } catch (error) {
      reportError(error, 'The backup could not be restored.');
    }
  };

  const toggleTarget = (t: TargetPlatform): void => setTargets(targets.includes(t) ? targets.filter((x) => x !== t) : [...targets, t]);

  return (
    <Modal
      title="Project Settings"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" class="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" class="btn btn-primary" onClick={() => void apply()}>
            Save settings
          </button>
        </>
      }
    >
      <div class="field">
        <label for="ps-name">Name</label>
        <input id="ps-name" class="input" value={name} maxLength={80} onInput={(e) => setName(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label for="ps-desc">Description</label>
        <textarea id="ps-desc" class="input" value={description} maxLength={500} onInput={(e) => setDescription(e.currentTarget.value)} />
      </div>
      <div class="row wrap" style={{ gap: '28px', alignItems: 'flex-start' }}>
        <div class="field">
          <span class="field-label">Target platforms</span>
          {(['android', 'windows'] as const).map((t) => (
            <label key={t} class="checkbox">
              <input type="checkbox" checked={targets.includes(t)} onChange={() => toggleTarget(t)} />
              <span>{t === 'android' ? 'Android' : 'Windows'}</span>
            </label>
          ))}
        </div>
        <div class="field">
          <label for="ps-profile">Performance profile</label>
          <select id="ps-profile" class="input" value={profile} onChange={(e) => setProfile(e.currentTarget.value as PerformanceProfileId)}>
            {PERFORMANCE_PROFILES.map((p) => (
              <option key={p} value={p}>
                {PROFILE_LABELS[p]}
              </option>
            ))}
          </select>
          {profile === 'custom' && (
            <select class="input" aria-label="Custom quality" style={{ marginTop: '6px' }} value={custom} onChange={(e) => setCustom(e.currentTarget.value as QualityLevel)}>
              {QUALITY_LEVELS.map((q) => (
                <option key={q} value={q}>
                  {QUALITY_LABELS[q]}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <dl class="kv" style={{ margin: '8px 0 16px' }}>
        <dt>Type</dt>
        <dd>{PROJECT_TYPE_LABELS[m.type]}</dd>
        <dt>Created</dt>
        <dd>
          {new Date(m.createdAt).toLocaleString()} with Mythic Forge {m.createdWithEngineVersion}
        </dd>
        <dt>Format</dt>
        <dd>
          project v{m.formatVersion} · renderer v{m.rendererVersion}
        </dd>
      </dl>
      <h3>Backups</h3>
      <p class="dim">Each manual save keeps the previous version. The three most recent are kept.</p>
      {backups.length === 0 ? (
        <p class="dim">No backups yet — they appear after you save.</p>
      ) : (
        <ul class="search-results">
          {backups.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => void restore(b)}>
                <Icon name="refresh" />
                <span style={{ flex: 1 }}>{b.createdAt ? new Date(b.createdAt).toLocaleString() : b.id}</span>
                <span class="dim">Restore</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div class="row" style={{ marginTop: '12px' }}>
        <button type="button" class="btn btn-sm" onClick={() => void svc().store.createBackup(m.id).then(() => svc().store.listBackups(m.id).then(setBackups))}>
          Back up now
        </button>
        <button type="button" class="btn btn-sm" onClick={() => void exportProject(m)}>
          <Icon name="upload" size={16} /> Export .mfpack
        </button>
      </div>
    </Modal>
  );
}
