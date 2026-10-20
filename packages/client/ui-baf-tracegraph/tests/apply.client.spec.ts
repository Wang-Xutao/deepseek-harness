// @vitest-environment jsdom
/**
 * Composition of the trace-graph plugin: 工作流 main panel + preference rows.
 *
 * 【变更】2026-10-06 (问题 1): the 轨迹图 toggle row moved from General
 * settings ('settings.general.item') INTO the 工作流 surface
 * ('settings.workflow.item', order 5 — ahead of the 工作流图 row at
 * order 10).
 * 【变更】2026-10-19 (主页面三改 3): the 工作流 surface left the Settings
 * modal — the settings.section registration became a 'main' panel entry plus
 * its 'sidebar.panellist' row (order 20, below 插件 0 / 自动化任务 10). The
 * child slot declaration moved with it; row registrants are unchanged.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { apply } from '../src/client/index.ts'

afterEach(cleanup)

/** A minimal client context capturing slot injections and registrations. */
function fakeCtx() {
  const injected: string[] = []
  const registered: Array<Record<string, unknown>> = []
  const ctx = {
    effect: (fn: () => void) => { fn(); return () => undefined },
    locale: {
      register: vi.fn(),
      bind: () => (key: string) => key,
    },
    slots: {
      inject: (name: string, install: () => void) => { injected.push(name); install() },
      register: (options: Record<string, unknown>) => {
        registered.push(options)
        return () => undefined
      },
    },
  }
  return { ctx: ctx as unknown as ClientContext, injected, registered }
}

describe('trace-graph settings composition', () => {
  it('registers the 轨迹图 row under the 工作流 section slot (settings.workflow.item), NOT General settings', () => {
    const { ctx, injected, registered } = fakeCtx()
    apply(ctx)
    // 问题 1: the row left General settings and joined the 工作流 section.
    expect(injected).toContain('settings.workflow.item')
    expect(injected).not.toContain('settings.general.item')
    const row = registered.find(options => options.name === 'settings.workflow.item')
    expect(row).toMatchObject({ id: 'trace-graph', order: 5, locale: 'baf.workflow' })
  })

  it('registers the 工作流 main panel + sidebar entry declaring the workflow.item child slot (主页面三改 3)', () => {
    const { ctx, injected, registered } = fakeCtx()
    apply(ctx)
    // The settings.section registration is gone with the Settings-modal surface.
    expect(injected).not.toContain('settings.section')
    const page = registered.find(options => options.name === 'main')
    expect(page).toMatchObject({
      key: 'workflow',
      children: { 'settings.workflow.item': { kind: 'list', scope: 'root' } },
    })
    const panel = registered.find(options => options.name === 'sidebar.panellist')
    expect(panel).toMatchObject({ id: 'workflow', order: 20, locale: 'baf.workflow' })
    // The panel label still binds the workflow namespace dictionary.
    expect((panel?.label as () => string)()).toBe('section.title')
  })
})
