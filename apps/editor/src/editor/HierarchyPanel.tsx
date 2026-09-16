import type { Entity } from '@mythic-forge/core';
import { useState } from 'preact/hooks';
import { confirmAction } from '../app/state.ts';
import { IconButton, Menu, Modal, type MenuItem } from '../ui/common.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import type { EditorSession } from './session.ts';

export function entityIcon(e: Readonly<Entity>): IconName {
  const c = e.components;
  if (c.camera) return 'camera';
  if (c.light) return 'light';
  if (c.model) return 'model';
  if (c.mesh) return c.mesh.primitive === 'sphere' ? 'sphere' : 'cube';
  return 'empty';
}

interface Row {
  entity: Readonly<Entity>;
  depth: number;
}

export function HierarchyPanel({ session, onPicked }: { session: EditorSession; onPicked?: () => void }) {
  void session.revision.value; // re-render on scene changes
  const scene = session.scene;
  const selected = session.selection.value;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [parentPicker, setParentPicker] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const editing = session.playState.value === 'edit';

  const rows: Row[] = [];
  const walk = (ids: readonly string[], depth: number): void => {
    for (const id of ids) {
      const e = scene.get(id);
      if (!e) continue;
      rows.push({ entity: e, depth });
      if (!collapsed.has(id)) walk(e.children, depth + 1);
    }
  };
  walk(scene.childrenOf(null), 0);

  const toggle = (id: string): void => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  const remove = async (id: string): Promise<void> => {
    const e = scene.get(id);
    if (!e) return;
    const extra = e.children.length ? ` and its ${e.children.length} child object(s)` : '';
    if (e.children.length && !(await confirmAction({ title: 'Delete object?', body: `Delete "${e.name}"${extra}? You can undo this.`, confirmLabel: 'Delete' }))) return;
    session.select(id);
    session.deleteSelected();
  };

  const menuItems = (id: string): MenuItem[] => {
    const e = scene.get(id)!;
    return [
      { label: 'Rename', icon: 'pencil', onSelect: () => setRenaming(id), disabled: !editing },
      { label: 'Duplicate', icon: 'copy', shortcut: 'Ctrl+D', onSelect: () => (session.select(id), session.duplicateSelected()), disabled: !editing },
      { label: 'Focus', icon: 'focus', shortcut: 'F', onSelect: () => (session.select(id), session.focusSelected()) },
      { separator: true, label: 's1' },
      { label: 'Parent to…', icon: 'layers', onSelect: () => setParentPicker(id), disabled: !editing },
      { label: 'Unparent', icon: 'arrow-left', onSelect: () => session.reparent(id, null), disabled: !editing || e.parent === null },
      { separator: true, label: 's2' },
      { label: e.enabled ? 'Disable' : 'Enable', icon: 'sliders', onSelect: () => session.setFlag(id, 'enabled', !e.enabled), disabled: !editing },
      { label: e.visible ? 'Hide in editor' : 'Show in editor', icon: e.visible ? 'eye-off' : 'eye', onSelect: () => session.setFlag(id, 'visible', !e.visible), disabled: !editing },
      { label: e.locked ? 'Unlock' : 'Lock', icon: e.locked ? 'unlock' : 'lock', onSelect: () => session.setFlag(id, 'locked', !e.locked), disabled: !editing },
      { separator: true, label: 's3' },
      { label: 'Delete', icon: 'trash', shortcut: 'Del', danger: true, onSelect: () => void remove(id), disabled: !editing },
    ];
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const index = rows.findIndex((r) => r.entity.id === selected);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = rows[Math.max(0, Math.min(rows.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) session.select(next.entity.id);
    } else if (e.key === 'F2' && selected) {
      setRenaming(selected);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selected) {
      const isCollapsed = collapsed.has(selected);
      if ((e.key === 'ArrowLeft') !== isCollapsed) toggle(selected);
    }
  };

  return (
    <div
      class="panel-body"
      role="tree"
      aria-label="Scene hierarchy"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        if (editing) e.preventDefault();
      }}
      onDrop={(e) => {
        const id = e.dataTransfer?.getData('text/mf-entity');
        if (id && e.target === e.currentTarget) session.reparent(id, null);
        setDropTarget(null);
      }}
    >
      {rows.length === 0 && <p class="dim" style={{ padding: '12px' }}>The scene is empty. Use Add to create objects.</p>}
      <ul class="tree">
        {rows.map(({ entity: e, depth }) => (
          <li
            key={e.id}
            role="treeitem"
            aria-selected={e.id === selected}
            aria-expanded={e.children.length ? !collapsed.has(e.id) : undefined}
            class={`tree-row ${e.enabled ? '' : 'disabled'} ${dropTarget === e.id ? 'drop-target' : ''}`}
            style={{ '--depth': depth }}
            draggable={editing}
            onDragStart={(ev) => ev.dataTransfer?.setData('text/mf-entity', e.id)}
            onDragOver={(ev) => {
              if (!editing) return;
              ev.preventDefault();
              ev.stopPropagation();
              setDropTarget(e.id);
            }}
            onDragLeave={() => setDropTarget((t) => (t === e.id ? null : t))}
            onDrop={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              const id = ev.dataTransfer?.getData('text/mf-entity');
              setDropTarget(null);
              if (id && id !== e.id) session.reparent(id, e.id);
            }}
            onClick={() => {
              session.select(e.id);
              onPicked?.();
            }}
            onDblClick={() => editing && setRenaming(e.id)}
            onContextMenu={(ev) => {
              ev.preventDefault();
              session.select(e.id);
              setMenu({ id: e.id, x: ev.clientX, y: ev.clientY });
            }}
          >
            {e.children.length ? (
              <button
                type="button"
                class="tree-toggle"
                aria-label={collapsed.has(e.id) ? 'Expand' : 'Collapse'}
                onClick={(ev) => {
                  ev.stopPropagation();
                  toggle(e.id);
                }}
              >
                <Icon name={collapsed.has(e.id) ? 'chevron-right' : 'chevron-down'} size={14} />
              </button>
            ) : (
              <span class="tree-toggle" />
            )}
            <span class="tree-icon">
              <Icon name={entityIcon(e)} size={15} />
            </span>
            {renaming === e.id ? (
              <input
                class="input small"
                autoFocus
                defaultValue={e.name}
                aria-label="Object name"
                maxLength={120}
                onClick={(ev) => ev.stopPropagation()}
                onBlur={(ev) => {
                  session.rename(e.id, ev.currentTarget.value);
                  setRenaming(null);
                }}
                onKeyDown={(ev) => {
                  ev.stopPropagation();
                  if (ev.key === 'Enter') ev.currentTarget.blur();
                  if (ev.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <span class="tree-name" title={e.name}>
                {e.name}
              </span>
            )}
            <span class="row-actions">
              <button
                type="button"
                class={e.visible ? '' : 'on'}
                aria-label={e.visible ? `Hide ${e.name}` : `Show ${e.name}`}
                title={e.visible ? 'Hide in editor' : 'Show in editor'}
                onClick={(ev) => {
                  ev.stopPropagation();
                  session.setFlag(e.id, 'visible', !e.visible);
                }}
              >
                <Icon name={e.visible ? 'eye' : 'eye-off'} size={14} />
              </button>
              <button
                type="button"
                class={e.locked ? 'on' : ''}
                aria-label={e.locked ? `Unlock ${e.name}` : `Lock ${e.name}`}
                title={e.locked ? 'Unlock' : 'Lock'}
                onClick={(ev) => {
                  ev.stopPropagation();
                  session.setFlag(e.id, 'locked', !e.locked);
                }}
              >
                <Icon name={e.locked ? 'lock' : 'unlock'} size={14} />
              </button>
              <button
                type="button"
                aria-label={`More actions for ${e.name}`}
                title="More"
                onClick={(ev) => {
                  ev.stopPropagation();
                  session.select(e.id);
                  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                  setMenu({ id: e.id, x: r.left, y: r.bottom });
                }}
              >
                <Icon name="more" size={14} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {menu && scene.has(menu.id) && <Menu label="Object actions" items={menuItems(menu.id)} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
      {parentPicker && <ParentPicker session={session} childId={parentPicker} onClose={() => setParentPicker(null)} />}
      {renaming && !rows.some((r) => r.entity.id === renaming) && (
        <RenameInline session={session} id={renaming} onClose={() => setRenaming(null)} />
      )}
    </div>
  );
}

function ParentPicker({ session, childId, onClose }: { session: EditorSession; childId: string; onClose: () => void }) {
  const scene = session.scene;
  const options = scene.ordered().filter((e) => e.id !== childId && !scene.isAncestor(childId, e.id));
  return (
    <Modal title={`Move "${scene.get(childId)?.name}" into…`} onClose={onClose}>
      <ul class="search-results">
        <li>
          <button
            type="button"
            onClick={() => {
              session.reparent(childId, null);
              onClose();
            }}
          >
            <Icon name="layers" /> Scene root
          </button>
        </li>
        {options.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => {
                session.reparent(childId, e.id);
                onClose();
              }}
            >
              <Icon name={entityIcon(e)} /> {e.name}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function RenameInline({ session, id, onClose }: { session: EditorSession; id: string; onClose: () => void }) {
  const [name, setName] = useState(session.scene.get(id)?.name ?? '');
  return (
    <Modal
      title="Rename object"
      onClose={onClose}
      footer={
        <button
          type="button"
          class="btn btn-primary"
          onClick={() => {
            session.rename(id, name);
            onClose();
          }}
        >
          Save
        </button>
      }
    >
      <input class="input" aria-label="Object name" value={name} maxLength={120} onInput={(e) => setName(e.currentTarget.value)} />
    </Modal>
  );
}

export function HierarchyHeaderActions({ session }: { session: EditorSession }) {
  return (
    <IconButton icon="focus" label="Frame selection (F)" size={16} onClick={() => session.focusSelected()} />
  );
}
