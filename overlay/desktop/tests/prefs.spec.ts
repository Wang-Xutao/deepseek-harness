import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, mergePrefs, parsePrefs } from '../src/prefs.ts'

describe('parsePrefs', () => {
  it('returns defaults for invalid input', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs({})).toEqual(DEFAULT_PREFS)
    expect(parsePrefs({ closeAction: 'nope' })).toEqual(DEFAULT_PREFS)
  })

  it('accepts known close actions', () => {
    expect(parsePrefs({ closeAction: 'tray' })).toEqual({ closeAction: 'tray', launchAtLogin: false })
    expect(parsePrefs({ closeAction: 'quit' })).toEqual({ closeAction: 'quit', launchAtLogin: false })
    expect(parsePrefs({ closeAction: 'ask' })).toEqual(DEFAULT_PREFS)
  })

  it('keeps nodeBinary only when it is a non-empty string', () => {
    expect(parsePrefs({ nodeBinary: 'C:\\nodejs\\node.exe' })).toEqual({
      closeAction: 'ask',
      launchAtLogin: false,
      nodeBinary: 'C:\\nodejs\\node.exe',
    })
    expect(parsePrefs({ nodeBinary: '' })).toEqual(DEFAULT_PREFS)
    expect(parsePrefs({ nodeBinary: 123 })).toEqual(DEFAULT_PREFS)
  })

  // 【变更】2026-10-06 (问题 2): launchAtLogin persists as a boolean; anything
  // else falls back to off.
  it('reads launchAtLogin only as a boolean', () => {
    expect(parsePrefs({ launchAtLogin: true })).toEqual({ closeAction: 'ask', launchAtLogin: true })
    expect(parsePrefs({ launchAtLogin: false })).toEqual(DEFAULT_PREFS)
    expect(parsePrefs({ launchAtLogin: 'yes' })).toEqual(DEFAULT_PREFS)
    expect(parsePrefs({ launchAtLogin: 1 })).toEqual(DEFAULT_PREFS)
    expect(parsePrefs({ closeAction: 'tray', launchAtLogin: true })).toEqual({
      closeAction: 'tray', launchAtLogin: true,
    })
  })
})

describe('mergePrefs', () => {
  it('applies the renderer close action over the live prefs', () => {
    expect(mergePrefs(DEFAULT_PREFS, { closeAction: 'tray' })).toEqual({ closeAction: 'tray', launchAtLogin: false })
  })

  it('preserves the shell-owned node cache the renderer never sends', () => {
    const live = { closeAction: 'ask' as const, launchAtLogin: true, nodeBinary: 'C:\\nodejs\\node.exe' }
    expect(mergePrefs(live, { closeAction: 'quit' })).toEqual({
      closeAction: 'quit',
      launchAtLogin: true,
      nodeBinary: 'C:\\nodejs\\node.exe',
    })
  })

  it('ignores a patch naming no known field', () => {
    const live = { closeAction: 'tray' as const, launchAtLogin: true }
    expect(mergePrefs(live, null)).toBe(live)
    expect(mergePrefs(live, { closeAction: 'nope' })).toBe(live)
    expect(mergePrefs(live, {})).toBe(live)
    expect(mergePrefs(live, { launchAtLogin: 'yes' })).toBe(live)
  })

  // 【变更】2026-10-06 (问题 2): the launch row patches launchAtLogin alone —
  // the close pref the other row owns must survive it, and vice versa.
  it('merges each settings row field independently', () => {
    const live = { closeAction: 'tray' as const, launchAtLogin: false }
    expect(mergePrefs(live, { launchAtLogin: true })).toEqual({ closeAction: 'tray', launchAtLogin: true })
    expect(mergePrefs(live, { launchAtLogin: true, closeAction: 'nope' }))
      .toEqual({ closeAction: 'tray', launchAtLogin: true })
    const other = { closeAction: 'ask' as const, launchAtLogin: true }
    expect(mergePrefs(other, { closeAction: 'quit' })).toEqual({ closeAction: 'quit', launchAtLogin: true })
  })
})
