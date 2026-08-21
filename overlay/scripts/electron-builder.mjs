import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '../desktop')
const shimDir = resolve(desktop, 'bin')
const dshNodeModules = join(desktop, 'resources', 'dsh', 'node_modules')
const requireFromDesktop = createRequire(join(desktop, 'package.json'))
/** Unpack-only build: runnable win-unpacked exe, no NSIS Setup. */
const dirOnly = process.argv.includes('--dir')

process.env.PATH = `${shimDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`
process.env.CSC_IDENTITY_AUTO_DISCOVERY = process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? 'false'
process.env.ELECTRON_MIRROR = process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/'
process.env.ELECTRON_BUILDER_BINARIES_MIRROR =
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR
  ?? 'https://npmmirror.com/mirrors/electron-builder-binaries/'

/**
 * Installer build: zip dsh node_modules for NSIS install-time expand.
 * Dir build: keep exploded node_modules so win-unpacked can launch immediately.
 * @param {{ appOutDir: string }} context
 */
async function afterPack(context) {
  if (!existsSync(dshNodeModules)) {
    throw new Error(`缺少 ${dshNodeModules}：请先运行 pack-dsh`)
  }

  const dshOut = join(context.appOutDir, 'resources', 'dsh')
  const zipOut = join(dshOut, 'modules.zip')
  const exploded = join(dshOut, 'node_modules')

  if (dirOnly) {
    if (existsSync(zipOut)) rmSync(zipOut, { force: true })
    if (existsSync(exploded)) rmSync(exploded, { recursive: true, force: true })
    console.log(`afterPack: copying dsh node_modules -> ${exploded}`)
    cpSync(dshNodeModules, exploded, { recursive: true })
    console.log('afterPack: dir build ready (run dist/win-unpacked/baf-dsh.exe)')
    return
  }

  if (existsSync(exploded)) {
    rmSync(exploded, { recursive: true, force: true })
  }
  if (existsSync(zipOut)) {
    rmSync(zipOut, { force: true })
  }

  console.log(`afterPack: archiving dsh node_modules -> ${zipOut}`)
  const tar = spawnSync(
    'tar',
    ['-a', '-cf', zipOut, '-C', join(desktop, 'resources', 'dsh'), 'node_modules'],
    { encoding: 'utf8', windowsHide: true },
  )
  if (tar.status !== 0 || !existsSync(zipOut)) {
    console.warn('tar 打包失败，回退为直接复制 node_modules（安装进度可能停顿）')
    console.warn(tar.stderr || tar.stdout)
    cpSync(dshNodeModules, exploded, { recursive: true })
    return
  }
  console.log('afterPack: modules.zip ready (install-time expand)')
}

const { build } = requireFromDesktop('electron-builder')

await build({
  projectDir: desktop,
  win: [dirOnly ? 'dir' : 'nsis'],
  publish: 'never',
  config: {
    afterPack,
    compression: 'normal',
  },
})
