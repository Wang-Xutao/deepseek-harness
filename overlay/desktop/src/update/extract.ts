import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * §12 9.7: is one zip entry name safe to extract under destDir?
 * Rejects traversal (`..` segments), absolute paths (drive letter / leading
 * slash / UNC), backslashes (zip spec uses `/`; a `\` is a naming smell our
 * packer never produces), and `:` anywhere (NTFS alternate data streams).
 * @param name - entry name from the archive listing.
 * @returns true when the name cannot escape destDir.
 */
export function isSafeZipEntryName(name: string): boolean {
  if (name === '' || name.includes('\\') || name.includes('\0')) return false
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false
  return name.split('/').every(segment => segment !== '..' && !segment.includes(':'))
}

/**
 * List the archive's entry names (bsdtar `-tf` / `unzip -Z1`). Validation is
 * fail-closed: an archive we cannot list is an archive we cannot trust.
 */
async function listZipEntries(zipPath: string): Promise<string[]> {
  const listing = process.platform === 'win32'
    ? await runCapture('tar.exe', ['-tf', zipPath])
    : await runCapture('unzip', ['-Z1', zipPath])
  if (listing === undefined) throw new Error(`无法列出压缩包条目：${zipPath}`)
  return listing
}

/**
 * Extract a zip archive into destDir (created if needed).
 * Uses Windows tar.exe first, then PowerShell Expand-Archive.
 *
 * §12 9.7 hardening: every entry name is validated BEFORE anything is
 * extracted (fail-closed when the listing is unavailable), and the extracted
 * tree is scanned for symlinks afterwards — our update zips carry none, so
 * any symlink is an escape attempt and the partial tree is removed.
 * @param zipPath - path to .zip.
 * @param destDir - destination directory.
 */
export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  if (!existsSync(zipPath)) throw new Error(`缺少压缩包：${zipPath}`)
  const entries = await listZipEntries(zipPath)
  const evil = entries.find(name => !isSafeZipEntryName(name))
  if (evil !== undefined) {
    throw new Error(`压缩包含不安全路径（拒绝解压）：${evil}`)
  }
  mkdirSync(destDir, { recursive: true })

  if (process.platform === 'win32') {
    const tarOk = await run('tar.exe', ['-xf', zipPath, '-C', destDir])
    if (tarOk) {
      assertNoSymlinks(destDir)
      return
    }
    const ps = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ]
    const psOk = await run('powershell.exe', ps)
    if (!psOk) throw new Error(`解压失败：${zipPath}`)
    assertNoSymlinks(destDir)
    return
  }

  const ok = await run('unzip', ['-o', zipPath, '-d', destDir])
  if (!ok) throw new Error(`解压失败：${zipPath}`)
  assertNoSymlinks(destDir)
}

/**
 * Post-extract symlink sweep: a symlink inside an update payload could point
 * anywhere on disk, so its presence voids the whole extraction. The check
 * runs BEFORE isDirectory() logic — on Node, a symlink to a directory
 * reports both flags.
 * @param dir - freshly extracted tree.
 */
function assertNoSymlinks(dir: string): void {
  const stack: string[] = [dir]
  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isSymbolicLink()) {
        rmSync(dir, { recursive: true, force: true })
        throw new Error(`压缩包含符号链接（拒绝解压）：${entry.name}`)
      }
      if (entry.isDirectory()) stack.push(path)
    }
  }
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

/** Spawn, capture stdout lines; undefined on non-zero exit / spawn error. */
function runCapture(command: string, args: string[]): Promise<string[] | undefined> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true })
    let out = ''
    child.stdout?.on('data', (chunk: Buffer | string) => { out += String(chunk) })
    child.on('error', () => resolve(undefined))
    child.on('exit', (code) => {
      if (code !== 0) {
        resolve(undefined)
        return
      }
      resolve(out.split(/\r?\n/).filter(line => line !== ''))
    })
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
