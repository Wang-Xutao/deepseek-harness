import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, parsePrefs } from '../src/prefs.ts'

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
})
