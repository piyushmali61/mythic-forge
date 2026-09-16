import { PROJECT_TYPE_LABELS, type ProjectSummary } from '@mythic-forge/core';
import { useEffect, useState } from 'preact/hooks';
import {
  deleteProject,
  duplicateProject,
  exportProject,
  openProject,
  renameProject,
  setArchived,
} from '../app/project-actions.ts';
import { svc } from '../app/state.ts';
import { PLATFORM_LABELS, formatBytes, formatRelativeDate } from '../lib/format.ts';
import { Badge, IconButton, Menu, Modal, type MenuItem } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';

function useThumbnail(p: ProjectSummary): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!p.hasThumbnail) return;
    let objectUrl: string | null = null;
    let alive = true;
    void svc()
      .store.readThumbnail(p.id)
      .then((bytes) => {
        if (!bytes || !alive) return;
        objectUrl = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/webp' }));
        setUrl(objectUrl);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [p.id, p.modifiedAt, p.hasThumbnail]);
  return url;
}

export function RenameModal({ initial, onClose, onSave, title }: { initial: string; onClose: () => void; onSave: (name: string) => void; title: string }) {
  const [name, setName] = useState(initial);
  const valid = name.trim().length > 0 && name.trim().length <= 80;
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            disabled={!valid}
            onClick={() => {
              onSave(name.trim());
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div class="field">
        <label for="rename-input">Name</label>
        <input
          id="rename-input"
          class="input"
          value={name}
          maxLength={80}
          onInput={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) {
              onSave(name.trim());
              onClose();
            }
          }}
        />
      </div>
    </Modal>
  );
}

export function ProjectCard({ project: p }: { project: ProjectSummary }) {
  const thumb = useThumbnail(p);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const blocked = p.error !== null || p.compatibility.status === 'unsupported';

  const items: MenuItem[] = [
    { label: 'Rename', icon: 'pencil', onSelect: () => setRenaming(true), disabled: blocked },
    { label: 'Duplicate', icon: 'copy', onSelect: () => void duplicateProject(p), disabled: blocked },
    { label: 'Export (.mfpack)', icon: 'upload', onSelect: () => void exportProject(p), disabled: p.error !== null },
    { label: p.archived ? 'Unarchive' : 'Archive', icon: 'archive', onSelect: () => void setArchived(p, !p.archived), disabled: blocked },
    { separator: true, label: 'sep' },
    { label: 'Delete…', icon: 'trash', danger: true, onSelect: () => void deleteProject(p) },
  ];

  return (
    <article class="card project-card" aria-label={p.name}>
      <button
        type="button"
        class="project-thumb"
        style={{ border: 0, padding: 0, cursor: blocked ? 'default' : 'pointer' }}
        onClick={() => !blocked && void openProject(p.id)}
        aria-label={`Open ${p.name}`}
        tabIndex={-1}
      >
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon name="cube" size={40} />}
      </button>
      <div class="project-info">
        <h3 title={p.name}>{p.name}</h3>
        {p.description && <div class="muted" style={{ fontSize: '0.88em' }}>{p.description}</div>}
        <div class="project-meta">
          <span>{PROJECT_TYPE_LABELS[p.type]}</span>
          <span>Last opened: {formatRelativeDate(p.modifiedAt)}</span>
          <span>{formatBytes(p.sizeBytes)}</span>
        </div>
        <div class="project-meta">
          <span>Platform: {p.targets.map((t) => PLATFORM_LABELS[t]).join(' + ') || '—'}</span>
          <span>Engine {p.engineVersion}</span>
        </div>
        <div class="row wrap" style={{ gap: '4px', marginTop: '2px' }}>
          {p.archived && <Badge icon="archive">Archived</Badge>}
          {p.error && (
            <Badge kind="danger" icon="alert">
              Damaged
            </Badge>
          )}
          {p.compatibility.status === 'needs-upgrade' && (
            <Badge kind="warning" icon="alert">
              Older format
            </Badge>
          )}
          {p.compatibility.status === 'unsupported' && (
            <Badge kind="danger" icon="alert">
              Needs newer app
            </Badge>
          )}
        </div>
      </div>
      <div class="project-actions">
        <button type="button" class="btn btn-primary btn-sm" disabled={p.compatibility.status === 'unsupported'} onClick={() => void openProject(p.id)}>
          Open
        </button>
        <span class="spacer" />
        <IconButton
          icon="more"
          label={`More actions for ${p.name}`}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 4 });
          }}
        />
      </div>
      {menu && <Menu label="Project actions" items={items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
      {renaming && <RenameModal title="Rename project" initial={p.name} onClose={() => setRenaming(false)} onSave={(n) => void renameProject(p, n)} />}
    </article>
  );
}
