export { formatBytes } from '@mythic-forge/core';

export function formatRelativeDate(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'Unknown';
  const diff = now - t;
  const day = 86_400_000;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (t >= startOfToday.getTime()) {
    const mins = Math.round(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    return `Today, ${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (t >= startOfToday.getTime() - day) return 'Yesterday';
  if (diff < 7 * day) return `${Math.ceil(diff / day)} days ago`;
  return new Date(t).toLocaleDateString();
}

export function formatNumber(n: number | undefined): string {
  return typeof n === 'number' ? n.toLocaleString() : '—';
}

export function formatDuration(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return '';
  const kb = bytesPerSecond / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB/s` : `${kb.toFixed(0)} KB/s`;
}

export const PLATFORM_LABELS: Record<string, string> = {
  android: 'Android',
  windows: 'Windows',
  web: 'Web',
};
