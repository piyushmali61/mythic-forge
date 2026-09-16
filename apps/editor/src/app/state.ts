import { signal } from '@preact/signals';
import {
  DEFAULT_SETTINGS,
  createId,
  describeError,
  log,
  normalizeSettings,
  type AppSettings,
  type PowerState,
  type ProjectSummary,
} from '@mythic-forge/core';
import type { Services } from './services.ts';

// ---- routing -------------------------------------------------------------------------------------

export type LibraryTab = 'official' | 'free-open' | 'downloads';

export type Route =
  | { name: 'home' }
  | { name: 'projects' }
  | { name: 'new-project'; templateId?: string }
  | { name: 'library'; tab?: LibraryTab; assetId?: string; projectId?: string }
  | { name: 'templates' }
  | { name: 'settings'; section?: string }
  | { name: 'docs'; page?: string }
  | { name: 'editor'; projectId: string; recovered?: boolean };

export const route = signal<Route>({ name: 'home' });

export function navigate(next: Route, replace = false): void {
  route.value = next;
  try {
    if (replace) history.replaceState(next, '');
    else history.pushState(next, '');
  } catch {
    // History may be unavailable in some embedded contexts; in-memory routing still works.
  }
  document.querySelector('.main')?.scrollTo?.(0, 0);
}

export function initHistory(): void {
  history.replaceState(route.value, '');
  window.addEventListener('popstate', (e) => {
    const state = e.state as Route | null;
    if (state && typeof state === 'object' && 'name' in state) route.value = state;
  });
}

// ---- services & global state ------------------------------------------------------------------

export const services = signal<Services | null>(null);

export function svc(): Services {
  const s = services.value;
  if (!s) throw new Error('Services are not ready');
  return s;
}

export const settings = signal<AppSettings>(structuredClone(DEFAULT_SETTINGS));
export const projects = signal<ProjectSummary[]>([]);
export const projectsLoaded = signal(false);
export const online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
export const power = signal<PowerState>({ batteryLevel: null, charging: null, lowPowerMode: null, thermal: 'unknown' });
export const compactLayout = signal(false);

const SETTINGS_KEY = 'settings';

export async function loadSettings(): Promise<void> {
  const stored = await svc().platform.kv.get<unknown>(SETTINGS_KEY);
  settings.value = normalizeSettings(stored);
  applyAccessibility();
}

export async function updateSettings(mutate: (draft: AppSettings) => void): Promise<void> {
  const draft = structuredClone(settings.value);
  mutate(draft);
  settings.value = normalizeSettings(draft);
  applyAccessibility();
  try {
    await svc().platform.kv.set(SETTINGS_KEY, settings.value);
  } catch (error) {
    reportError(error, 'Settings could not be saved.');
  }
}

/** Reflects theme/accessibility settings onto the document root. */
export function applyAccessibility(): void {
  const s = settings.value;
  const root = document.documentElement;
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = s.general.theme === 'system' ? (prefersDark ? 'dark' : 'light') : s.general.theme;
  root.dataset.theme = theme;
  root.dataset.contrast = s.accessibility.highContrast ? 'high' : 'normal';
  const reduce =
    s.accessibility.reducedMotion === 'on' ||
    (s.accessibility.reducedMotion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    s.battery.mode === 'max-saving';
  root.dataset.motion = reduce ? 'reduced' : 'full';
  root.style.setProperty('--ui-scale', String(s.accessibility.uiScale));
  root.style.setProperty('--text-scale', s.accessibility.largeText ? '1.15' : '1');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f2ec' : '#121110');
}

export async function refreshProjects(): Promise<void> {
  try {
    projects.value = await svc().store.list();
  } catch (error) {
    reportError(error, 'Your projects could not be listed.');
  } finally {
    projectsLoaded.value = true;
  }
}

// ---- toasts --------------------------------------------------------------------------------------

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  detail?: string;
  actions?: ToastAction[];
}

export const toasts = signal<Toast[]>([]);

export function toast(message: string, kind: ToastKind = 'info', options: { detail?: string; actions?: ToastAction[]; timeoutMs?: number } = {}): string {
  const id = createId('t');
  const entry: Toast = { id, kind, message };
  if (options.detail) entry.detail = options.detail;
  if (options.actions) entry.actions = options.actions;
  toasts.value = [...toasts.value.slice(-3), entry];
  const timeout = options.timeoutMs ?? (kind === 'error' ? 0 : 5000);
  if (timeout > 0) setTimeout(() => dismissToast(id), timeout);
  return id;
}

export function dismissToast(id: string): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

/**
 * Friendly error for users; technical detail is logged and shown only on request
 * (or immediately in developer mode).
 */
export function reportError(error: unknown, fallback = 'Something went wrong.', retry?: () => void): void {
  const described = describeError(error, fallback);
  log.error('App', described.message, described.detail);
  const actions: ToastAction[] = [];
  if (retry) actions.push({ label: 'Retry', run: retry });
  actions.push({
    label: 'View details',
    run: () => {
      void openDialog({
        title: 'Error details',
        body: described.detail,
        mono: true,
        confirmLabel: 'Copy details',
        cancelLabel: 'Close',
      }).then((copy) => {
        if (copy) void navigator.clipboard?.writeText(`${described.message}\n\n${described.detail}`).catch(() => undefined);
      });
    },
  });
  const options: { detail?: string; actions: ToastAction[] } = { actions };
  if (settings.value.developer.devMode) options.detail = described.detail.split('\n')[0];
  toast(described.message, 'error', options);
}

// ---- dialogs -------------------------------------------------------------------------------------

export interface DialogSpec {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  mono?: boolean;
  /** Require the user to type this text before confirming (for destructive actions). */
  requireText?: string;
}

export interface DialogChoice {
  id: string;
  label: string;
  kind?: 'primary' | 'danger' | 'default';
  /** Disabled until the user types `requireText`. */
  guarded?: boolean;
}

export interface ChoiceDialog {
  title: string;
  body: string;
  mono?: boolean;
  requireText?: string;
  choices: DialogChoice[];
}

export const dialog = signal<(ChoiceDialog & { resolve: (id: string | null) => void }) | null>(null);

/** Shows a dialog with several choices. Resolves to the chosen id, or null when dismissed. */
export function choose(spec: ChoiceDialog): Promise<string | null> {
  return new Promise((resolve) => {
    dialog.value?.resolve(null);
    dialog.value = { ...spec, resolve };
  });
}

export async function openDialog(spec: DialogSpec): Promise<boolean> {
  const choice: ChoiceDialog = {
    title: spec.title,
    body: spec.body,
    choices: [
      { id: 'cancel', label: spec.cancelLabel ?? 'Cancel' },
      { id: 'ok', label: spec.confirmLabel ?? 'OK', kind: spec.danger ? 'danger' : 'primary', guarded: !!spec.requireText },
    ],
  };
  if (spec.mono) choice.mono = true;
  if (spec.requireText) choice.requireText = spec.requireText;
  return (await choose(choice)) === 'ok';
}

/** Confirmation for destructive actions. Respects the "confirm destructive actions" setting. */
export async function confirmAction(spec: DialogSpec): Promise<boolean> {
  if (!settings.value.general.confirmDestructive && !spec.requireText) return true;
  return openDialog({ danger: true, ...spec });
}
