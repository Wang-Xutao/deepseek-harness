import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Extract a zip archive into destDir (created if needed).
 * Uses Windows tar.exe first, then PowerShell Expand-Archive.
 * @param zipPath - path to .zip.
 * @param destDir - destination directory.
 */
export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  if (!existsSync(zipPath)) throw new Error(`缺少压缩包：${zipPath}`)
  mkdirSync(destDir, { recursive: true })

  if (process.platform === 'win32') {
    const tarOk = await run('tar.exe', ['-xf', zipPath, '-C', destDir])
    if (tarOk) return
    const ps = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ]
    const psOk = await run('powershell.exe', ps)
    if (!psOk) throw new Error(`解压失败：${zipPath}`)
    return
  }

  const ok = await run('unzip', ['-o', zipPath, '-d', destDir])
  if (!ok) throw new Error(`解压失败：${zipPath}`)
}

/**
 * Replace liveDir with nextDir, keeping bakDir for rollback.
 * @param liveDir - current directory.
 * @param nextDir - newly extracted directory.
 * @param bakDir - backup path.
 */
export function atomicSwapDir(liveDir: string, nextDir: string, bakDir: string): void {
  if (!existsSync(nextDir)) throw new Error(`缺少 next 目录：${nextDir}`)
  rmSync(bakDir, { recursive: true, force: true })
  if (existsSync(liveDir)) {
    renameSync(liveDir, bakDir)
  }
  mkdirSync(dirname(liveDir), { recursive: true })
  renameSync(nextDir, liveDir)
}

/**
 * Restore bakDir over liveDir after a failed update.
 * @param liveDir - current (bad) directory.
 * @param bakDir - previous good directory.
 */
export function rollbackDir(liveDir: string, bakDir: string): void {
  if (!existsSync(bakDir)) return
  rmSync(liveDir, { recursive: true, force: true })
  renameSync(bakDir, liveDir)
}

function run(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

/**
 * @param root - parent directory.
 * @param name - child name.
 * @returns joined path.
 */
export function childPath(root: string, name: string): string {
  return join(root, name)
}
