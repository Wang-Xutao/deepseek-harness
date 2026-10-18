// @vitest-environment jsdom
/**
 * 【变更】2026-10-19 (六问题批 4.2): the 确认门 tab renders the projection as
 * ONE complete vertical card flow — state cards down the whole chain
 * (接单 → … → 归档 → 完成, then the 漂移回归 / 已放弃 branch cards), with the
 * one-shot gates as BETWEEN-state gate nodes right after 接单 (「一次性」badge
 * at the top-right) and the unanchored per-change gates riding fixed
 * client-side anchors (design-confirm→设计, verify-archive→验证, resume→漂移,
 * abandon→已放弃). 详 (default, the shared `Switch` control) prints the gate
 * options + stage conditions + connector edge conditions inline; 略 keeps the
 * badge line and moves every detail into the node's aria-label (the hover
 * Tooltip reads the same string). No pan/zoom canvas, no config block.
 * Collapsed by default in list context with load-once caching; the row
 * fixtures mirror the real registry (15 confirm + 6 stage rows).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

afterEach(cleanup)
import { GatesOverviewRow } from '../src/client/GatesOverviewRow.tsx'
import type { BafWorkflowGateOverview } from '../src/types.ts'

/** jsdom has no ResizeObserver; the Tooltip anchor measures through one. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

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

/** Flip the 详略 switch to the given side (the shared Switch primitive). */
function setMode(concise: boolean): void {
  const toggle = screen.getByRole('switch', { name: 'gates.modeAria' })
  // checked = 详; one click flips whichever way is needed.
  const wantsDetail = !concise
  if ((toggle.getAttribute('aria-checked') === 'true') !== wantsDetail) {
    fireEvent.click(toggle)
  }
}

/** Every flow card (state cards + between-state gate nodes) in DOM order. */
function flowCardIds(): string[] {
  const root = screen.getByTestId('baf-gates-flow')
  return Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="baf-gate-node-"], [data-testid^="baf-gates-gate-node-"]'))
    .map(el => el.getAttribute('data-testid') ?? '')
}

