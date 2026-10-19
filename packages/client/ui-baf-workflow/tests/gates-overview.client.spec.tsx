// @vitest-environment jsdom
/**
 * 【变更】2026-10-19 (流程图样式对齐批): the 确认门 tab renders the projection
 * on the 多模型路由-parity canvas — absolute node cards down column 0
 * (接单 → … → 归档 → 完成, 漂移回归 beside 实现, 已放弃 under it) joined by SVG
 * bezier edges WITH arrowheads, and every confirm gate as a pill ON the edge
 * it guards (entry gates + 分类 on 接单→建立变更; advance gates on their
 * node's leaving edge; resume/abandon stacked under their branch node). The
 * unanchored per-change gates ride fixed client-side anchors
 * (design-confirm→设计, verify-archive→验证, resume→漂移, abandon→已放弃).
 * 详 (default, the shared `Switch` control) adds the 门禁明细 section inside
 * the frame (gate options + full stage conditions + template edge
 * conditions); 略 keeps the canvas alone — pills carry titles +「一次性」
 * badges, nodes carry counts with every detail in the aria-label (the hover
 * Tooltip reads the same string). No config block.
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

/** Every canvas element (state node cards + gate pills) in DOM order. */
function flowCardIds(): string[] {
  const root = screen.getByTestId('baf-gates-flow')
  return Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="baf-gate-node-"], [data-testid^="baf-gates-gate-node-"]'))
    .map(el => el.getAttribute('data-testid') ?? '')
}

describe('GatesOverviewRow (2026-10-19 流程图样式对齐 canvas + 详略 Switch)', () => {
  it('renders collapsed and fetches nothing until the customer expands', () => {
    const load = vi.fn()
    mount(load)
    expect(screen.getByTestId('baf-gates-row')).toBeDefined()
    expect(screen.queryByTestId('baf-gates-flow')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('renders the whole chain as the route-style canvas with placed gates', async () => {
    const load = vi.fn().mockResolvedValue(overviewFixture())
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    expect(await screen.findByTestId('baf-gates-flow')).toBeDefined()
    // The canvas in DOM order: each column-0 node immediately followed by
    // the pills guarding its leaving edge (entry gates + 分类 after 接单,
    // advance gates after their node), then the branch column. No node is
    // ever dropped, gate-less or not.
    expect(flowCardIds()).toEqual([
      'baf-gate-node-intake',
      'baf-gates-gate-node-scaffold',
      'baf-gates-gate-node-new-workflow',
      'baf-gates-gate-node-active-conflict',
      'baf-gates-gate-node-bind-workflow',
      'baf-gates-gate-node-intake-classify',
      'baf-gate-node-open',
      'baf-gates-gate-node-open-advance',
      'baf-gates-gate-node-bugfix-open-advance',
      'baf-gate-node-clarify',
      'baf-gates-gate-node-clarify-advance',
      'baf-gate-node-design',
      'baf-gates-gate-node-design-advance',
      'baf-gates-gate-node-design-confirm',
      'baf-gate-node-plan',
      'baf-gates-gate-node-plan-advance',
      'baf-gate-node-implement',
      'baf-gates-gate-node-verify-advance',
      'baf-gate-node-verify',
      'baf-gates-gate-node-verify-archive',
      'baf-gate-node-archive',
      'baf-gate-node-completed',
      'baf-gate-node-drift',
      'baf-gates-gate-node-resume',
      'baf-gate-node-abandoned',
      'baf-gates-gate-node-abandon',
    ])
    expect(screen.getByTestId('baf-gates-branch').textContent).toContain('gates.branchTitle')
    // The bootstrap gate pills carry the「一次性」badge; the per-change 分类
    // pill does not.
    for (const id of ['scaffold', 'new-workflow', 'active-conflict', 'bind-workflow']) {
      expect(screen.getByTestId(`baf-gates-once-badge-${id}`).textContent).toBe('gates.onceBadge')
    }
    expect(screen.queryByTestId('baf-gates-once-badge-intake-classify')).toBeNull()
    // Unanchored per-change gates ride their fixed client-side anchors —
    // each pill sits on the anchored node's leaving edge / branch stack.
    expect(screen.getByTestId('baf-gates-gate-node-design-confirm').textContent).toContain('design-confirm 标题')
    expect(screen.getByTestId('baf-gates-gate-node-verify-archive').textContent).toContain('verify-archive 标题')
    expect(screen.getByTestId('baf-gates-gate-node-resume').textContent).toContain('resume 标题')
    expect(screen.getByTestId('baf-gates-gate-node-abandon').textContent).toContain('abandon 标题')
    // Every confirm gate keeps a full card in 详's 门禁明细 section.
    for (const gate of ['scaffold', 'intake-classify', 'open-advance', 'bugfix-open-advance', 'abandon', 'resume']) {
      expect(screen.getByTestId(`baf-gate-confirm-${gate}`)).toBeDefined()
    }
    // Stage rows render as the canvas nodes' meta line; the artifact shows.
    for (const node of ['open', 'clarify', 'design', 'plan', 'implement', 'verify']) {
      expect(screen.getByTestId(`baf-gate-stage-${node}`)).toBeDefined()
    }
    expect(screen.getByTestId('baf-gate-node-implement').textContent).toContain('plan.json')
    // 接单 now guards the entry pills (确认门 ×5); gate-less nodes like 归档
    // keep their card with the quiet 无门禁 accent line.
    expect(screen.getByTestId('baf-gate-node-intake').textContent).toContain('gates.confirmCount')
    expect(screen.getByTestId('baf-gate-node-archive').textContent).toContain('gates.noGate')
    expect(screen.getByTestId('baf-gate-node-completed').textContent).toContain('node.completed')
    // 详 (default) prints the template edge conditions in the detail groups.
    expect(screen.getByTestId('baf-gates-flow').textContent).toContain('T2 ·')
    // The route-parity SVG edges carry arrowheads (marker-end on every path).
    expect(document.querySelectorAll('svg path[marker-end]').length).toBeGreaterThan(0)
    // The「开关与阈值在配置文件」block is deleted in every mode; no dropdown —
    // the Switch stays the density control.
    expect(screen.queryByTestId('baf-gates-config')).toBeNull()
    expect(screen.queryByTestId('baf-gates-once')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('switch', { name: 'gates.modeAria' })).toBeDefined()
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

  it('略 mode keeps the canvas alone and moves the detail into the node hover/aria text', async () => {
    const load = vi.fn().mockResolvedValue(overviewFixture())
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    await screen.findByTestId('baf-gates-flow')
    setMode(true)
    // The 门禁明细 section is gone — full gate cards leave the flow; the
    // pills keep their title lines, and every detail rides the node's
    // aria-label (the hover Tooltip reads the same string).
    expect(screen.queryByTestId('baf-gate-confirm-open-advance')).toBeNull()
    expect(screen.queryByTestId('baf-gates-detail-node-open')).toBeNull()
    expect(screen.getByTestId('baf-gates-gate-node-intake-classify').textContent).toContain('intake-classify 标题')
    const openNode = screen.getByTestId('baf-gate-node-open')
    expect(openNode.getAttribute('aria-label')).toContain('open-advance 标题')
    expect(openNode.getAttribute('aria-label')).toContain('open 条件一')
    expect(openNode.textContent).not.toContain('/baf-workflow-confirm')
    // The gate-count accent and the stage condition count stay visible.
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
