// @vitest-environment jsdom
/**
 * 【变更】2026-10-12 (问题 4.1): the 工作流确认门 tab renders the projection
 * as ONE process-card flow — a one-shot gates card + one card per workflow
 * node (stage testid inside the node card), a 详细/简洁 dropdown (简洁 drops
 * options/commands and the config block), collapsed by default in list
 * context with load-once caching. The row fixtures mirror the real registry
 * (15 confirm + 6 stage rows).
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

function mount(
  loadGateOverview: () => Promise<BafWorkflowGateOverview>,
  embeddedInTab?: boolean,
) {
  // 'settings.workflow.item' is root-scoped — no session kit props needed.
  return render(
    <GatesOverviewRow
      t={t as never}
      loadGateOverview={loadGateOverview}
      embeddedInTab={embeddedInTab}
    />,
  )
}

describe('GatesOverviewRow (问题 4.1 流程卡片 + 详细/简洁)', () => {
  it('renders collapsed and fetches nothing until the customer expands', () => {
    const load = vi.fn()
    mount(load)
    expect(screen.getByTestId('baf-gates-row')).toBeDefined()
    expect(screen.queryByTestId('baf-gates-flow')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('loads once on first expand and renders the process-card flow', async () => {
    const load = vi.fn().mockResolvedValue(overviewFixture())
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    expect(await screen.findByTestId('baf-gates-flow')).toBeDefined()
    // One-shot gates sit in their own leading card; node cards carry the rest.
    expect(screen.getByTestId('baf-gates-once')).toBeDefined()
    expect(screen.getByTestId('baf-gate-node-open').textContent).toContain('gates.node.open')
    expect(screen.getByTestId('baf-gate-node-implement').textContent).toContain('plan.json')
    // Every confirm gate keeps its testid (one-shot + per-node alike).
    for (const gate of ['scaffold', 'intake-classify', 'open-advance', 'bugfix-open-advance', 'abandon', 'resume']) {
      expect(screen.getByTestId(`baf-gate-confirm-${gate}`)).toBeDefined()
    }
    // Stage rows render inside the node cards.
    for (const node of ['open', 'clarify', 'design', 'plan', 'implement', 'verify']) {
      expect(screen.getByTestId(`baf-gate-stage-${node}`)).toBeDefined()
    }
    // 【变更】2026-10-12 (web 复核): the pipeline NEVER drops gate-less nodes —
    // all nine render in workflow order, the empty ones saying so.
    const nodes = screen.getAllByTestId(/^baf-gate-node-/)
    expect(nodes.map(n => n.getAttribute('data-testid')?.slice('baf-gate-node-'.length)))
      .toEqual(['intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive', 'drift'])
    expect(screen.getByTestId('baf-gate-node-drift').textContent).toContain('gates.noGate')
    // 详细 (default) carries the config honesty block.
    expect(screen.getByTestId('baf-gates-config')).toBeDefined()
    expect(load).toHaveBeenCalledTimes(1)
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

  it('简洁 mode keeps gate lines but drops options, conditions, and the config block', async () => {
    const load = vi.fn().mockResolvedValue(overviewFixture())
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    await screen.findByTestId('baf-gates-flow')
    fireEvent.change(screen.getByTestId('baf-gates-mode'), { target: { value: 'concise' } })
    // Gate titles survive; commands and the config block do not.
    expect(screen.getByTestId('baf-gate-confirm-intake-classify').textContent).toContain('intake-classify 标题')
    expect(screen.queryByText('/baf-workflow-confirm')).toBeNull()
    expect(screen.queryByTestId('baf-gates-config')).toBeNull()
    // Stage lines collapse to the condition count.
    const openStage = screen.getByTestId('baf-gate-stage-open')
    expect(openStage.textContent).toContain('gates.conditionsCount')
    expect(openStage.textContent).not.toContain('open 条件一')
  })

  it('shows the load failure surface on a rejected fetch', async () => {
    const load = vi.fn().mockRejectedValue(new Error('remote down'))
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    const error = await screen.findByTestId('baf-gates-error')
    expect(error.textContent).toContain('gates.loadFailed')
    expect(error.textContent).toContain('remote down')
  })

  it('loads expanded on mount when embedded in the gates settings tab', async () => {
    const load = vi.fn().mockResolvedValue(overviewFixture())
    mount(load, true)
    expect(screen.queryByTestId('baf-gates-toggle')).toBeNull()
    expect(await screen.findByTestId('baf-gates-flow')).toBeDefined()
    expect(load).toHaveBeenCalledTimes(1)
  })
})