describe('GatesOverviewRow (六问题批 4.2 竖向完整流程 + 详略 Switch)', () => {
  it('renders collapsed and fetches nothing until the customer expands', () => {
    const load = vi.fn()
    mount(load)
    expect(screen.getByTestId('baf-gates-row')).toBeDefined()
    expect(screen.queryByTestId('baf-gates-flow')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('renders the whole chain as one vertical flow with placed gates', async () => {
    const load = vi.fn().mockResolvedValue(overviewFixture())
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    expect(await screen.findByTestId('baf-gates-flow')).toBeDefined()
    // The complete flow in order: 接单 → the one-shot gate nodes (registry
    // order, wherever the payload listed them) → 分类 confirm → the main
    // chain → 完成 → the branch cards. Nothing scrolls on its own and no
    // node is ever dropped, gate-less or not.
    expect(flowCardIds()).toEqual([
      'baf-gate-node-intake',
      'baf-gates-gate-node-scaffold',
      'baf-gates-gate-node-new-workflow',
      'baf-gates-gate-node-active-conflict',
      'baf-gates-gate-node-bind-workflow',
      'baf-gates-gate-node-intake-classify',
      'baf-gate-node-open',
      'baf-gate-node-clarify',
      'baf-gate-node-design',
      'baf-gate-node-plan',
      'baf-gate-node-implement',
      'baf-gate-node-verify',
      'baf-gate-node-archive',
      'baf-gate-node-completed',
      'baf-gate-node-drift',
      'baf-gate-node-abandoned',
    ])
    expect(screen.getByTestId('baf-gates-branch').textContent).toContain('gates.branchTitle')
    // The bootstrap gates carry the「一次性」badge; the per-change 分类
    // confirm does not.
    for (const id of ['scaffold', 'new-workflow', 'active-conflict', 'bind-workflow']) {
      expect(screen.getByTestId(`baf-gates-once-badge-${id}`).textContent).toBe('gates.onceBadge')
    }
    expect(screen.queryByTestId('baf-gates-once-badge-intake-classify')).toBeNull()
    // Unanchored per-change gates ride their fixed client-side anchors.
    expect(screen.getByTestId('baf-gate-node-design').textContent).toContain('design-confirm 标题')
    expect(screen.getByTestId('baf-gate-node-verify').textContent).toContain('verify-archive 标题')
    expect(screen.getByTestId('baf-gate-node-drift').textContent).toContain('resume 标题')
    expect(screen.getByTestId('baf-gate-node-abandoned').textContent).toContain('abandon 标题')
    // Every confirm gate keeps its testid (gate nodes + per-node alike).
    for (const gate of ['scaffold', 'intake-classify', 'open-advance', 'bugfix-open-advance', 'abandon', 'resume']) {
      expect(screen.getByTestId(`baf-gate-confirm-${gate}`)).toBeDefined()
    }
    // Stage rows render inside the state cards; the artifact chip shows.
    for (const node of ['open', 'clarify', 'design', 'plan', 'implement', 'verify']) {
      expect(screen.getByTestId(`baf-gate-stage-${node}`)).toBeDefined()
    }
    expect(screen.getByTestId('baf-gate-node-implement').textContent).toContain('plan.json')
    // Gate-less nodes keep their card with the quiet 无门禁 line.
    expect(screen.getByTestId('baf-gate-node-intake').textContent).toContain('gates.noGate')
    expect(screen.getByTestId('baf-gate-node-completed').textContent).toContain('node.completed')
    // 详 (default) prints the template edge conditions beside the connectors.
    expect(screen.getByTestId('baf-gates-flow').textContent).toContain('T2 ·')
    // The「开关与阈值在配置文件」block is deleted in every mode; no dropdown,
    // no canvas — the Switch stays the density control.
    expect(screen.queryByTestId('baf-gates-config')).toBeNull()
    expect(screen.queryByTestId('baf-gates-once')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('switch', { name: 'gates.modeAria' })).toBeDefined()
    expect(document.querySelectorAll('svg path[marker-end]').length).toBe(0)
    expect(load).toHaveBeenCalledTimes(1)
    // collapse → re-expand must NOT refetch (client-side cache).
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('parks unplaceable unanchored gates in the trailing fallback group', async () => {
    const fixture = overviewFixture()
    const unknown = {
      id: 'future-gate', title: 'future-gate 标题', question: 'future-gate 问题',
      options: [{ id: 'ok', label: '好', command: NOOP }],
    }
    fixture.confirmGates = [...fixture.confirmGates, unknown]
    const load = vi.fn().mockResolvedValue(fixture)
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    const fallback = await screen.findByTestId('baf-gates-once')
    expect(fallback.textContent).toContain('gates.onceTitle')
    expect(fallback.textContent).toContain('future-gate 标题')
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

  it('略 mode moves the detail into the node hover/aria text', async () => {
    const load = vi.fn().mockResolvedValue(overviewFixture())
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    await screen.findByTestId('baf-gates-flow')
    setMode(true)
    // Node-bound gate titles leave the flow text — they ride the hover
    // Tooltip's label string, which is ALSO the node's aria-label
    // (hover/focus/screen reader read one and the same text). The gate
    // NODES keep their title+question line (options still hidden).
    expect(screen.queryByTestId('baf-gate-confirm-open-advance')).toBeNull()
    expect(screen.getByTestId('baf-gate-confirm-intake-classify').textContent).toContain('intake-classify 标题')
    const openNode = screen.getByTestId('baf-gate-node-open')
    expect(openNode.getAttribute('aria-label')).toContain('open-advance 标题')
    expect(openNode.getAttribute('aria-label')).toContain('open 条件一')
    expect(openNode.textContent).not.toContain('/baf-workflow-confirm')
    // The badge counts and stage condition counts stay visible.
    expect(openNode.textContent).toContain('gates.confirmCount')
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
