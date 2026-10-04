// One-off: rebundle only the baf fork preset package after its post-merge
// source repairs. Mirrors tsdown.chunk.config.ts (same entry shape, same
// suppressed whole-workspace typert emit — the fork is skipped there too).
import { defineConfig } from 'tsdown'
import { typertPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'

const real = typertPlugin({ mode: 'workspace', faces: ['host'] })

export default defineConfig(() => ({
  workspace: ['packages/preset/agent-presets'],
  entry: ['lib/types/{index,startup}.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  plugins: [{ ...real, writeBundle: () => {} }],
}))
