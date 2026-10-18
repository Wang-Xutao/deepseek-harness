import { defineConfig } from 'tsdown'

/** Bundle the Host entries from tsc emit. */
export default defineConfig([
  {
    entry: ['lib/types/index.js', 'lib/types/install.js', 'lib/types/global-install.js', 'lib/types/commit-hook.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
])
