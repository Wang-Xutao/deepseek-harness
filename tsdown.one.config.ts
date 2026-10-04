// One-off: rebundle a single host package outside the chunked workspace runs —
// used for the baf fork preset package after its post-merge source repairs and
// for apps/cli (the chunk list only covers packages/*, so the CLI's lib/bin.js
// is otherwise only produced by the single-process workspace build that OOMs
// here). Mirrors tsdown.chunk.config.ts (same entry shape, same suppressed
// whole-workspace typert emit). Set the workspace glob below per use.
import { defineConfig } from 'tsdown'
import { typertPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'

const real = typertPlugin({ mode: 'workspace', faces: ['host'] })

export default defineConfig(() => ({
  workspace: ['apps/cli'],
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
