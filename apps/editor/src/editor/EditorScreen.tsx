import '../styles/editor.css';
import { PRIMITIVE_LABELS, PRIMITIVE_TYPES, describeError } from '@mythic-forge/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { choose, compactLayout, navigate, refreshProjects, settings, svc, updateSettings } from '../app/state.ts';
import { exportProject } from '../app/project-actions.ts';
import { IconButton, Menu, Sheet, Tabs, type MenuItem } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';
import { AssetsPanel } from './AssetsPanel.tsx';
import { BuildDialog } from './BuildDialog.tsx';
import { ConsolePanel } from './ConsolePanel.tsx';
import { HierarchyPanel } from './HierarchyPanel.tsx';
import { ImportDialog } from './ImportDialog.tsx';
import { InspectorPanel } from './InspectorPanel.tsx';
import { PerfOverlay, PlayHud } from './PlayHud.tsx';
import { ProjectSettings } from './ProjectSettings.tsx';
import { EditorSession } from './session.ts';

type Dialog = 'import' | 'build' | 'project' | null;
type BottomTab = 'assets' | 'console';
type SheetName = 'hierarchy' | 'inspector' | 'assets' | 'console' | null;

function addMenuItems(session: EditorSession, openImport: () => void): MenuItem[] {
  return [
    { heading: true, label: '3D objects' },
    ...PRIMITIVE_TYPES.map((p) => ({ label: PRIMITIVE_LABELS[p], icon: p === 'sphere' ? ('sphere' as const) : ('cube' as const), onSelect: () => session.addPrimitive(p) })),
    { separator: true, label: 's1' },
    { heading: true, label: 'Lights' },
    { label: 'Sun (directional)', icon: 'light', onSelect: () => session.addLight('directional') },
    { label: 'Point light', icon: 'light', onSelect: () => session.addLight('point') },
    { label: 'Spot light', icon: 'light', onSelect: () => session.addLight('spot') },
    { label: 'Sky light', icon: 'light', onSelect: () => session.addLight('hemisphere') },
    { separator: true, label: 's2' },
    { label: 'Camera', icon: 'camera', onSelect: () => session.addCamera() },
    { label: 'Empty object', icon: 'empty', onSelect: () => session.addEmpty() },
    { separator: true, label: 's3' },
    { label: 'Import model or file…', icon: 'upload', onSelect: openImport },
    { label: 'From asset library…', icon: 'library', onSelect: () => navigate({ name: 'library', tab: 'official', projectId: session.projectId }) },
  ];
}

export function EditorScreen({ projectId, recovered }: { projectId: string; recovered: boolean }) {
  const [session, setSession] = useState<EditorSession | null>(null);
  const [error, setError] = useState<{ message: string; detail: string } | null>(null);

  useEffect(() => {
    let alive = true;
    let opened: EditorSession | null = null;
    EditorSession.open(projectId, recovered)
      .then((s) => {
        if (!alive) {
          void s.close();
          return;
        }
        opened = s;
        setSession(s);
      })
      .catch((e: unknown) => {
        const d = describeError(e, 'The project could not be opened.');
        setError({ message: d.message, detail: d.detail });
      });
    return () => {
      alive = false;
      if (opened) void opened.close().then(() => refreshProjects());
    };
  }, [projectId]);

  if (error) {
    return (
      <div class="page">
        <h1>Could not open project</h1>
        <p>{error.message}</p>
        <p>
          <button type="button" class="btn btn-primary" onClick={() => navigate({ name: 'projects' })}>
            Back to projects
          </button>
        </p>
        <details>
          <summary>Details</summary>
          <pre class="mono" style={{ whiteSpace: 'pre-wrap' }}>{error.detail}</pre>
        </details>
      </div>
    );
  }
  if (!session) {
    return (
      <div class="empty-state" role="status" style={{ paddingTop: '30vh' }}>
        Opening project…
      </div>
    );
  }
  return <EditorLayout session={session} />;
}

