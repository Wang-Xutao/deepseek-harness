// @vitest-environment jsdom
/**
 * Settings composition of the trace-graph plugin.
 *
 * 【变更】2026-10-06 (问题 1): the 轨迹图 toggle row moved from General
 * settings ('settings.general.item') INTO the 工作流 section
 * ('settings.workflow.item', order 5 — ahead of the 工作流图页签 row at
 * order 10). The 工作流 settings section (owned here) still declares the
 * child slot and now hosts both rows.
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

  it('keeps the 工作流 settings section declaring the workflow.item child slot', () => {
    const { ctx, registered } = fakeCtx()
    apply(ctx)
    const section = registered.find(options => options.name === 'settings.section')
    expect(section).toMatchObject({
      id: 'workflow',
      order: 20,
      children: { 'settings.workflow.item': { kind: 'list', scope: 'root' } },
    })
    // The section label still binds the workflow namespace dictionary.
    expect((section?.label as () => string)()).toBe('section.title')
  })
})
