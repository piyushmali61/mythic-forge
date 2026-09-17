import preact from '@preact/preset-vite';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { workspaceAliases } from '../../workspace-aliases.ts';

/** Content-Security-Policy for production builds (dev needs inline HMR scripts). */
function contentSecurityPolicy(repositoryUrl: string): Plugin {
  let repoOrigin = '';
  try {
    repoOrigin = repositoryUrl ? new URL(repositoryUrl).origin : '';
  } catch {
    repoOrigin = '';
  }
  // The Android shell serves the app from https://localhost, which 'self' already covers.
  // Preact applies `style` props through the CSSOM, which style-src does not restrict.
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    `connect-src 'self' data: blob:${repoOrigin ? ` ${repoOrigin}` : ''}`,
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'mf-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

const DOWNLOADS_DIR = fileURLToPath(new URL('../../downloads/', import.meta.url));

interface DownloadFile {
  file: string;
  bytes: number;
  platform: 'android' | 'windows';
}

function listDownloads(): DownloadFile[] {
  if (!existsSync(DOWNLOADS_DIR)) return [];
  const out: DownloadFile[] = [];
  for (const file of readdirSync(DOWNLOADS_DIR).sort()) {
    const platform = file.endsWith('.apk') ? 'android' : /windows/i.test(file) && file.endsWith('.zip') ? 'windows' : null;
    if (platform) out.push({ file, bytes: statSync(join(DOWNLOADS_DIR, file)).size, platform });
  }
  return out;
}

/**
 * Standalone app downloads (repository `downloads/`). Only the web build offers them: the
 * Android and desktop shells are built with `--mode app`, so the binaries never end up inside
 * the apps themselves (which would make every release contain the previous one).
 */
function standaloneDownloads(mode: string): Plugin {
  const files = mode === 'app' ? [] : listDownloads();
  let outDir = 'dist';
  return {
    name: 'mf-downloads',
    config: () => ({ define: { __MF_DOWNLOADS__: JSON.stringify(files) } }),
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use('/downloads/', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0]!.replace(/^\//, ''));
        const entry = files.find((f) => f.file === name);
        if (!entry) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(entry.bytes));
        res.end(readFileSync(join(DOWNLOADS_DIR, entry.file)));
      });
    },
    writeBundle() {
      if (!files.length) return;
      mkdirSync(join(outDir, 'downloads'), { recursive: true });
      for (const f of files) copyFileSync(join(DOWNLOADS_DIR, f.file), join(outDir, 'downloads', f.file));
    },
  };
}

/** Writes the offline precache list used by public/sw.js (PWA builds). */
function precacheManifest(): Plugin {
  let outDir = 'dist';
  return {
    name: 'mf-precache',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).replace(/\\/g, '/'));
        }
      };
      walk(outDir);
      // Optional asset packs, the exported-game player and app downloads are fetched on demand, not precached.
      const precache = files.filter(
        (f) => !f.startsWith('asset-packs/') && !f.startsWith('downloads/') && f !== 'precache-manifest.json' && f !== 'sw.js',
      );
      const version = String(Date.now());
      writeFileSync(join(outDir, 'precache-manifest.json'), JSON.stringify({ version, files: ['./', ...precache] }));
      // Stamping the build id into sw.js makes browsers notice the new version.
      const swPath = join(outDir, 'sw.js');
      writeFileSync(swPath, readFileSync(swPath, 'utf8').replace('__MF_BUILD__', version));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // Relative base so the same build works from a web server sub-path, Capacitor and Tauri.
    base: './',
    plugins: [
      preact(),
      contentSecurityPolicy(env.VITE_ASSET_REPOSITORY_URL ?? ''),
      standaloneDownloads(mode),
      precacheManifest(),
    ],
    resolve: { alias: workspaceAliases },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      target: 'es2022',
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      reportCompressedSize: true,
    },
  };
});