function EditorLayout({ session }: { session: EditorSession }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const compact = compactLayout.value;
  const viewportHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = viewportHost.current;
    if (!host) return;
    if (!session.viewport) session.attach(host);
    else session.viewport.setContainer(host);
  }, [compact]);

  // Keyboard shortcuts (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        void session.save();
        return;
      }
      if (mod && key === 'p') {
        e.preventDefault();
        session.togglePlay();
        return;
      }
      if (e.key === 'Escape' && session.playState.value !== 'edit' && !document.querySelector('.modal')) {
        session.stop();
        return;
      }
      if (typing || document.querySelector('.modal, .menu')) return;
      if (session.playState.value !== 'edit') return;
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) session.redo();
        else session.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        session.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        session.duplicateSelected();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && session.selection.value) {
        e.preventDefault();
        session.deleteSelected();
      } else if (!mod && key === 'f') {
        session.focusSelected();
      } else if (!mod && key === 'w') {
        session.setGizmoMode('translate');
      } else if (!mod && key === 'e') {
        session.setGizmoMode('rotate');
      } else if (!mod && key === 'r') {
        session.setGizmoMode('scale');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);

  // Android back button / browser back: leave play mode first.
  useEffect(
    () =>
      svc().platform.onBack(() => {
        if (session.playState.value !== 'edit') {
          session.stop();
          return true;
        }
        return false;
      }),
    [session],
  );

  // Warn before closing the tab with unsaved changes (a recovery snapshot is written too).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (session.dirty.value) {
        void session.writeRecovery();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [session]);

  const close = async (): Promise<void> => {
    if (session.dirty.value) {
      const choice = await choose({
        title: 'Save changes?',
        body: `"${session.manifest.value.name}" has unsaved changes.`,
        choices: [
          { id: 'cancel', label: 'Cancel' },
          { id: 'discard', label: "Don't save", kind: 'danger' },
          { id: 'save', label: 'Save', kind: 'primary' },
        ],
      });
      if (choice === null || choice === 'cancel') return;
      if (choice === 'save' && !(await session.save({ silent: true }))) return;
      if (choice === 'discard') {
        session.savedRevision.value = session.revision.value;
        await svc().recovery.clear(session.projectId);
      }
    }
    navigate({ name: 'projects' });
  };

  const viewport = (
    <div class="viewport-wrap">
      <div class="viewport-host" ref={viewportHost} />
      <ViewportOverlays session={session} compact={compact} />
    </div>
  );

  const dialogs = (
    <>
      {dialog === 'import' && <ImportDialog session={session} onClose={() => setDialog(null)} />}
      {dialog === 'build' && <BuildDialog session={session} onClose={() => setDialog(null)} />}
      {dialog === 'project' && <ProjectSettings session={session} onClose={() => setDialog(null)} />}
    </>
  );

  return compact ? (
    <CompactEditor session={session} viewport={viewport} onClose={() => void close()} openDialog={setDialog}>
      {dialogs}
    </CompactEditor>
  ) : (
    <DesktopEditor session={session} viewport={viewport} onClose={() => void close()} openDialog={setDialog}>
      {dialogs}
    </DesktopEditor>
  );
}

function ViewportOverlays({ session, compact }: { session: EditorSession; compact: boolean }) {
  const hud = session.hud.value;
  const play = session.playState.value;
  const m = session.manifest.value;
  return (
    <>
      <div class="viewport-overlay">
        {play === 'edit' && <span class="viewport-chip">{m.editorMode === '2d' ? '2D view' : 'Scene'}</span>}
        {play !== 'edit' && <span class="viewport-chip" style={{ borderColor: 'var(--success)' }}>{play === 'playing' ? '● Playing' : '❚❚ Paused'}</span>}
        {session.contextLost.value && <span class="viewport-chip">Graphics paused…</span>}
      </div>
      {settings.value.performance.showOverlay && <PerfOverlay stats={session.stats.value} notice={session.qualityNotice.value} />}
      {hud && <PlayHud hud={hud} input={session.input} paused={play === 'paused'} />}
      {compact && play === 'edit' && session.selection.value && (
        <div class="gizmo-float" role="toolbar" aria-label="Transform tool">
          <IconButton icon="move" label="Move" pressed={session.gizmoMode.value === 'translate'} onClick={() => session.setGizmoMode('translate')} />
          <IconButton icon="rotate" label="Rotate" pressed={session.gizmoMode.value === 'rotate'} onClick={() => session.setGizmoMode('rotate')} />
          <IconButton icon="scale" label="Scale" pressed={session.gizmoMode.value === 'scale'} onClick={() => session.setGizmoMode('scale')} />
          <IconButton icon="focus" label="Focus" onClick={() => session.focusSelected()} />
        </div>
      )}
    </>
  );
}

function PlayButtons({ session }: { session: EditorSession }) {
  const play = session.playState.value;
  return (
    <div class="play-controls" role="group" aria-label="Play controls">
      <IconButton
        icon="play"
        label={play === 'paused' ? 'Resume' : 'Play'}
        class={`play-btn ${play === 'playing' ? 'playing' : ''}`}
        pressed={play === 'playing'}
        onClick={() => session.play()}
      />
      <IconButton icon="pause" label="Pause" disabled={play !== 'playing'} onClick={() => session.pause()} />
      <IconButton icon="stop" label="Stop (Esc)" disabled={play === 'edit'} onClick={() => session.stop()} />
    </div>
  );
}

