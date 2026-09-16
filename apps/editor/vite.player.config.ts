import { defineConfig } from 'vite';
import { workspaceAliases } from '../../workspace-aliases.ts';

/**
 * Builds the standalone game runtime that web exports embed into a single HTML file.
 * Output goes to public/player so both `vite dev` and `vite build` can serve it.
 */
export default defineConfig({
  resolve: { alias: workspaceAliases },
  publicDir: false,
  build: {
    outDir: 'public/player',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    lib: {
      entry: 'src/player/player-main.ts',
      name: 'MythicForgePlayer',
      formats: ['iife'],
      fileName: () => 'mythic-forge-player.js',
    },
  },
});
