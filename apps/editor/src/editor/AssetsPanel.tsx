import { buildAttribution, compareVersions, defaultMaterial, formatBytes, type ProjectAssetMeta } from '@mythic-forge/core';
import { useState } from 'preact/hooks';
import { confirmAction, navigate, reportError, svc, toast } from '../app/state.ts';
import { formatDuration, formatNumber } from '../lib/format.ts';
import { Badge, EmptyState, Menu, Modal, type MenuItem } from '../ui/common.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import type { EditorSession } from './session.ts';

const KIND_ICON: Record<ProjectAssetMeta['kind'], IconName> = { model: 'model', texture: 'image', audio: 'music' };
const SOURCE_LABEL: Record<ProjectAssetMeta['provenance']['source'], string> = {
  'user-import': 'Imported',
  official: 'Official',
  'free-open': 'Free & Open',
};

export function AssetsPanel({ session, onImport }: { session: EditorSession; onImport: () => void }) {
  void session.revision.value;
  const assets = session.assets.value;
  const [menu, setMenu] = useState<{ meta: ProjectAssetMeta; x: number; y: number } | null>(null);
  const [details, setDetails] = useState<ProjectAssetMeta | null>(null);
  const selected = session.selection.value ? session.scene.get(session.selection.value) : undefined;
  const catalogs = svc().catalogs;

  const newer = (meta: ProjectAssetMeta) => {
    if (!meta.provenance.catalogId || !meta.provenance.catalogVersion) return undefined;
    const item = catalogs.find(meta.provenance.catalogId);
    return item && catalogs.usable(item) && compareVersions(item.entry.version, meta.provenance.catalogVersion) > 0 ? item : undefined;
  };

  const remove = async (meta: ProjectAssetMeta): Promise<void> => {
    const uses = session.assetUsage(meta.id);
    const ok = await confirmAction({
      title: 'Remove asset from project?',
      body: `"${meta.name}" will be deleted from this project.${uses ? `\n\nIt is used by ${uses} object(s) in the open scene; they will show a missing-asset marker.` : ''}`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await session.removeAsset(meta);
      toast(`Removed "${meta.name}".`, 'success');
    } catch (error) {
      reportError(error, 'The asset could not be removed.');
    }
  };

  const update = async (meta: ProjectAssetMeta): Promise<void> => {
    const item = newer(meta);
    if (!item) return;
    const ok = await confirmAction({
      title: `Update "${meta.name}"?`,
      body: `Replace version ${meta.provenance.catalogVersion} with ${item.entry.version} in this project. Objects using it will show the new version.`,
      confirmLabel: 'Update asset',
    });
    if (!ok) return;
    try {
      const input = await catalogs.toProjectAsset(item);
      await svc().store.removeAsset(session.projectId, meta.id);
      await svc().store.addAsset(session.projectId, { ...input, id: meta.id });
      await session.loadAssets();
      session.reloadAssetUsers(meta.id);
      toast(`Updated "${meta.name}" to ${item.entry.version}.`, 'success');
    } catch (error) {
      reportError(error, 'The asset could not be updated.');
    }
  };

  const items = (meta: ProjectAssetMeta): MenuItem[] => {
    const list: MenuItem[] = [];
    if (meta.kind === 'model') list.push({ label: 'Add to scene', icon: 'plus', onSelect: () => session.addModel(meta) });
    if (meta.kind === 'texture')
      list.push({
        label: selected?.components.mesh ? `Apply to "${selected.name}"` : 'Apply to selected (select a shape first)',
        icon: 'image',
        disabled: !selected?.components.mesh,
        onSelect: () => {
          if (!selected) return;
          const m = selected.components.material ?? defaultMaterial();
          session.updateComponent(selected.id, 'material', { ...m, textureAssetId: meta.id }, 'Apply texture');
        },
      });
    if (meta.kind === 'audio')
      list.push({
        label: selected ? `Play on "${selected.name}"` : 'Play on selected (select an object first)',
        icon: 'music',
        disabled: !selected,
        onSelect: () => selected && session.updateComponent(selected.id, 'audioSource', { assetId: meta.id, volume: 1, loop: false, playOnStart: true }, 'Add audio'),
      });
    list.push({ label: 'Details & licence', icon: 'info', onSelect: () => setDetails(meta) });
    if (newer(meta)) list.push({ label: `Update to ${newer(meta)!.entry.version}`, icon: 'refresh', onSelect: () => void update(meta) });
    list.push({ separator: true, label: 'sep' }, { label: 'Remove from project', icon: 'trash', danger: true, onSelect: () => void remove(meta) });
    return list;
  };

  return (
    <div>
      <div class="console-filters">
        <button type="button" class="btn btn-sm btn-primary" onClick={onImport} disabled={session.playState.value !== 'edit'}>
          <Icon name="upload" size={16} /> Import
        </button>
        <button type="button" class="btn btn-sm" onClick={() => navigate({ name: 'library', tab: 'official', projectId: session.projectId })}>
          <Icon name="library" size={16} /> Asset Library
        </button>
        <span class="spacer" />
        <span class="dim" style={{ fontSize: '0.84em' }}>
          {assets.length} asset(s) · {formatBytes(assets.reduce((s, a) => s + a.storedBytes, 0))}
        </span>
      </div>
      {assets.length === 0 ? (
        <EmptyState icon="package" title="No assets in this project">
          <p class="muted">Import your own models, images and sounds, or add official assets from the library.</p>
        </EmptyState>
      ) : (
        <div class="asset-list">
          {assets.map((a) => (
            <button
              key={a.id}
              type="button"
              class="asset-tile"
              title={a.name}
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setMenu({ meta: a, x: r.left, y: r.bottom });
              }}
              onDblClick={() => a.kind === 'model' && session.addModel(a)}
              disabled={session.playState.value !== 'edit'}
            >
              <Icon name={KIND_ICON[a.kind]} size={22} />
              <span class="name">{a.name}</span>
              <span class="meta">
                {a.fileFormat.toUpperCase()} · {formatBytes(a.storedBytes)}
              </span>
              <span class="row wrap" style={{ gap: '3px' }}>
                <Badge kind={a.provenance.source === 'user-import' ? undefined : 'gold'}>{SOURCE_LABEL[a.provenance.source]}</Badge>
                {newer(a) && <Badge kind="info">Update</Badge>}
                {session.assetUsage(a.id) > 0 && <Badge>{session.assetUsage(a.id)} used</Badge>}
              </span>
            </button>
          ))}
        </div>
      )}
      {menu && <Menu label="Asset actions" items={items(menu.meta)} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
      {details && <AssetDetails meta={details} onClose={() => setDetails(null)} />}
    </div>
  );
}

