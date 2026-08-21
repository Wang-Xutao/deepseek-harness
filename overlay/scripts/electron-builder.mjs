import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '../desktop')
const shimDir = resolve(desktop, 'bin')
const dshNodeModules = join(desktop, 'resources', 'dsh', 'node_modules')
const requireFromDesktop = createRequire(join(desktop, 'package.json'))

process.env.PATH = `${shimDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`
process.env.CSC_IDENTITY_AUTO_DISCOVERY = process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? 'false'
process.env.ELECTRON_MIRROR = process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/'
process.env.ELECTRON_BUILDER_BINARIES_MIRROR =
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR
  ?? 'https://npmmirror.com/mirrors/electron-builder-binaries/'

/**
 * Pack dsh node_modules as a single zip so NSIS extracts one file (smooth progress),
 * then customInstall expands it with DetailPrint.
 * @param {{ appOutDir: string }} context
 */
async function afterPack(context) {
  if (!existsSync(dshNodeModules)) {
    throw new Error(`缺少 ${dshNodeModules}：请先运行 pack-dsh`)
  }

  const dshOut = join(context.appOutDir, 'resources', 'dsh')
  const zipOut = join(dshOut, 'modules.zip')
  const exploded = join(dshOut, 'node_modules')

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
  win: ['nsis'],
  publish: 'never',
  config: {
    afterPack,
    compression: 'normal',
  },
})
