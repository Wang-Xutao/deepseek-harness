import { describe, expect, it } from 'vitest'
import { OPEN_IN_APP_CATALOG, PATH_TOKEN, type OpenInAppLocator } from '../src/catalog.ts'

/** The win32 spec's locators for one catalog id. */
function win32Locators(id: string): readonly OpenInAppLocator[] {
  const entry = OPEN_IN_APP_CATALOG.find(app => app.id === id)
  const spec = entry?.platforms.win32
  if (spec === undefined) throw new Error(`no win32 spec for ${id}`)
  return spec.locators
}

/** The win32 fixed launcher (command + args) for one catalog id. */
function fixedLaunch(id: string): { readonly command: string; readonly args: readonly string[] } {
  const fixed = win32Locators(id).find(locator => locator.kind === 'fixed')
  if (fixed?.kind !== 'fixed') throw new Error(`${id} has no fixed locator`)
  const { launch } = fixed
  if (launch.kind !== 'argv') throw new Error(`${id} launch is not argv`)
  return { command: launch.command, args: launch.args }
}

describe('catalog console entries', () => {
  it('cmd and powershell route through cmd start /d so the OS allocates a console', () => {
    // The host child runs console-less, so a directly spawned console app is
    // windowless; `start` is the one primitive that requests a new console.
    expect(fixedLaunch('cmd')).toEqual({
      command: '${SystemRoot}\\System32\\cmd.exe',
      args: ['/c', 'start', '/d', PATH_TOKEN, 'cmd'],
    })
    expect(fixedLaunch('powershell')).toEqual({
      command: '${SystemRoot}\\System32\\cmd.exe',
      args: ['/c', 'start', '/d', PATH_TOKEN, 'powershell', '-NoExit'],
    })
  })

  it('carries no quote characters in argv data', () => {
    // Quote characters in argv data reach cmd's parser backslash-escaped
    // (Node's command-line quoting) and fail as syntax errors — a
    // `start ""`-style title or embedded quoting bug this pins out.
    for (const id of ['cmd', 'powershell']) {
      for (const arg of fixedLaunch(id).args) {
        expect(arg.includes('"'), `${id} arg carries quote data: ${arg}`).toBe(false)
      }
    }
  })
})
