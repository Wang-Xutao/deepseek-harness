import { describe, expect, it } from 'vitest'
import {
  commandOnPath, detectIdeTools, pathWithIdeBins, pickWindowsCliPath, resolveIdeCli,
  windowsIdeCommandLine,
} from '../src/ide-tools.ts'

describe('commandOnPath', () => {
  it('finds a known Windows builtin when where.exe works', async () => {
    if (process.platform !== 'win32') return
    await expect(commandOnPath('where')).resolves.toBe(true)
  })

  it('rejects a nonsense command name', async () => {
    await expect(commandOnPath('baf-dsh-no-such-cli-xyz')).resolves.toBe(false)
  })
})

describe('pathWithIdeBins', () => {
  it('keeps PATH unchanged on non-Windows', () => {
    if (process.platform === 'win32') return
    expect(pathWithIdeBins('/usr/bin')).toBe('/usr/bin')
  })

  it('prepends existing IDE bin dirs on Windows', () => {
    if (process.platform !== 'win32') return
    const next = pathWithIdeBins('C:\\Windows\\System32')
    expect(next.includes('C:\\Windows\\System32')).toBe(true)
  })
})

describe('pickWindowsCliPath', () => {
  it('prefers .cmd over extensionless shims', () => {
    expect(pickWindowsCliPath([
      'C:\\Apps\\cursor\\bin\\cursor',
      'C:\\Apps\\cursor\\bin\\cursor.cmd',
    ])).toBe('C:\\Apps\\cursor\\bin\\cursor.cmd')
  })

  it('prefers .exe when no .cmd is listed', () => {
    expect(pickWindowsCliPath([
      'C:\\Apps\\bin\\tool',
      'C:\\Apps\\bin\\tool.exe',
    ])).toBe('C:\\Apps\\bin\\tool.exe')
  })
})

describe('windowsIdeCommandLine', () => {
  it('wraps spaced VS Code paths for cmd /s /c', () => {
    expect(windowsIdeCommandLine(
      'D:\\Programs\\Microsoft VS Code\\bin\\code.cmd',
      'D:\\work\\my repo',
    )).toBe('""D:\\Programs\\Microsoft VS Code\\bin\\code.cmd" "D:\\work\\my repo""')
  })
})

describe('detectIdeTools', () => {
  it('reports availability consistent with resolveIdeCli', async () => {
    const tools = await detectIdeTools()
    const [vscode, cursor] = await Promise.all([
      resolveIdeCli('vscode'),
      resolveIdeCli('cursor'),
    ])
    expect(tools.vscode).toBe(vscode !== undefined)
    expect(tools.cursor).toBe(cursor !== undefined)
  })

  it('resolves Windows IDE CLIs to .cmd shims when present', async () => {
    if (process.platform !== 'win32') return
    const cursor = await resolveIdeCli('cursor')
    if (cursor === undefined) return
    expect(cursor.toLowerCase().endsWith('.cmd') || cursor.toLowerCase().endsWith('.exe')).toBe(true)
  })
})
