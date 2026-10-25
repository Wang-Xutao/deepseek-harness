// @vitest-environment jsdom
/**
 * Sidebar launcher pins stay in memory per panel id and ignore the fixed Plugins panel.
 * 【变更】2026-10-25 (批次二十四 3): 自动化任务 starts in the More menu, so the
 * default unpinned list is not empty any more.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPanelPins } from '../src/client/panel-pins.ts'

const KEY = 'dsh.slot.manual-order.sidebar.panellist.v1'
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('sidebar panel pins', () => {
  it('keeps unpinned panel ids in memory without restoring them in a new instance', () => {
    const pins = createPanelPins()
    const listener = vi.fn()
    pins.unpinned.subscribe(listener)
    const initial = pins.unpinned.getSnapshot()
    expect(initial).toEqual(['schedules'])
    expect(pins.unpinned.getSnapshot()).toBe(initial)
    pins.setPinned('notes', false)
    pins.setPinned('tasks', false)
    expect(pins.unpinned.getSnapshot()).toEqual(['schedules', 'notes', 'tasks'])
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(createPanelPins().unpinned.getSnapshot()).toEqual(['schedules'])
    pins.setPinned('notes', true)
    expect(pins.unpinned.getSnapshot()).toEqual(['schedules', 'tasks'])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('ignores Plugins and repeated choices without republishing', () => {
    const pins = createPanelPins()
    pins.setPinned('notes', false)
    const snapshot = pins.unpinned.getSnapshot()
    const listener = vi.fn()
    pins.unpinned.subscribe(listener)
    pins.setPinned('plugins', false)
    pins.setPinned('notes', false)
    pins.setPinned('absent', true)
    expect(pins.unpinned.getSnapshot()).toBe(snapshot)
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps ids of panels that are not registered', () => {
    const pins = createPanelPins()
    pins.setPinned('removed-plugin', false)
    pins.setPinned('notes', false)
    expect(pins.unpinned.getSnapshot()).toEqual(['schedules', 'removed-plugin', 'notes'])
  })

  it('ignores a legacy stored list instead of restoring it', () => {
    localStorage.setItem(KEY, JSON.stringify({ unpinned: ['notes'] }))
    const pins = createPanelPins()
    const snapshot = pins.unpinned.getSnapshot()
    expect(snapshot).toEqual(['schedules'])
    expect(pins.unpinned.getSnapshot()).toBe(snapshot)
    pins.setPinned('notes', false)
    expect(pins.unpinned.getSnapshot()).toEqual(['schedules', 'notes'])
  })
})
