import {
  PACK_EXTENSION,
  UserFacingError,
  exportProjectPack,
  getTemplate,
  importProjectPack,
  isRecoveryRelevant,
  log,
  type CreateProjectOptions,
  type NewAssetInput,
  type ProjectSummary,
} from '@mythic-forge/core';
import {
  choose,
  confirmAction,
  navigate,
  openDialog,
  refreshProjects,
  reportError,
  svc,
  toast,
} from './state.ts';

/** Creates a project. Official assets a template needs are copied in when available. */
export async function createProject(options: Omit<CreateProjectOptions, 'assets'>): Promise<string> {
  const { store, catalogs } = svc();
  const template = getTemplate(options.templateId);
  const assets: NewAssetInput[] = [];
  const missing: string[] = [];
  if (template?.requiredAssets.length) {
    if (!catalogs.loaded.value) await catalogs.load();
    for (const id of template.requiredAssets) {
      const item = catalogs.find(id);
      if (!item || !catalogs.usable(item)) {
        missing.push(id);
        continue;
      }
      try {
        assets.push(await catalogs.toProjectAsset(item));
      } catch (error) {
        log.warn('Projects', `Template asset ${id} unavailable; using a placeholder.`, String(error));
        missing.push(id);
      }
    }
  }
  const { manifest } = await store.create({ ...options, assets });
  if (missing.length) {
    toast(
      `${missing.length} library asset(s) aren't available in this build, so simple shapes were used instead.`,
      'info',
    );
  }
  await refreshProjects();
  return manifest.id;
}

export async function createDemoProject(): Promise<void> {
  try {
    const id = await createProject({
      name: 'Shrine of Lamps (Demo)',
      description: 'Walk to every diya to light up the shrine.',
      type: '3d-game',
      targets: ['android', 'windows'],
      performanceProfile: 'balanced',
      templateId: 'shrine-of-lamps',
    });
    await openProject(id);
  } catch (error) {
    reportError(error, 'The demo project could not be created.');
  }
}

/** Opens a project, handling old/new formats, damage and crash recovery. */
export async function openProject(id: string): Promise<void> {
  const { store, recovery } = svc();
  let result = await store.open(id);

  if (!result.ok && result.reason === 'needs-upgrade') {
    const upgrade = await openDialog({
      title: 'Older project',
      body:
        `This project was created using an older version of Mythic Forge${result.compatibility && 'savedWith' in result.compatibility ? ` (${result.compatibility.savedWith})` : ''}.\n\n` +
        'To open it, Mythic Forge will first create a backup and then upgrade the project to the current format. The backup can be restored from the project menu.',
      confirmLabel: 'Back up and upgrade',
    });
    if (!upgrade) return;
    try {
      await store.upgrade(id);
      toast('Project upgraded. A backup of the old version was kept.', 'success');
    } catch (error) {
      reportError(error, 'The project could not be upgraded.');
      return;
    }
    result = await store.open(id);
  }

  if (!result.ok) {
    if (result.reason === 'corrupt') {
      const backups = await store.listBackups(id);
      const choice = await choose({
        title: 'Project could not be opened',
        body: `${result.message}${backups.length ? '\n\nA backup from an earlier save is available.' : ''}`,
        choices: [
          { id: 'close', label: 'Close' },
          { id: 'details', label: 'View details' },
          ...(backups.length ? [{ id: 'restore', label: 'Restore latest backup', kind: 'primary' as const }] : []),
        ],
      });
      if (choice === 'details') {
        await openDialog({ title: 'Details', body: result.details.join('\n') || result.message, mono: true, confirmLabel: 'Close', cancelLabel: 'Back' });
      } else if (choice === 'restore' && backups[0]) {
        await store.restoreBackup(id, backups[0].id);
        toast('Backup restored.', 'success');
        await openProject(id);
      }
      return;
    }
    await openDialog({ title: 'Cannot open project', body: result.message, confirmLabel: 'OK', cancelLabel: 'Close' });
    return;
  }

  if (result.compatibility.status === 'newer-engine') {
    const go = await openDialog({
      title: 'Saved by a newer version',
      body: `This project was last saved with Mythic Forge ${result.compatibility.savedWith}. You can open it, but features added in newer versions may be lost when you save here.`,
      confirmLabel: 'Open anyway',
    });
    if (!go) return;
  } else if (result.compatibility.status === 'older-engine') {
    toast(`This project was created with Mythic Forge ${result.compatibility.savedWith}. Saving will store it for this version.`, 'info');
  }

  let recovered = false;
  const snapshot = await recovery.read(id).catch(() => null);
  if (snapshot && isRecoveryRelevant(snapshot, result.manifest.modifiedAt)) {
    const choice = await choose({
      title: 'Unsaved changes found',
      body: `We found a recoverable version of "${result.manifest.name}" from ${new Date(snapshot.savedAt).toLocaleString()} that is newer than your last save.`,
      choices: [
        { id: 'details', label: 'View details' },
        { id: 'discard', label: 'Discard', kind: 'danger' },
        { id: 'restore', label: 'Restore', kind: 'primary' },
      ],
    });
    if (choice === 'details') {
      await openDialog({
        title: 'Recovered version',
        body: `Scene: ${snapshot.scene.name}\nObjects: ${Object.keys(snapshot.scene.entities).length}\nRecovered at: ${snapshot.savedAt}\nLast saved: ${result.manifest.modifiedAt}`,
        mono: true,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
      });
      return openProject(id);
    }
    if (choice === null) return;
    if (choice === 'discard') await recovery.clear(id);
    recovered = choice === 'restore';
  }
  navigate({ name: 'editor', projectId: id, recovered });
}

