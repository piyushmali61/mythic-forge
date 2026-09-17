import { formatBytes } from '@mythic-forge/core';
import { detectShell } from '@mythic-forge/platform';
import { config, type AppDownload } from '../lib/config.ts';
import { Icon, type IconName } from './Icon.tsx';

const PLATFORMS: Record<AppDownload['platform'], { short: string; long: string; kind: string; icon: IconName }> = {
  android: { short: 'Mobile APK', long: 'Download Mobile', kind: 'Android APK', icon: 'smartphone' },
  windows: { short: 'PC App (Win)', long: 'Download PC', kind: 'Windows, portable', icon: 'monitor' },
};

/** Only the browser build offers the standalone apps; the apps never list themselves. */
function availableDownloads(): AppDownload[] {
  return detectShell() === 'browser' ? config.downloads : [];
}

const href = (d: AppDownload) => `./downloads/${encodeURIComponent(d.file)}`;

export function NavDownloads() {
  const files = availableDownloads();
  if (!files.length) return null;
  return (
    <div class="nav-downloads desktop-only">
      <div class="nav-downloads-title">Downloads</div>
      {files.map((d) => {
        const p = PLATFORMS[d.platform];
        return (
          <a key={d.file} class="nav-item" href={href(d)} download={d.file} title={`${p.long} (${p.kind}, ${formatBytes(d.bytes)})`}>
            <Icon name={p.icon} size={16} />
            <span>{p.short}</span>
          </a>
        );
      })}
    </div>
  );
}

export function DownloadsCard({ title, text, logo }: { title: string; text: string; logo?: boolean }) {
  const files = availableDownloads();
  if (!files.length) return null;
  return (
    <section class="card downloads-card" aria-label={title}>
      <div class="downloads-intro">
        {logo && <img src="./icons/logo.svg" alt="" width="48" height="48" />}
        <div>
          <div class="downloads-title">{title}</div>
          <div class="muted">{text}</div>
        </div>
      </div>
      <div class="row wrap">
        {files.map((d, i) => {
          const p = PLATFORMS[d.platform];
          return (
            <a key={d.file} class={`btn ${i === 0 ? 'btn-primary' : ''}`} href={href(d)} download={d.file}>
              <Icon name={p.icon} size={18} />
              <span>
                {p.long} <span class="downloads-meta">({p.kind} · {formatBytes(d.bytes)})</span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
