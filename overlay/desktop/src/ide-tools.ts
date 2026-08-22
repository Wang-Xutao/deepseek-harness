/** IDE CLI detection for the Electron shell (PATH + known install locations). */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type IdeAvailability = {
  vscode: boolean
  cursor: boolean
}

export type IdeKind = 'vscode' | 'cursor'

const CLI_NAME: Record<IdeKind, string> = {
  vscode: 'code',
  cursor: 'cursor',
}

/**
 * Extra bin directories that Windows installers often add to the *user* PATH,
 * which Electron started from a shortcut may not inherit.
 */
function windowsIdeBinDirs(): string[] {
  const local = process.env.LOCALAPPDATA
    ?? join(homedir(), 'AppData', 'Local')
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  return [
    join(local, 'Programs', 'Microsoft VS Code', 'bin'),
    join(programFiles, 'Microsoft VS Code', 'bin'),
    join(programFilesX86, 'Microsoft VS Code', 'bin'),
    join(local, 'Programs', 'cursor', 'resources', 'app', 'bin'),
    join(local, 'Programs', 'Cursor', 'resources', 'app', 'bin'),
  ]
}

/**
 * @returns PATH with known IDE bin directories prepended when present on disk.
 */
export function pathWithIdeBins(basePath: string = process.env.PATH ?? ''): string {
  if (process.platform !== 'win32') return basePath
  const extras = windowsIdeBinDirs().filter(dir => existsSync(dir))
  return extras.length === 0 ? basePath : [...extras, basePath].join(delimiter)
}

/**
 * Absolute CLI shim paths for a given IDE when installed in a known location.
 * @param ide - which IDE.
 */
export function knownCliPaths(ide: IdeKind): string[] {
  if (process.platform !== 'win32') return []
  const name = CLI_NAME[ide]
  return windowsIdeBinDirs().flatMap(dir => [
    join(dir, `${name}.cmd`),
    join(dir, `${name}.exe`),
    join(dir, name),
  ])
}

/**
 * Prefer a Windows-spawnable shim from `where.exe` output.
 * Extensionless `code` / `cursor` files are POSIX scripts and yield ENOENT under spawn().
 * @param candidates - absolute paths from where.exe (one per line).
 */
export function pickWindowsCliPath(candidates: readonly string[]): string | undefined {
  const paths = candidates.map(s => s.trim()).filter(s => s.length > 0)
  return paths.find(p => /\.cmd$/i.test(p))
    ?? paths.find(p => /\.exe$/i.test(p))
    ?? paths.find(p => existsSync(`${p}.cmd`))?.concat('.cmd')
    ?? paths[0]
}

/**
 * Strip host-Electron flags so nested VS Code / Cursor CLIs boot cleanly.
 * @param base - process env to clone.
 */
export function envForIdeSpawn(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, PATH: pathWithIdeBins(base.PATH ?? '') }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_NO_ASAR
  delete env.ELECTRON_PRESERVE_SYMLINKS
  return env
}

/**
 * Quote a Windows path for `cmd.exe /s /c` (strips embedded quotes).
 * @param value - absolute path or argument.
 */
export function quoteWinArg(value: string): string {
  return `"${value.replace(/"/g, '')}"`
}

/**
 * Build the `/c` command line for `cmd.exe /d /s /c` with `windowsVerbatimArguments`.
 * Paths with spaces (e.g. `Microsoft VS Code`) require the outer double-quote wrap.
 * @param cliPath - absolute `.cmd` / `.exe` path.
 * @param folderPath - workspace folder to open.
 */
export function windowsIdeCommandLine(cliPath: string, folderPath: string): string {
  return `""${cliPath.replace(/"/g, '')}" "${folderPath.replace(/"/g, '')}""`
}

/**
 * @param command - executable name (`code`, `cursor`).
 * @param envPath - PATH to search.
 * @returns true when the command resolves on PATH.
 */
export async function commandOnPath(
  command: string,
  envPath: string = pathWithIdeBins(),
): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      await execFileAsync('where.exe', [command], {
        windowsHide: true,
        env: { ...process.env, PATH: envPath },
      })
    } else {
      await execFileAsync('/bin/sh', ['-c', `command -v ${JSON.stringify(command)}`], {
        windowsHide: true,
        env: { ...process.env, PATH: envPath },
      })
    }
    return true
  } catch {
    return false
  }
}

/**
 * Resolve an absolute CLI path, preferring PATH then known install locations.
 * @param ide - which IDE.
 */
export async function resolveIdeCli(ide: IdeKind): Promise<string | undefined> {
  const command = CLI_NAME[ide]
  const envPath = pathWithIdeBins()
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('where.exe', [command], {
        windowsHide: true,
        env: { ...process.env, PATH: envPath },
        encoding: 'utf8',
      })
      const picked = pickWindowsCliPath(stdout.split(/\r?\n/))
      if (picked !== undefined) return picked
    } catch {
      // Fall through to known locations.
    }
    return knownCliPaths(ide).find(path => existsSync(path))
  }
  if (await commandOnPath(command, envPath)) return command
  return undefined
}

/**
 * Probe VS Code (`code`) and Cursor (`cursor`) CLIs (PATH + known install dirs).
 */
export async function detectIdeTools(): Promise<IdeAvailability> {
  const [vscodePath, cursorPath] = await Promise.all([
    resolveIdeCli('vscode'),
    resolveIdeCli('cursor'),
  ])
  return {
    vscode: vscodePath !== undefined,
    cursor: cursorPath !== undefined,
  }
}

/**
 * Spawn the IDE CLI so paths with spaces (VS Code under `Microsoft VS Code`) work.
 * @param cliPath - resolved CLI path.
 * @param folderPath - workspace folder.
 * @param env - sanitized environment.
 */
export function spawnIdeProcess(
  cliPath: string,
  folderPath: string,
  env: NodeJS.ProcessEnv = envForIdeSpawn(),
): ChildProcess {
  if (process.platform === 'win32') {
    return spawn(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', windowsIdeCommandLine(cliPath, folderPath)],
      {
        windowsVerbatimArguments: true,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env,
      },
    )
  }
  return spawn(cliPath, [folderPath], {
    detached: true,
    stdio: 'ignore',
    env,
  })
}

/**
 * Open a folder in the chosen IDE via its CLI.
 * @param ide - which CLI to invoke.
 * @param folderPath - absolute workspace path.
 */
export async function openFolderInIde(
  ide: IdeKind,
  folderPath: string,
): Promise<{ ok: true } | { ok: false, error: string }> {
  const resolved = await resolveIdeCli(ide)
  if (resolved === undefined) {
    return {
      ok: false,
      error: ide === 'vscode' ? '未检测到 VS Code CLI（code）' : '未检测到 Cursor CLI（cursor）',
    }
  }

  return await new Promise(resolve => {
    let settled = false
    const finish = (result: { ok: true } | { ok: false, error: string }): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    try {
      const child = spawnIdeProcess(resolved, folderPath)
      child.once('error', (err) => {
        finish({ ok: false, error: err instanceof Error ? err.message : String(err) })
      })
      child.unref()
      // ENOENT surfaces on the next tick; give it a moment before claiming success.
      setTimeout(() => { finish({ ok: true }) }, 50)
    } catch (err) {
      finish({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })
}
