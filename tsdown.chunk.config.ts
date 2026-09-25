import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'
import { typertPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'

/**
 * Chunked variant of the root Host tsdown config. The single-process
 * workspace build OOMs on this machine (~121/341), so CHUNK=<n> selects a
 * 12-package slice of rebuild-list.tmp.json (packages whose lib/types is
 * newer than their lib bundle, i.e. exactly what tsc re-emitted).
 *
 * The typert plugin's decorator-lowering transform is load-bearing and is
 * kept by spreading the real plugin; only writeBundle (whole-workspace
 * typert emit — the expensive part) is suppressed here and run once at the
 * end via `node typert-emit-all.mjs`.
 */
const CHUNK_SIZE = 12
const list = JSON.parse(readFileSync('rebuild-list.tmp.json', 'utf8')) as string[]
const chunkIndex = Number(process.env.CHUNK ?? '0')
const slice = list
  .slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE)
  // rebuild-list.tmp.json carries Windows separators; tsdown globs match on '/'.
  .map(p => p.replaceAll('\\', '/'))
if (slice.length === 0) throw new Error(`tsdown chunk ${chunkIndex} is empty (list has ${list.length} entries)`)

const real = typertPlugin({ mode: 'workspace', faces: ['host'] })

export default defineConfig(() => ({
  workspace: slice,
  entry: ['lib/types/{index,invariant,startup}.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  plugins: [{
    ...real,
    writeBundle: () => {},
  }],
}))
