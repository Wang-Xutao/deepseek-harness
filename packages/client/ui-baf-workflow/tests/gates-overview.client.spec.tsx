// @vitest-environment jsdom
/**
 * 【变更】2026-10-07 (九点批 问题 9): the 门禁总览 settings row — collapsed by
 * default, first expand loads the projection once (collapse/re-expand never
 * refetches), both gate tables render with sentinel commands localized, and
 * the 配置开关 honesty block names the three config files. The row count
 * fixtures mirror the real registry (15 confirm + 6 stage rows).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

afterEach(cleanup)
import { GatesOverviewRow } from '../src/client/GatesOverviewRow.tsx'
import type { BafWorkflowGateOverview } from '../src/types.ts'

function t(key: string): string {
  return key
}

const NOOP = '__noop__'
const CONTINUED = '__continued__'

/** Fixture shaped like the real projection: 15 confirm + 6 stage rows. */
function overviewFixture(): BafWorkflowGateOverview {
  const confirm = (id: string, options: { id: string; label: string; command: string }[], node?: string, bugFix?: boolean) => ({
    id, title: `${id} 标题`, question: `${id} 问题`, options,
    ...(node === undefined ? {} : { node }),
    ...(bugFix === true ? { bugFix: true } : {}),
  })
  const option = (id: string, label: string, command: string) => ({ id, label, command })
  return {
    confirmGates: [
      confirm('scaffold', [option('confirm', '确认初始化', '/baf-scaffold')]),
      confirm('new-workflow', [option('confirm', '确认', '/baf-workflow-begin')]),
      confirm('intake-classify', [
        option('confirm-full', '确认完整流程', '/baf-workflow-confirm'),
        option('confirm-bugfix', '确认缺陷修复', '/baf-workflow-confirm'),
        option('reject', '拒绝', NOOP),
      ]),
      confirm('active-conflict', [option('abandon', '放弃现有变更', '/baf-workflow-abandon')]),
      { ...confirm('bind-workflow', []), dynamicOptions: 'change-targets' },
      confirm('open-advance', [option('confirm', '确认推进', '/baf-workflow-advance'), option('later', '暂不推进', NOOP)], 'open'),
      confirm('bugfix-open-advance', [option('confirm', '确认推进', '/baf-workflow-advance')], 'open', true),
      confirm('clarify-advance', [option('confirm', '确认推进', '/baf-workflow-advance')], 'clarify'),
      confirm('design-advance', [option('confirm', '确认推进', '/baf-workflow-advance')], 'design'),
      confirm('plan-advance', [option('confirm', '确认推进', '/baf-workflow-advance')], 'plan'),
      confirm('verify-advance', [option('confirm', '确认推进', '/baf-workflow-advance'), option('continued', '继续', CONTINUED)], 'implement'),
      confirm('design-confirm', [option('confirm', '确认设计', '/baf-workflow-advance')]),
      confirm('verify-archive', [option('confirm', '确认归档', '/baf-workflow-archive')]),
      confirm('abandon', [option('confirm', '确认放弃', '/baf-workflow-abandon')]),
      confirm('resume', [option('resume', '恢复', '/baf-resume')]),
    ],
    stageGates: ['open', 'clarify', 'design', 'plan', 'implement', 'verify'].map(node => ({
      node,
      gateFn: `${node}Gate`,
      artifact: node === 'plan' || node === 'implement' ? 'plan.json' : `${node}.md`,
      conditions: [`${node} 条件一`, `${node} 条件二`],
      advanceGateId: node === 'verify' ? 'verify-archive' : `${node === 'implement' ? 'verify' : node}-advance`,
    })),
  }
}

function mount(loadGateOverview: () => Promise<BafWorkflowGateOverview>) {
  // 'settings.workflow.item' is root-scoped — no session kit props needed.
  return render(
    <GatesOverviewRow t={t as never} loadGateOverview={loadGateOverview} />,
  )
}

describe('GatesOverviewRow (九点批 问题 9 门禁总览只读行)', () => {
  it('renders collapsed and fetches nothing until the customer expands', () => {
    const load = vi.fn()
    mount(load)
    expect(screen.getByTestId('baf-gates-row')).toBeDefined()
    expect(screen.queryByTestId('baf-gates-confirm')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('loads once on first expand and renders both layers with the config block', async () => {
    const load = vi.fn().mockResolvedValue(overviewFixture())
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    expect(await screen.findByTestId('baf-gates-confirm')).toBeDefined()
    expect(screen.getByTestId('baf-gates-stage')).toBeDefined()
    expect(screen.getByTestId('baf-gates-config')).toBeDefined()
    expect(load).toHaveBeenCalledTimes(1)
    // 15 confirm rows + 6 stage rows, one testid each.
    for (const gate of ['scaffold', 'intake-classify', 'open-advance', 'abandon', 'resume']) {
      expect(screen.getByTestId(`baf-gate-confirm-${gate}`)).toBeDefined()
    }
    for (const node of ['open', 'clarify', 'design', 'plan', 'implement', 'verify']) {
      expect(screen.getByTestId(`baf-gate-stage-${node}`)).toBeDefined()
    }
    // collapse → re-expand must NOT refetch (client-side cache).
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('localizes sentinel commands (noop / continued dispatch nothing)', async () => {
    const load = vi.fn().mockResolvedValue(overviewFixture())
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    const classify = await screen.findByTestId('baf-gate-confirm-intake-classify')
    expect(classify.textContent).toContain('gates.sentinelNoop')
    const verifyAdvance = await screen.findByTestId('baf-gate-confirm-verify-advance')
    expect(verifyAdvance.textContent).toContain('gates.sentinelContinued')
    // real commands render verbatim.
    expect(classify.textContent).toContain('/baf-workflow-confirm')
    // dynamic-option gates say so instead of an empty cell.
    expect(screen.getByTestId('baf-gate-dynamic-bind-workflow').textContent).toContain('gates.dynamicOptions')
  })

  it('shows the load failure surface on a rejected fetch', async () => {
    const load = vi.fn().mockRejectedValue(new Error('remote down'))
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    const error = await screen.findByTestId('baf-gates-error')
    expect(error.textContent).toContain('gates.loadFailed')
    expect(error.textContent).toContain('remote down')
  })
})
