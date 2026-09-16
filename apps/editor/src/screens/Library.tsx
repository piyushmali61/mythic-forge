import { KNOWN_LICENSES, type DownloadItem } from '@mythic-forge/core';
import { useEffect, useState } from 'preact/hooks';
import type { LibraryItem } from '../app/catalog-service.ts';
import { navigate, online, projects, reportError, settings, svc, toast, type LibraryTab } from '../app/state.ts';
import { config } from '../lib/config.ts';
import { PLATFORM_LABELS, formatBytes, formatNumber, formatSpeed } from '../lib/format.ts';
import { renderMarkdown } from '../lib/markdown.ts';
import { Badge, Callout, EmptyState, IconButton, Modal, NotImplemented, Tabs } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';
import { AssetThumb } from './library/AssetThumb.tsx';
import { LicensePanel } from './library/LicensePanel.tsx';

type SizeFilter = 'any' | 'small' | 'medium' | 'large';

const mainBytes = (i: LibraryItem): number => i.entry.files.find((f) => f.role === 'main')?.bytes ?? 0;

export function Library({ tab, assetId, projectId }: { tab: LibraryTab; assetId?: string | undefined; projectId?: string | undefined }) {
  const catalogs = svc().catalogs;
  useEffect(() => {
    if (!catalogs.loaded.value) void catalogs.load();
  }, []);
  const item = assetId ? catalogs.find(assetId) : undefined;

  return (
    <div class="page">
      <header class="page-header">
        {(assetId || projectId) && (
          <IconButton
            icon="arrow-left"
            label="Back"
            onClick={() => (assetId ? navigate({ name: 'library', tab, ...(projectId ? { projectId } : {}) }) : navigate({ name: 'editor', projectId: projectId! }))}
          />
        )}
        <h1>Asset Library</h1>
        {config.assetRepositoryUrl && (
          <button
            type="button"
            class="btn"
            disabled={!online.value || !settings.value.network.allowNetwork}
            onClick={() =>
              void catalogs
                .checkRemote()
                .then((r) => toast(r.changed ? `Library updated (${r.count} entries).` : 'The library is up to date.', 'success'))
                .catch((e: unknown) => reportError(e, 'The online library could not be checked.'))
            }
          >
            <Icon name="refresh" /> Check for updates
          </button>
        )}
      </header>
      <Tabs
        label="Library sections"
        value={tab}
        onChange={(t) => navigate({ name: 'library', tab: t, ...(projectId ? { projectId } : {}) }, true)}
        tabs={[
          { id: 'official', label: 'Mythic Bharat Studios' },
          { id: 'free-open', label: 'Free & Open' },
          { id: 'downloads', label: 'Downloads' },
        ]}
      />
      {!catalogs.loaded.value ? (
        <div class="empty-state" role="status">
          Loading library…
        </div>
      ) : tab === 'downloads' ? (
        <Downloads />
      ) : item ? (
        <AssetDetail item={item} projectId={projectId} />
      ) : (
        <AssetGrid section={tab} projectId={projectId} />
      )}
    </div>
  );
}

