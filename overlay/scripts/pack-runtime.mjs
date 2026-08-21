#!/usr/bin/env node
/**
 * Zip overlay/desktop/resources/dsh (after pack-dsh) into baf-runtime-<dshVer>.zip.
 * Expects pack-dsh to have populated resources/dsh already.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const overlayRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const dshDir = join(overlayRoot, 'desktop', 'resources', 'dsh')
const outDir = join(overlayRoot, 'desktop', 'dist', 'update')
const repoRoot = join(overlayRoot, '..')

if (!existsSync(join(dshDir, '.baf-dsh-pack-ok')) && !existsSync(join(dshDir, 'lib', 'bin.js'))) {
  console.error('pack-runtime: run pack-dsh first (missing resources/dsh)')
  process.exit(1)
}

const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version
mkdirSync(outDir, { recursive: true })
const zipName = `baf-runtime-${version}.zip`
const zipPath = join(outDir, zipName)
rmSync(zipPath, { force: true })

const tar = spawnSync('tar', ['-a', '-cf', zipPath, '-C', dshDir, '.'], { stdio: 'inherit' })
if (tar.status !== 0) {
  console.error('pack-runtime: tar failed')
  process.exit(1)
}

const buf = readFileSync(zipPath)
const sha256 = createHash('sha256').update(buf).digest('hex')
const meta = { name: zipName, sha256, size: buf.byteLength, version }
writeFileSync(join(outDir, 'baf-runtime.meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
console.log(`pack-runtime: wrote ${zipPath}`)
console.log(`pack-runtime: sha256 ${sha256}`)
