import { fileURLToPath } from 'node:url';

/**
 * Internal packages are resolved from source by explicit aliases instead of relying on
 * npm workspace links (junctions), which are fragile on some Windows setups.
 * Keep in sync with `paths` in tsconfig.json.
 */
const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export const workspaceAliases: { find: RegExp; replacement: string }[] = [
  { find: /^@mythic-forge\/core$/, replacement: here('./packages/core/src/index.ts') },
  { find: /^@mythic-forge\/platform$/, replacement: here('./packages/platform/src/index.ts') },
  { find: /^@mythic-forge\/renderer$/, replacement: here('./packages/renderer/src/index.ts') },
  { find: /^@mythic-forge\/renderer\/importer$/, replacement: here('./packages/renderer/src/assets/importer.ts') },
  { find: /^@mythic-forge\/renderer\/probe$/, replacement: here('./packages/renderer/src/probe.ts') },
];