function AssetGrid({ section, projectId }: { section: 'official' | 'free-open'; projectId?: string | undefined }) {
  const catalogs = svc().catalogs;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [kind, setKind] = useState('all');
  const [license, setLicense] = useState('all');
  const [size, setSize] = useState<SizeFilter>('any');
  const items = catalogs.visible(section);
  const categories = [...new Set(items.map((i) => i.entry.category))].sort();
  const licenses = [...new Set(items.map((i) => i.entry.license.licenseId))].sort();
  const q = query.trim().toLowerCase();
  const list = items.filter((i) => {
    const e = i.entry;
    if (category !== 'all' && e.category !== category) return false;
    if (kind !== 'all' && e.kind !== kind) return false;
    if (license !== 'all' && e.license.licenseId !== license) return false;
    const b = mainBytes(i);
    if (size === 'small' && b > 1024 * 1024) return false;
    if (size === 'medium' && (b <= 1024 * 1024 || b > 10 * 1024 * 1024)) return false;
    if (size === 'large' && b <= 10 * 1024 * 1024) return false;
    if (!q) return true;
    return [e.name, e.description, e.category, e.license.creator, ...e.tags].some((s) => s.toLowerCase().includes(q));
  });
  const pending = items.filter((i) => !i.published).length;

  return (
    <>
      {section === 'official' ? (
        <p class="muted" style={{ marginTop: '14px' }}>
          Assets owned by Mythic Bharat Studios. Use them in personal and commercial projects under the Mythic Bharat Studios Asset License.
        </p>
      ) : (
        <p class="muted" style={{ marginTop: '14px' }}>
          Third-party assets appear here only after their licence has been checked and recorded: creator, source, licence, and what you may do with them.
        </p>
      )}
      {pending > 0 && (
        <Callout kind="warning" title="Development build">
          {pending} asset(s) are awaiting studio licence sign-off. They are shown here for testing only and are hidden in release builds until approved.
        </Callout>
      )}
      <div class="library-toolbar">
        <div class="search">
          <Icon name="search" size={16} />
          <input class="input" type="search" placeholder="Search assets…" aria-label="Search assets" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        </div>
        <select class="input" style={{ width: 'auto' }} aria-label="Category" value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select class="input" style={{ width: 'auto' }} aria-label="Type" value={kind} onChange={(e) => setKind(e.currentTarget.value)}>
          <option value="all">All types</option>
          <option value="model">Models (GLB)</option>
          <option value="material">Materials</option>
          <option value="texture">Textures</option>
          <option value="audio">Audio</option>
        </select>
        <select class="input" style={{ width: 'auto' }} aria-label="Licence" value={license} onChange={(e) => setLicense(e.currentTarget.value)}>
          <option value="all">All licences</option>
          {licenses.map((l) => (
            <option key={l} value={l}>
              {KNOWN_LICENSES[l]?.name ?? l}
            </option>
          ))}
        </select>
        <select class="input" style={{ width: 'auto' }} aria-label="Size" value={size} onChange={(e) => setSize(e.currentTarget.value as SizeFilter)}>
          <option value="any">Any size</option>
          <option value="small">Under 1 MB</option>
          <option value="medium">1–10 MB</option>
          <option value="large">Over 10 MB</option>
        </select>
      </div>
      {list.length === 0 ? (
        <EmptyState icon="library" title={items.length === 0 ? 'No assets here yet' : 'Nothing matches your filters'}>
          {items.length === 0 && section === 'free-open' && (
            <p>No third-party assets have completed licence review yet. This section fills up as assets are verified.</p>
          )}
        </EmptyState>
      ) : (
        <div class="asset-grid">
          {list.map((i) => (
            <button
              key={i.entry.id}
              type="button"
              class="card interactive asset-card"
              onClick={() => navigate({ name: 'library', tab: section, assetId: i.entry.id, ...(projectId ? { projectId } : {}) })}
            >
              <AssetThumb item={i} />
              <div class="asset-body">
                <h3>{i.entry.name}</h3>
                <div class="asset-meta">
                  <span>{i.entry.license.creator}</span>
                </div>
                <div class="asset-meta">
                  <Badge kind={i.published ? 'success' : 'warning'} icon={i.published ? 'shield' : 'alert'}>
                    {KNOWN_LICENSES[i.entry.license.licenseId]?.id ?? i.entry.license.licenseId}
                  </Badge>
                  <span>{i.entry.kind === 'material' ? 'Material' : i.entry.format.toUpperCase()}</span>
                  {mainBytes(i) > 0 && <span>{formatBytes(mainBytes(i))}</span>}
                </div>
                <div class="asset-meta">
                  {i.entry.compatibility.platforms.map((p) => PLATFORM_LABELS[p]).join(' · ')}
                  {svc().catalogs.isInstalled(i) && i.entry.kind !== 'material' && <Badge icon="check">Downloaded</Badge>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function AssetDetail({ item, projectId }: { item: LibraryItem; projectId?: string | undefined }) {
  const catalogs = svc().catalogs;
  const e = item.entry;
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [licenseText, setLicenseText] = useState<string | null>(null);
  const installed = catalogs.isInstalled(item);
  const usable = catalogs.usable(item);

  const addTo = async (targetId: string): Promise<void> => {
    setBusy(true);
    try {
      const input = await catalogs.toProjectAsset(item);
      const { meta, deduplicated } = await svc().store.addAsset(targetId, input);
      const name = projects.value.find((p) => p.id === targetId)?.name ?? 'the project';
      toast(deduplicated ? `"${meta.name}" is already in ${name}.` : `Added "${meta.name}" to ${name}.`, 'success', {
        actions: [{ label: 'Open project', run: () => navigate({ name: 'editor', projectId: targetId }) }],
      });
      if (projectId) navigate({ name: 'editor', projectId });
    } catch (error) {
      reportError(error, 'The asset could not be added.');
    } finally {
      setBusy(false);
    }
  };

  const download = async (): Promise<void> => {
    setBusy(true);
    try {
      await catalogs.install(item);
      toast(`Downloaded "${e.name}".`, 'success');
    } catch (error) {
      reportError(error, 'The download failed.', () => void download());
    } finally {
      setBusy(false);
    }
  };

  const s = e.stats;
  const size = s.boundsMin && s.boundsMax ? s.boundsMax.map((v, i) => (v - s.boundsMin![i]!).toFixed(2)).join(' × ') : null;
  return (
    <div class="asset-detail" style={{ marginTop: '16px' }}>
      <div>
        <AssetThumb item={item} large />
      </div>
      <div class="col" style={{ gap: '14px' }}>
        <div>
          <h2 style={{ marginBottom: '4px' }}>{e.name}</h2>
          <div class="row wrap" style={{ gap: '6px' }}>
            <Badge kind="gold">{e.category}</Badge>
            <Badge>v{e.version}</Badge>
            {e.tags.slice(0, 5).map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        </div>
        <p style={{ margin: 0 }}>{e.description}</p>
        <div class="row wrap">
          {e.kind === 'model' ? (
            <>
              <button type="button" class="btn btn-primary" disabled={busy || !usable} onClick={() => (projectId ? void addTo(projectId) : setPicking(true))}>
                <Icon name="plus" /> Add to project
              </button>
              <button type="button" class="btn" disabled={busy || installed || !usable} onClick={() => void download()}>
                <Icon name="download" /> {installed ? 'Downloaded' : 'Download'}
              </button>
              {installed && (
                <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void catalogs.uninstall(item).then(() => toast('Removed from this device.', 'success'))}>
                  Remove download
                </button>
              )}
            </>
          ) : (
            <Callout kind="info">Materials are applied from the editor: select an object, then choose this preset under Inspector → Material.</Callout>
          )}
          <button
            type="button"
            class="btn btn-ghost"
            onClick={() =>
              void catalogs
                .licenseText(item)
                .then((t) => setLicenseText(t ?? 'The licence text is not available offline.'))
                .catch((err: unknown) => reportError(err, 'The licence could not be opened.'))
            }
          >
            <Icon name="shield" /> View licence
          </button>
          {e.license.sourceUrl ? (
            <a class="btn btn-ghost" href={e.license.sourceUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> View source
            </a>
          ) : (
            <button type="button" class="btn btn-ghost" onClick={() => toast(e.license.sourceDescription || 'No source recorded.', 'info', { timeoutMs: 9000 })}>
              <Icon name="info" /> View source
            </button>
          )}
          <button
            type="button"
            class="btn btn-ghost"
            onClick={() =>
              toast('Reporting is not available yet: there is no community service in this version. Please contact Mythic Bharat Studios through the support link in Settings → About.', 'info', {
                timeoutMs: 10000,
              })
            }
          >
            <Icon name="flag" /> Report <NotImplemented label="Soon" />
          </button>
        </div>
        {!usable && <Callout kind="warning">This asset has not completed licence review and can't be used in this build.</Callout>}
        <dl class="kv">
          <dt>Creator</dt>
          <dd>{e.license.creator}</dd>
          <dt>Format</dt>
          <dd>{e.kind === 'material' ? 'Material preset' : e.format.toUpperCase()}</dd>
          {mainBytes(item) > 0 && (
            <>
              <dt>File size</dt>
              <dd>{formatBytes(mainBytes(item))}</dd>
            </>
          )}
          {s.triangles !== undefined && (
            <>
              <dt>Triangles</dt>
              <dd>{formatNumber(s.triangles)}</dd>
              <dt>Vertices</dt>
              <dd>{formatNumber(s.vertices)}</dd>
              <dt>Materials</dt>
              <dd>{formatNumber(s.materials)}</dd>
              <dt>Textures</dt>
              <dd>{s.textures ? formatNumber(s.textures) : 'None (uses material colours)'}</dd>
              <dt>Animations</dt>
              <dd>{s.animations ? formatNumber(s.animations) : 'None'}</dd>
            </>
          )}
          {size && (
            <>
              <dt>Size (m)</dt>
              <dd>{size}</dd>
            </>
          )}
          {s.gpuBytesEstimate !== undefined && (
            <>
              <dt>GPU memory</dt>
              <dd>≈ {formatBytes(s.gpuBytesEstimate)}</dd>
            </>
          )}
          <dt>Compatibility</dt>
          <dd>
            {e.compatibility.platforms.map((p) => PLATFORM_LABELS[p]).join(', ')} · Mythic Forge {e.compatibility.minEngineVersion}+ · runs on {e.compatibility.minQuality} quality and up
          </dd>
        </dl>
        <LicensePanel license={e.license} verdict={item.verdict} published={item.published} />
      </div>
      {picking && <ProjectPicker onClose={() => setPicking(false)} onPick={(id) => void addTo(id)} />}
      {licenseText !== null && (
        <Modal title={e.license.licenseName || 'Licence'} onClose={() => setLicenseText(null)} wide>
          <div class="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(licenseText) }} />
        </Modal>
      )}
    </div>
  );
}

function ProjectPicker({ onClose, onPick }: { onClose: () => void; onPick: (projectId: string) => void }) {
  const list = projects.value.filter((p) => !p.archived && !p.error && p.compatibility.status !== 'unsupported' && p.compatibility.status !== 'needs-upgrade');
  return (
    <Modal title="Add to which project?" onClose={onClose}>
      {list.length === 0 ? (
        <EmptyState icon="folder" title="No projects yet">
          <button type="button" class="btn btn-primary" onClick={() => navigate({ name: 'new-project' })}>
            Create a project
          </button>
        </EmptyState>
      ) : (
        <ul class="search-results">
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPick(p.id);
                }}
              >
                <Icon name="folder" />
                <span style={{ flex: 1 }}>{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Downloads() {
  const dm = svc().downloads;
  const [items, setItems] = useState<DownloadItem[]>(dm.list());
  useEffect(() => dm.events.on('change', (list) => setItems([...list])), []);
  const active = items.some((i) => i.status === 'downloading' || i.status === 'queued');
  return (
    <div style={{ marginTop: '14px' }}>
      <div class="row" style={{ marginBottom: '10px' }}>
        <span class="muted" style={{ flex: 1 }}>
          Downloads happen only when you start them, and stop when the app is closed or goes to the background.
        </span>
        {active && (
          <button type="button" class="btn btn-sm" onClick={() => dm.pauseAll()}>
            Pause all
          </button>
        )}
        <button type="button" class="btn btn-sm" onClick={() => dm.clearFinished()}>
          Clear finished
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon="download" title="No downloads" />
      ) : (
        <div class="col">
          {items.map((d) => {
            const pct = d.total ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0;
            return (
              <div key={d.id} class="card" style={{ padding: '10px 12px' }}>
                <div class="row">
                  <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</strong>
                  <span class="dim" style={{ fontSize: '0.84em' }}>
                    {formatBytes(d.received)} / {formatBytes(d.total)} {formatSpeed(d.speed)}
                  </span>
                </div>
                <div class="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ margin: '6px 0' }}>
                  <div style={{ width: `${pct}%` }} />
                </div>
                <div class="row">
                  <Badge kind={d.status === 'completed' ? 'success' : d.status === 'failed' ? 'danger' : undefined}>{d.status}</Badge>
                  {d.error && <span class="dim" style={{ fontSize: '0.84em' }}>{d.error}</span>}
                  <span class="spacer" />
                  {(d.status === 'downloading' || d.status === 'queued') && (
                    <button type="button" class="btn btn-sm" onClick={() => dm.pause(d.id)}>
                      Pause
                    </button>
                  )}
                  {(d.status === 'paused' || d.status === 'failed') && (
                    <button type="button" class="btn btn-sm" onClick={() => dm.resume(d.id)}>
                      Resume
                    </button>
                  )}
                  {d.status !== 'completed' && d.status !== 'cancelled' && (
                    <button type="button" class="btn btn-sm btn-ghost" onClick={() => dm.cancel(d.id)}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
