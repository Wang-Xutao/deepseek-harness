import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, mergePrefs, parsePrefs } from '../src/prefs.ts'

describe('parsePrefs', () => {
  it('returns defaults for invalid input', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs({})).toEqual(DEFAULT_PREFS)
    expect(parsePrefs({ closeAction: 'nope' })).toEqual(DEFAULT_PREFS)
  })

  it('accepts known close actions', () => {
    expect(parsePrefs({ closeAction: 'tray' })).toEqual({ closeAction: 'tray' })
    expect(parsePrefs({ closeAction: 'quit' })).toEqual({ closeAction: 'quit' })
    expect(parsePrefs({ closeAction: 'ask' })).toEqual({ closeAction: 'ask' })
  })

  it('keeps nodeBinary only when it is a non-empty string', () => {
    expect(parsePrefs({ nodeBinary: 'C:\\nodejs\\node.exe' })).toEqual({
      closeAction: 'ask',
      nodeBinary: 'C:\\nodejs\\node.exe',
    })
    expect(parsePrefs({ nodeBinary: '' })).toEqual(DEFAULT_PREFS)
    expect(parsePrefs({ nodeBinary: 123 })).toEqual(DEFAULT_PREFS)
  })
})

describe('mergePrefs', () => {
  it('applies the renderer close action over the live prefs', () => {
    expect(mergePrefs({ closeAction: 'ask' }, { closeAction: 'tray' })).toEqual({ closeAction: 'tray' })
  })

  it('preserves the shell-owned node cache the renderer never sends', () => {
    const live = { closeAction: 'ask' as const, nodeBinary: 'C:\\nodejs\\node.exe' }
    expect(mergePrefs(live, { closeAction: 'quit' })).toEqual({
      closeAction: 'quit',
      nodeBinary: 'C:\\nodejs\\node.exe',
    })
  })

  it('ignores a patch naming no known field', () => {
    const live = { closeAction: 'tray' as const }
    expect(mergePrefs(live, null)).toBe(live)
    expect(mergePrefs(live, { closeAction: 'nope' })).toBe(live)
    expect(mergePrefs(live, {})).toBe(live)
  })
})
