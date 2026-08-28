import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * True when packaged dsh runtime has an expandable or already-expanded module tree.
 * @param dshRoot - `resources/dsh` (or hot runtime root with the same layout).
 */
export function dshModulesMarker(dshRoot: string): string {
  return join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
}

/**
 * @param dshRoot - packaged dsh resource root.
 * @returns whether `node_modules` already contains the dsh package entry.
 */
export function dshModulesReady(dshRoot: string): boolean {
  return existsSync(dshModulesMarker(dshRoot))
}

/**
 * Expand `modules.zip` into `dshRoot/node_modules` when the installer (or a prior run)
 * has not already done so. NSIS builds ship zip-only so win-unpacked can launch without
 * a full Setup; Setup itself expands at install time and deletes the zip.
 * @param dshRoot - packaged `resources/dsh`.
 */
export function ensureDshModulesExpanded(dshRoot: string): void {
  if (dshModulesReady(dshRoot)) return

  const zipPath = join(dshRoot, 'modules.zip')
  if (!existsSync(zipPath)) {
    throw new Error(
      `未找到 dsh node_modules，且缺少 modules.zip（目录：${dshRoot}）。请重新安装 baf-dsh。`,
    )
  }

  const tar = spawnSync(
    'tar',
    ['-xf', zipPath, '-C', dshRoot],
    { encoding: 'utf8', windowsHide: true },
  )
  if (tar.status !== 0) {
    const detail = (tar.stderr || tar.stdout || '').trim()
    throw new Error(
      `解压 modules.zip 失败（tar exit=${String(tar.status)}）${detail ? `\n${detail}` : ''}`,
    )
  }

  if (!dshModulesReady(dshRoot)) {
    throw new Error(`解压 modules.zip 后仍缺少 ${dshModulesMarker(dshRoot)}`)
  }

  try {
    rmSync(zipPath, { force: true })
  } catch {
    // Zip left behind only wastes disk; launch can continue.
  }
}
