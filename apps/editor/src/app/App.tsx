import { ENGINE_VERSION, describeError, log } from '@mythic-forge/core';
import { useEffect, useState } from 'preact/hooks';
import { FirstRun } from '../screens/FirstRun.tsx';
import { Home } from '../screens/Home.tsx';
import { Projects } from '../screens/Projects.tsx';
import { SearchOverlay, searchOpen } from '../screens/SearchOverlay.tsx';
import { Templates } from '../screens/Templates.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { DialogHost, ToastHost } from '../ui/hosts.tsx';
import { lazyComponent } from '../ui/lazy.tsx';
import { config } from '../lib/config.ts';
import { checkCrashRecovery } from './project-actions.ts';
import { bootstrap } from './services.ts';
import {
  compactLayout,
  dialog,
  initHistory,
  loadSettings,
  navigate,
  online,
  refreshProjects,
  route,
  services,
  settings,
  toast,
  type Route,
} from './state.ts';

const EditorScreen = lazyComponent(() => import('../editor/EditorScreen.tsx').then((m) => m.EditorScreen), 'Opening the editor…');
const NewProject = lazyComponent(() => import('../screens/NewProject.tsx').then((m) => m.NewProject));
const Library = lazyComponent(() => import('../screens/Library.tsx').then((m) => m.Library));
const Settings = lazyComponent(() => import('../screens/Settings.tsx').then((m) => m.Settings));
const Docs = lazyComponent(() => import('../screens/Docs.tsx').then((m) => m.Docs));

const NAV: { route: Route['name']; label: string; icon: IconName; target: Route; desktopOnly?: boolean }[] = [
  { route: 'home', label: 'Home', icon: 'home', target: { name: 'home' } },
  { route: 'projects', label: 'Projects', icon: 'folder', target: { name: 'projects' } },
  { route: 'library', label: 'Assets', icon: 'library', target: { name: 'library' } },
  { route: 'templates', label: 'Templates', icon: 'template', target: { name: 'templates' }, desktopOnly: true },
  { route: 'docs', label: 'Learn', icon: 'book', target: { name: 'docs' } },
  { route: 'settings', label: 'Settings', icon: 'settings', target: { name: 'settings' } },
];

function Shell({ children }: { children: preact.ComponentChildren }) {
  const current = route.value.name === 'new-project' ? 'projects' : route.value.name;
  return (
    <div class="shell">
      <nav class="nav" aria-label="Main">
        <div class="brand">
          <img src="./icons/logo.svg" alt="" width="34" height="34" />
          <div>
            <div class="brand-name">MYTHIC FORGE</div>
            <div class="brand-by">Produced by Mythic Bharat Studios</div>
          </div>
        </div>
        {NAV.map((n) => (
          <button
            key={n.route}
            type="button"
            class={`nav-item ${n.desktopOnly ? 'desktop-only' : ''}`}
            aria-current={current === n.route ? 'page' : undefined}
            onClick={() => navigate(n.target)}
          >
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
          </button>
        ))}
        <button type="button" class="nav-item desktop-only" onClick={() => (searchOpen.value = true)}>
          <Icon name="search" size={20} />
          <span>Search</span>
          <kbd style={{ marginLeft: 'auto', fontSize: '0.75em' }}>Ctrl K</kbd>
        </button>
        <div class="nav-footer">
          <div class="offline-pill">
            <Icon name={online.value ? 'wifi' : 'wifi-off'} size={14} />
            {online.value ? 'Online' : 'Offline — everything local still works'}
          </div>
          <div>Version {ENGINE_VERSION}</div>
        </div>
      </nav>
      <main class="main" id="main">
        {children}
      </main>
    </div>
  );
}

/**
 * Offline support for the browser/PWA build. Updates install quietly and take effect the next
 * time Mythic Forge is opened; the running session is never reloaded without the user.
 */