/** Checks for a crash from the previous session and offers recovery. */
export async function checkCrashRecovery(): Promise<void> {
  const { recovery, store } = svc();
  const marker = await recovery.uncleanSession();
  if (!marker) return;
  await recovery.endSession();
  const snapshot = await recovery.read(marker.projectId);
  if (!snapshot) return;
  const opened = await store.open(marker.projectId);
  if (!opened.ok || !isRecoveryRelevant(snapshot, opened.manifest.modifiedAt)) return;
  const choice = await choose({
    title: 'Recover your work?',
    body: `Mythic Forge didn't close normally last time. We recovered an unsaved version of "${snapshot.projectName}" from ${new Date(snapshot.savedAt).toLocaleString()}.`,
    choices: [
      { id: 'later', label: 'Decide later' },
      { id: 'discard', label: 'Discard', kind: 'danger' },
      { id: 'restore', label: 'Restore', kind: 'primary' },
    ],
  });
  if (choice === 'restore') navigate({ name: 'editor', projectId: marker.projectId, recovered: true });
  else if (choice === 'discard') await recovery.clear(marker.projectId);
}

export async function renameProject(p: ProjectSummary, name: string): Promise<void> {
  try {
    await svc().store.rename(p.id, name);
    await refreshProjects();
  } catch (error) {
    reportError(error, 'The project could not be renamed.');
  }
}

export async function duplicateProject(p: ProjectSummary): Promise<void> {
  try {
    await svc().store.duplicate(p.id, `${p.name} (copy)`.slice(0, 80));
    await refreshProjects();
    toast(`Duplicated "${p.name}".`, 'success');
  } catch (error) {
    reportError(error, 'The project could not be duplicated.');
  }
}

export async function deleteProject(p: ProjectSummary): Promise<void> {
  const ok = await confirmAction({
    title: 'Delete project?',
    body: `"${p.name}" and all of its scenes and imported assets will be permanently deleted from this device. This cannot be undone.\n\nTip: export the project first if you might need it again.`,
    confirmLabel: 'Delete permanently',
  });
  if (!ok) return;
  try {
    await svc().store.delete(p.id);
    await svc().recovery.clear(p.id);
    await refreshProjects();
    toast(`Deleted "${p.name}".`, 'success');
  } catch (error) {
    reportError(error, 'The project could not be deleted.');
  }
}

export async function setArchived(p: ProjectSummary, archived: boolean): Promise<void> {
  try {
    await svc().store.setArchived(p.id, archived);
    await refreshProjects();
    toast(archived ? `Archived "${p.name}".` : `Restored "${p.name}".`, 'success');
  } catch (error) {
    reportError(error, 'The project could not be updated.');
  }
}

export async function exportProject(p: Pick<ProjectSummary, 'id' | 'name'>): Promise<void> {
  const { platform } = svc();
  try {
    const { bytes, fileName } = await exportProjectPack(platform.fs, p.id);
    const result = await platform.files.save(fileName, bytes, 'application/zip');
    if (result !== 'cancelled') toast(`Exported "${p.name}" (${fileName}).`, 'success');
  } catch (error) {
    reportError(error, 'The project could not be exported.');
  }
}

export async function importProjectFile(): Promise<void> {
  const { platform, store, limits } = svc();
  const files = await platform.files.pick({ accept: `.${PACK_EXTENSION}`, multiple: false });
  const file = files[0];
  if (!file) return;
  try {
    if (!file.name.toLowerCase().endsWith(`.${PACK_EXTENSION}`)) {
      throw new UserFacingError('pack-type', `Choose a Mythic Forge project file (.${PACK_EXTENSION}).`);
    }
    if (file.size > limits.maxArchiveBytes) throw new UserFacingError('pack-size', 'This project file is too large for this device.');
    const result = await importProjectPack(platform.fs, store, await file.bytes(), limits);
    await refreshProjects();
    toast(`Imported "${result.name}".`, 'success', {
      actions: [{ label: 'Open', run: () => void openProject(result.projectId) }],
      ...(result.warnings.length ? { detail: result.warnings.join(' ') } : {}),
    });
  } catch (error) {
    reportError(error, 'The project could not be imported.');
  }
}