function SaveState({ session }: { session: EditorSession }) {
  const dirty = session.dirty.value;
  return (
    <span class={`save-state ${dirty ? 'dirty' : ''}`} role="status">
      {session.saving.value ? 'Saving…' : dirty ? '● Unsaved changes' : 'All changes saved'}
    </span>
  );
}

interface LayoutProps {
  session: EditorSession;
  viewport: preact.ComponentChildren;
  onClose: () => void;
  openDialog: (d: Dialog) => void;
  children: preact.ComponentChildren;
}

function DesktopEditor({ session, viewport, onClose, openDialog, children }: LayoutProps) {
  const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const [bottom, setBottom] = useState<BottomTab>('assets');
  const [bottomOpen, setBottomOpen] = useState(true);
  const hist = session.historyState.value;
  const editing = session.playState.value === 'edit';
  const sel = session.selection.value;
  const s = settings.value;

  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: 'Save', icon: 'save', shortcut: 'Ctrl+S', onSelect: () => void session.save() },
      { label: 'Export project (.mfpack)', icon: 'upload', onSelect: () => void session.save({ silent: true }).then(() => exportProject(session.manifest.value)) },
      { label: 'Build & Export…', icon: 'hammer', onSelect: () => openDialog('build') },
      { separator: true, label: 's' },
      { label: 'Project settings…', icon: 'settings', onSelect: () => openDialog('project') },
      { label: 'Close project', icon: 'x', onSelect: onClose },
    ],
    Edit: [
      { label: hist.undoLabel ? `Undo ${hist.undoLabel}` : 'Undo', icon: 'undo', shortcut: 'Ctrl+Z', disabled: !hist.canUndo || !editing, onSelect: () => session.undo() },
      { label: hist.redoLabel ? `Redo ${hist.redoLabel}` : 'Redo', icon: 'redo', shortcut: 'Ctrl+Shift+Z', disabled: !hist.canRedo || !editing, onSelect: () => session.redo() },
      { separator: true, label: 's' },
      { label: 'Duplicate', icon: 'copy', shortcut: 'Ctrl+D', disabled: !sel || !editing, onSelect: () => session.duplicateSelected() },
      { label: 'Delete', icon: 'trash', shortcut: 'Del', disabled: !sel || !editing, onSelect: () => session.deleteSelected() },
      { label: 'Deselect', icon: 'x', disabled: !sel, onSelect: () => session.select(null) },
    ],
    View: [
      { label: 'Focus selection', icon: 'focus', shortcut: 'F', onSelect: () => session.focusSelected() },
      { label: s.editor.showGrid ? 'Hide grid' : 'Show grid', icon: 'grid', onSelect: () => void updateSettings((d) => (d.editor.showGrid = !d.editor.showGrid)) },
      {
        label: s.performance.showOverlay ? 'Hide performance overlay' : 'Show performance overlay',
        icon: 'gauge',
        onSelect: () => void updateSettings((d) => (d.performance.showOverlay = !d.performance.showOverlay)),
      },
      { label: bottomOpen ? 'Hide bottom panel' : 'Show bottom panel', icon: 'layers', onSelect: () => setBottomOpen(!bottomOpen) },
    ],
    Add: addMenuItems(session, () => openDialog('import')).map((i) => ({ ...i, disabled: i.disabled || (!editing && !i.heading && !i.separator) })),
    Project: [
      { label: 'Import asset…', icon: 'upload', disabled: !editing, onSelect: () => openDialog('import') },
      { label: 'Asset library', icon: 'library', onSelect: () => navigate({ name: 'library', tab: 'official', projectId: session.projectId }) },
      { label: 'Project settings & backups…', icon: 'settings', onSelect: () => openDialog('project') },
    ],
    Build: [{ label: 'Build & Export…', icon: 'hammer', onSelect: () => openDialog('build') }],
    Help: [
      { label: 'Documentation', icon: 'book', onSelect: () => navigate({ name: 'docs' }) },
      { label: 'Keyboard shortcuts', icon: 'keyboard', onSelect: () => navigate({ name: 'docs', page: 'keyboard-shortcuts' }) },
      { label: 'About Mythic Forge', icon: 'info', onSelect: () => navigate({ name: 'settings', section: 'about' }) },
    ],
  };

  return (
    <div class="editor">
      <nav class="menubar" aria-label="Editor menu">
        <IconButton icon="arrow-left" label="Close project" size={16} onClick={onClose} />
        {Object.keys(menus).map((name) => (
          <button
            key={name}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu?.name === name}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({ name, x: r.left, y: r.bottom });
            }}
          >
            {name}
          </button>
        ))}
        <span class="project-title" title={session.manifest.value.name}>
          {session.manifest.value.name}
        </span>
        <span class="spacer" style={{ flex: 1 }} />
        <SaveState session={session} />
      </nav>
      <div class="toolbar" role="toolbar" aria-label="Editor tools">
        <button
          type="button"
          class="btn btn-sm"
          disabled={!editing}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({ name: 'Add', x: r.left, y: r.bottom + 4 });
          }}
        >
          <Icon name="plus" size={16} /> Add
        </button>
        <span class="sep" />
        <IconButton icon="move" label="Move (W)" pressed={session.gizmoMode.value === 'translate'} onClick={() => session.setGizmoMode('translate')} />
        <IconButton icon="rotate" label="Rotate (E)" pressed={session.gizmoMode.value === 'rotate'} onClick={() => session.setGizmoMode('rotate')} />
        <IconButton icon="scale" label="Scale (R)" pressed={session.gizmoMode.value === 'scale'} onClick={() => session.setGizmoMode('scale')} />
        <IconButton icon="focus" label="Focus (F)" onClick={() => session.focusSelected()} />
        <span class="sep" />
        <IconButton icon="undo" label={hist.undoLabel ? `Undo ${hist.undoLabel} (Ctrl+Z)` : 'Undo'} disabled={!hist.canUndo || !editing} onClick={() => session.undo()} />
        <IconButton icon="redo" label={hist.redoLabel ? `Redo ${hist.redoLabel}` : 'Redo'} disabled={!hist.canRedo || !editing} onClick={() => session.redo()} />
        <PlayButtons session={session} />
        <IconButton icon="upload" label="Import asset" disabled={!editing} onClick={() => openDialog('import')} />
        <IconButton icon="hammer" label="Build & Export" onClick={() => openDialog('build')} />
        <button type="button" class="btn btn-sm btn-primary" disabled={session.saving.value} onClick={() => void session.save()}>
          <Icon name="save" size={16} /> Save
        </button>
      </div>
      <div class="workspace">
        <aside class="panel left" aria-label="Hierarchy">
          <div class="panel-header">
            Scene
            <span class="spacer" />
            <IconButton icon="focus" label="Frame selection (F)" size={15} onClick={() => session.focusSelected()} />
          </div>
          <HierarchyPanel session={session} />
        </aside>
        {viewport}
        <aside class="panel right" aria-label="Inspector">
          <div class="panel-header">Inspector</div>
          <div class="panel-body">
            <InspectorPanel session={session} />
          </div>
        </aside>
      </div>
      <section class={`bottom-panel ${bottomOpen ? '' : 'collapsed'}`} aria-label="Assets and console">
        <div class="row" style={{ paddingRight: '8px' }}>
          <div style={{ flex: 1 }}>
            <Tabs
              label="Bottom panel"
              value={bottom}
              onChange={(t) => {
                setBottom(t);
                setBottomOpen(true);
              }}
              tabs={[
                { id: 'assets', label: `Assets (${session.assets.value.length})` },
                { id: 'console', label: 'Console' },
              ]}
            />
          </div>
          <IconButton icon={bottomOpen ? 'chevron-down' : 'chevron-right'} label={bottomOpen ? 'Collapse panel' : 'Expand panel'} size={16} onClick={() => setBottomOpen(!bottomOpen)} />
        </div>
        {bottomOpen && (
          <div class="bottom-panel-body">{bottom === 'assets' ? <AssetsPanel session={session} onImport={() => openDialog('import')} /> : <ConsolePanel />}</div>
        )}
      </section>
      {menu && menus[menu.name] && <Menu label={`${menu.name} menu`} items={menus[menu.name]!} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
      {children}
    </div>
  );
}

