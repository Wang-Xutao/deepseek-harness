/**
 * Copy hand-maintained Typert artifacts into `lib/` after tsdown.
 * `lib/` is gitignored; sources live in `typert-artifacts/`.
 */
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const from = join(root, 'typert-artifacts')
const to = join(root, 'lib')
mkdirSync(to, { recursive: true })
for (const name of [
  'typert.host.js',
  'typert.host.d.ts',
  'typert.remote-client.js',
  'typert.remote-client.d.ts',
]) {
  cpSync(join(from, name), join(to, name))
}
console.log('copied typert-artifacts -> lib/')
