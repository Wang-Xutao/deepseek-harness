import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, renameSync, rmSync } from 'node:fs'
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
 * 运行中的 baf-dsh.exe 会锁住 win-unpacked 下的文件，使 rm/cp 中途 EPERM
 * 或被 Ctrl+C 打断后留下残缺 node_modules（2026-09-19 事故：206 包只剩 145，
 * 启动报 ERR_MODULE_NOT_FOUND resolve.exports → 弹"应用程序文件不完整"）。
 * Windows 下先检测并快速失败，错误信息给出可操作指引。
 */
function assertNoRunningBafDsh() {
  if (process.platform !== 'win32') return
  const tasklist = spawnSync(
    'tasklist',
    ['/FI', 'IMAGENAME eq baf-dsh.exe', '/FO', 'CSV', '/NH'],
    { encoding: 'utf8', windowsHide: true },
  )
  if (/baf-dsh\.exe/i.test(tasklist.stdout ?? '')) {
    throw new Error(
      '检测到正在运行的 baf-dsh.exe（含残留报错弹窗），会锁住 dist 文件导致复制不完整。' +
        '请先在任务管理器全部结束（或 taskkill /IM baf-dsh.exe /F）后重新打包。',
    )
  }
}

/** Sorted top-level entry names of a directory ([] when missing). */
function topEntryNames(dir) {
  try {
    return readdirSync(dir).sort()
  } catch {
    return []
  }
}

/**
 * Copy staging node_modules into destDir with a completeness gate:
 * 1. copy to a sibling temp dir first (old tree stays launchable while copying);
 * 2. verify top-level package sets are identical, throw on any gap so the
 *    build fails loudly instead of shipping a truncated tree;
 * 3. swap temp into place (rm old + rename), shrinking the broken window to ~ms.
 * @param {string} staging staging node_modules (pack-dsh output)
 * @param {string} destDir exploded node_modules inside appOutDir
 */
async function copyNodeModulesVerified(staging, destDir) {
  const tmp = `${destDir}.tmp`
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
  cpSync(staging, tmp, { recursive: true })

  const expected = topEntryNames(staging)
  const actual = topEntryNames(tmp)
  const missing = expected.filter((name) => !actual.includes(name))
  if (missing.length > 0) {
    rmSync(tmp, { recursive: true, force: true })
    throw new Error(
      `node_modules 复制不完整：缺少 ${missing.length}/${expected.length} 项` +
        `（${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}）。` +
        '请确认打包期间未被 Ctrl+C 打断、无 baf-dsh.exe 正在运行。',
    )
  }

  if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true })
  // rename 紧跟 ~1GB cpSync 之后，Defender 实时扫描还握着新树里的目录句柄，
  // Windows 直接 EPERM（2026-10-04 连续三次复现，手动延时 rename 即成功）。
  // 同款竞态先例：§22.17 J5 writeAtomic —— 短退避重试到扫描放行。
  let lastErr
  for (const delayMs of [0, 500, 1000, 2000, 4000, 8000, 16000, 32000]) {
    if (delayMs > 0) await sleep(delayMs)
    try {
      renameSync(tmp, destDir)
      lastErr = undefined
      break
    } catch (err) {
      lastErr = err
    }
  }
  if (lastErr) throw lastErr
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

/**
 * Installer build: zip dsh node_modules for NSIS install-time expand.
 * Dir build: keep exploded node_modules so win-unpacked can launch immediately.
 * @param {{ appOutDir: string }} context
 */
async function afterPack(context) {
  if (!existsSync(dshNodeModules)) {
    throw new Error(`缺少 ${dshNodeModules}：请先运行 pack-dsh`)
  }
  assertNoRunningBafDsh()

  const dshOut = join(context.appOutDir, 'resources', 'dsh')
  const zipOut = join(dshOut, 'modules.zip')
  const exploded = join(dshOut, 'node_modules')

  if (dirOnly) {
    if (existsSync(zipOut)) rmSync(zipOut, { force: true })
    console.log(`afterPack: copying dsh node_modules -> ${exploded}`)
    await copyNodeModulesVerified(dshNodeModules, exploded)
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
    ['-a', '--force-local', '-cf', zipOut, '-C', join(desktop, 'resources', 'dsh'), 'node_modules'],
    { encoding: 'utf8', windowsHide: true },
  )
  if (tar.status !== 0 || !existsSync(zipOut)) {
    console.warn('tar 打包失败，回退为直接复制 node_modules（安装进度可能停顿）')
    console.warn(tar.stderr || tar.stdout)
    await copyNodeModulesVerified(dshNodeModules, exploded)
    return
  }
  console.log('afterPack: modules.zip ready (install-time expand)')
}

const { build } = requireFromDesktop('electron-builder')

// 提前快速失败：正在运行的 baf-dsh.exe 会锁文件，等 afterPack 才发现会白跑整个构建。
assertNoRunningBafDsh()

await build({
  projectDir: desktop,
  win: [dirOnly ? 'dir' : 'nsis'],
  publish: 'never',
  config: {
    afterPack,
    compression: 'normal',
  },
})
