/**
 * 【变更】2026-10-02 (demo31 问题 1) session-home unit tests: the sticky
 * customer-home session per workspace.
 *
 * demo31's walk misread "the page froze" twice because every gate card and
 * work order after the first classify landed in whatever session last ended a
 * turn on the cwd — the customer's home conversation went silent and the
 * decisions followed the work around. The fix records ONE home session per
 * workspace (the conversation the customer last acted in) and the pops prefer
 * it. These tests pin the store itself; the orchestrator's preference is
 * pinned in session-affinity.spec.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { homeSessionFor, resetHomeSessionCache } from '../src/session-home.ts'

beforeEach(() => {
  resetHomeSessionCache()
})

describe('session-home store (demo31 问题 1)', () => {
  it('records and reads the home session of one workspace', () => {
    expect(homeSessionFor('D:/ws/a').get()).toBeUndefined()
    homeSessionFor('D:/ws/a').set('sess-customer')
    expect(homeSessionFor('D:/ws/a').get()).toBe('sess-customer')
  })

  it('keeps workspaces isolated — a second cwd has its own home', () => {
    homeSessionFor('D:/ws/a').set('sess-a')
    homeSessionFor('D:/ws/b').set('sess-b')
    expect(homeSessionFor('D:/ws/a').get()).toBe('sess-a')
    expect(homeSessionFor('D:/ws/b').get()).toBe('sess-b')
  })

  it('re-anchors on set — the LAST customer action wins', () => {
    homeSessionFor('D:/ws/a').set('sess-first')
    homeSessionFor('D:/ws/a').set('sess-second')
    expect(homeSessionFor('D:/ws/a').get()).toBe('sess-second')
  })

  it('clear drops the binding (terminal transitions)', () => {
    homeSessionFor('D:/ws/a').set('sess-customer')
    homeSessionFor('D:/ws/a').clear()
    expect(homeSessionFor('D:/ws/a').get()).toBeUndefined()
  })
})