function registerOfflineSupport(): void {
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const notify = (): void => {
        toast('A Mythic Forge update has been downloaded. It will be used the next time you open the app.', 'info', { timeoutMs: 8000 });
      };
      if (reg.waiting && navigator.serviceWorker.controller) notify();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) notify();
        });
      });
    })
    .catch((e: unknown) => log.warn('App', 'Offline support is unavailable in this browser.', String(e)));
}

function Screen() {
  const r = route.value;
  switch (r.name) {
    case 'home':
      return <Home />;
    case 'projects':
      return <Projects />;
    case 'new-project':
      return <NewProject templateId={r.templateId} />;
    case 'library':
      return <Library tab={r.tab ?? 'official'} assetId={r.assetId} projectId={r.projectId} />;
    case 'templates':
      return <Templates />;
    case 'settings':
      return <Settings section={r.section} />;
    case 'docs':
      return <Docs page={r.page} />;
    case 'editor':
      return null;
  }
}

export function App() {
  const [phase, setPhase] = useState<'booting' | 'ready' | 'failed'>('booting');
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    const started = performance.now();
    const media = matchMedia('(max-width: 900px), (pointer: coarse) and (max-width: 1100px)');
    const updateCompact = (): void => {
      compactLayout.value = media.matches;
    };
    updateCompact();
    media.addEventListener('change', updateCompact);

    (async () => {
      try {
        const s = await bootstrap(() => {
          const net = settings.value.network;
          const saveData = services.value?.platform.network.saveData === true;
          return net.allowNetwork && online.value && !(net.respectDataSaver && saveData);
        });
        services.value = s;
        await loadSettings();
        s.platform.network.subscribe((isOnline) => {
          online.value = isOnline;
        });
        online.value = s.platform.network.online;
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => void loadSettings());
        s.platform.onBack(() => {
          if (dialog.value) {
            dialog.value.resolve(null);
            dialog.value = null;
            return true;
          }
          if (searchOpen.value) {
            searchOpen.value = false;
            return true;
          }
          if (route.value.name !== 'home') {
            history.back();
            return true;
          }
          return false;
        });
        initHistory();
        await refreshProjects();
        document.getElementById('splash')?.classList.add('hidden');
        setPhase('ready');
        log.perf('Startup', `Interactive in ${Math.round(performance.now() - started)} ms`);
        (window as unknown as { __mfStartupMs?: number }).__mfStartupMs = performance.now();
        await checkCrashRecovery();
        if (s.platform.shell === 'browser' && !config.isDev && 'serviceWorker' in navigator) {
          registerOfflineSupport();
        }
      } catch (error) {
        const d = describeError(error, 'Mythic Forge could not start.');
        log.error('Startup', d.message, d.detail);
        setBootError(d.detail);
        document.getElementById('splash')?.classList.add('hidden');
        setPhase('failed');
      }
    })();

    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && route.value.name !== 'editor') {
        e.preventDefault();
        searchOpen.value = !searchOpen.value;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      media.removeEventListener('change', updateCompact);
    };
  }, []);

  if (phase === 'booting') return null;
  if (phase === 'failed') {
    return (
      <div class="page">
        <h1>Mythic Forge could not start</h1>
        <p>Your device may be low on storage, or this browser may not support the features Mythic Forge needs (WebGL 2 and IndexedDB).</p>
        <p>
          <button class="btn btn-primary" type="button" onClick={() => location.reload()}>
            Try again
          </button>
        </p>
        <details>
          <summary>Technical details</summary>
          <pre class="mono" style={{ whiteSpace: 'pre-wrap' }}>{bootError}</pre>
        </details>
      </div>
    );
  }

  const r = route.value;
  return (
    <>
      {r.name === 'editor' ? (
        <EditorScreen key={r.projectId} projectId={r.projectId} recovered={r.recovered === true} />
      ) : (
        <Shell>
          <Screen />
        </Shell>
      )}
      {!settings.value.general.firstRunComplete && r.name === 'home' && <FirstRun />}
      {searchOpen.value && <SearchOverlay />}
      <DialogHost />
      <ToastHost />
    </>
  );
}