function AssetDetails({ meta, onClose }: { meta: ProjectAssetMeta; onClose: () => void }) {
  const s = meta.stats;
  const lic = meta.provenance.license;
  return (
    <Modal title={meta.name} onClose={onClose}>
      <dl class="kv">
        <dt>Type</dt>
        <dd>
          {meta.kind} ({meta.fileFormat.toUpperCase()})
        </dd>
        <dt>Stored size</dt>
        <dd>
          {formatBytes(meta.storedBytes)} <span class="dim">(original {formatBytes(meta.originalBytes)})</span>
        </dd>
        {s.triangles !== undefined && (
          <>
            <dt>Triangles / vertices</dt>
            <dd>
              {formatNumber(s.triangles)} / {formatNumber(s.vertices)}
            </dd>
          </>
        )}
        {s.width !== undefined && (
          <>
            <dt>Resolution</dt>
            <dd>
              {s.width} × {s.height}
            </dd>
          </>
        )}
        {s.durationSec !== undefined && (
          <>
            <dt>Duration</dt>
            <dd>{formatDuration(s.durationSec)}</dd>
          </>
        )}
        {s.gpuBytesEstimate !== undefined && (
          <>
            <dt>GPU memory</dt>
            <dd>≈ {formatBytes(s.gpuBytesEstimate)}</dd>
          </>
        )}
        <dt>Imported</dt>
        <dd>{new Date(meta.importedAt).toLocaleString()}</dd>
        <dt>Source</dt>
        <dd>
          {SOURCE_LABEL[meta.provenance.source]}
          {meta.provenance.catalogId && ` — ${meta.provenance.catalogId} v${meta.provenance.catalogVersion}`}
          {meta.provenance.source === 'user-import' && ` — ${meta.provenance.originalFileName}`}
        </dd>
        {meta.provenance.source === 'user-import' && (
          <>
            <dt>Rights</dt>
            <dd>You confirmed you have the right to use this file.</dd>
          </>
        )}
        {lic && (
          <>
            <dt>Licence</dt>
            <dd>{lic.licenseName}</dd>
            <dt>Creator</dt>
            <dd>{lic.creator}</dd>
            {lic.attributionRequired && (
              <>
                <dt>Attribution</dt>
                <dd>{buildAttribution(lic)}</dd>
              </>
            )}
          </>
        )}
      </dl>
    </Modal>
  );
}