function CompactEditor({ session, viewport, onClose, openDialog, children }: LayoutProps) {
  const [sheet, setSheet] = useState<SheetName>(null);
  const [menu, setMenu] = useState<{ name: 'add' | 'more'; x: number; y: number } | null>(null);
  const hist = session.historyState.value;
  const play = session.playState.value;
  const editing = play === 'edit';
  const selected = session.selection.value ? session.scene.get(session.selection.value) : undefined;
  void session.revision.value;

  const more: MenuItem[] = [
    { label: 'Project settings & backups', icon: 'settings', onSelect: () => openDialog('project') },
    { label: 'Build & Export', icon: 'hammer', onSelect: () => openDialog('build') },
    { label: 'Export project (.mfpack)', icon: 'upload', onSelect: () => void session.save({ silent: true }).then(() => exportProject(session.manifest.value)) },
    { label: 'Asset library', icon: 'library', onSelect: () => navigate({ name: 'library', tab: 'official', projectId: session.projectId }) },
    { label: 'Console', icon: 'terminal', onSelect: () => setSheet('console') },
    {
      label: settings.value.performance.showOverlay ? 'Hide performance overlay' : 'Show performance overlay',
      icon: 'gauge',
      onSelect: () => void updateSettings((d) => (d.performance.showOverlay = !d.performance.showOverlay)),
    },
    { label: 'Help', icon: 'book', onSelect: () => navigate({ name: 'docs', page: 'editor-basics' }) },
    { separator: true, label: 's' },
    { label: 'Close project', icon: 'x', onSelect: onClose },
  ];

  return (
    <div class="editor compact">
      <header class="topbar">
        <IconButton icon="arrow-left" label="Close project" onClick={onClose} />
        <div class="title">
          {session.manifest.value.name}
          {session.dirty.value && <span style={{ color: 'var(--warning)' }} aria-label="Unsaved changes"> ●</span>}
        </div>
        <IconButton icon="save" label="Save" disabled={session.saving.value || !editing} onClick={() => void session.save()} />
        {play === 'edit' ? (
          <IconButton icon="play" label="Play" onClick={() => session.play()} />
        ) : (
          <>
            <IconButton icon={play === 'playing' ? 'pause' : 'play'} label={play === 'playing' ? 'Pause' : 'Resume'} onClick={() => (play === 'playing' ? session.pause() : session.play())} />
            <IconButton icon="stop" label="Stop" onClick={() => session.stop()} />
          </>
        )}
        <IconButton
          icon="more"
          label="More"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({ name: 'more', x: r.right - 220, y: r.bottom });
          }}
        />
      </header>
      {viewport}
      {editing && (
        <nav class="bottombar" aria-label="Editor tools">
          <button
            type="button"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({ name: 'add', x: r.left, y: r.top - 420 });
            }}
          >
            <Icon name="plus" size={22} />
            Add
          </button>
          <button type="button" aria-pressed={sheet === 'hierarchy'} onClick={() => setSheet('hierarchy')}>
            <Icon name="layers" size={22} />
            Objects
          </button>
          <button type="button" aria-pressed={sheet === 'inspector'} onClick={() => setSheet('inspector')}>
            <Icon name="sliders" size={22} />
            {selected ? 'Inspect' : 'Scene'}
          </button>
          <button type="button" aria-pressed={sheet === 'assets'} onClick={() => setSheet('assets')}>
            <Icon name="package" size={22} />
            Assets
          </button>
          <button type="button" disabled={!hist.canUndo} onClick={() => session.undo()}>
            <Icon name="undo" size={22} />
            Undo
          </button>
          <button type="button" disabled={!hist.canRedo} onClick={() => session.redo()}>
            <Icon name="redo" size={22} />
            Redo
          </button>
        </nav>
      )}
      {sheet === 'hierarchy' && (
        <Sheet title="Objects" onClose={() => setSheet(null)}>
          <HierarchyPanel session={session} onPicked={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === 'inspector' && (
        <Sheet
          title={selected ? selected.name : 'Scene settings'}
          onClose={() => setSheet(null)}
          actions={
            selected && (
              <>
                <IconButton icon="copy" label="Duplicate" onClick={() => session.duplicateSelected()} />
                <IconButton
                  icon="trash"
                  label="Delete"
                  onClick={() => {
                    session.deleteSelected();
                    setSheet(null);
                  }}
                />
              </>
            )
          }
        >
          <InspectorPanel session={session} />
        </Sheet>
      )}
      {sheet === 'assets' && (
        <Sheet title="Project assets" onClose={() => setSheet(null)}>
          <AssetsPanel
            session={session}
            onImport={() => {
              setSheet(null);
              openDialog('import');
            }}
          />
        </Sheet>
      )}
      {sheet === 'console' && (
        <Sheet title="Console" onClose={() => setSheet(null)}>
          <ConsolePanel />
        </Sheet>
      )}
      {menu && (
        <Menu
          label={menu.name === 'add' ? 'Add object' : 'More'}
          items={menu.name === 'add' ? addMenuItems(session, () => openDialog('import')) : more}
          x={Math.max(8, menu.x)}
          y={Math.max(8, menu.y)}
          onClose={() => setMenu(null)}
        />
      )}
      {children}
    </div>
  );
}
