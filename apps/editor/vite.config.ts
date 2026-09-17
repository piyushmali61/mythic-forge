import preact from '@preact/preset-vite';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: content: https:",
    "media-src 'self' data: blob: content:",
    `connect-src 'self' data: blob: https://localhost capacitor: http://localhost${repoOrigin ? ` ${repoOrigin}` : ''}`,
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
      // Optional asset packs and the exported-game player are fetched on demand, not precached.
      const precache = files.filter((f) => !f.startsWith('asset-packs/') && f !== 'precache-manifest.json' && f !== 'sw.js');
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
    plugins: [preact(), contentSecurityPolicy(env.VITE_ASSET_REPOSITORY_URL ?? ''), precacheManifest()],
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
