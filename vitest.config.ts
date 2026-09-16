import { defineConfig } from 'vitest/config';
import { workspaceAliases } from './workspace-aliases.ts';

export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/editor/test/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
});
