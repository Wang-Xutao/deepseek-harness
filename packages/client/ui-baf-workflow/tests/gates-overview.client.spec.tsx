// @vitest-environment jsdom
/**
 * 【变更】2026-10-20 (批次五 2.2/2.3/2.6): the reader-side de-dup — the
 * bugfix-open-advance twin and the parked design-confirm re-pop no longer
 * render anywhere (pills, 明细, aria), the edge conditions print their
 * plain-zh text (no T-id prefix), and the 一次性 badges + legend item are
 * gone. The fixture still carries the twins so the assertions prove the
 * FILTER, not an empty input.
 * 【变更】2026-10-20 (批次三 4.5): the 详/略 switch is deleted — the flow is
 * always 详 as a left-right split: the route-parity canvas on the left, the
 * SELECTED node's 门禁明细 on the right (click a canvas card to select; the
 * default selection is the first node with anything to print). Every canvas
 * card is a button with aria-pressed; the node's aria-label still carries
 * its whole detail.
 * 【变更】2026-10-19 (流程图样式对齐批): the 确认门 tab renders the projection
 * on the 多模型路由-parity canvas — absolute node cards down column 0
 * (接单 → … → 归档 → 完成, 漂移回归 beside 实现, 已放弃 under it) joined by SVG
 * bezier edges WITH arrowheads, and every confirm gate as a pill ON the edge
 * it guards (entry gates + 分类 on 接单→建立变更; advance gates on their
 * node's leaving edge; resume/abandon stacked under their branch node). The
 * unanchored per-change gates ride fixed client-side anchors
 * (verify-archive→验证, resume→漂移, abandon→已放弃).
 * No config block.
 * Collapsed by default in list context with load-once caching; the row
 * fixtures mirror the real registry (15 confirm + 6 stage rows).
 * 【变更】2026-10-23 (批次十六 2.1/2.2/2.5): the intake branch block — 需求进入
 * → scaffold precondition → 三选一 exclusive case rows (condition chips + the
 * bootstrap pills) → the 分类 converge, all ABOVE the 接单 card; gate pills
 * are real buttons whose click opens THE GATE's 明细 group (确认门 fires
 * between states — the node group only counts them), and a 【…】-section
 * question renders segmented.
 * 【变更】2026-10-23 (批次十七 2.1/2.3): the branch block, take two — the
 * chips/caption/rail anatomy is REPLACED by a real flowchart: the prominent
 * 需求输入 entry box → scaffold pill → ONE horizontal row of three option
 * cards (each IS its 确认门 node: option text + the condition line ride the
 * card). The state node's 明细 no longer counts 确认门 either — the state
 * prints stage + entry conditions only.
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

/** Every canvas element (state node cards + gate pills) in DOM order. */
function flowCardIds(): string[] {
  const root = screen.getByTestId('baf-gates-flow')
  return Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="baf-gate-node-"], [data-testid^="baf-gates-gate-node-"]'))
    .map(el => el.getAttribute('data-testid') ?? '')
}

describe('GatesOverviewRow (2026-10-20 批次三 4.5 split canvas + selected detail)', () => {
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
    // The canvas in DOM order (批次十六 2.1): the intake BRANCH BLOCK leads —
    // 需求进入's scaffold pre-row pill, the three mutually-exclusive case-row
    // pills, then the 分类 pill that converges the new-workflow path — and
    // only then the chain: each column-0 node followed by the pills guarding
    // its leaving edge (advance gates after their node), then the branch
    // column. No node is ever dropped, gate-less or not.
    expect(flowCardIds()).toEqual([
      'baf-gates-gate-node-scaffold',
      'baf-gates-gate-node-new-workflow',
      'baf-gates-gate-node-active-conflict',
      'baf-gates-gate-node-bind-workflow',
      'baf-gates-gate-node-intake-classify',
      'baf-gate-node-intake',
      'baf-gate-node-open',
      'baf-gates-gate-node-open-advance',
      'baf-gate-node-clarify',
      'baf-gates-gate-node-clarify-advance',
      'baf-gate-node-design',
      'baf-gates-gate-node-design-advance',
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
    // 【变更】2026-10-20 (批次五 2.6): no 一次性 badge renders anywhere (the
    // fixture's bootstrap gates still exist — the badge is what vanished), and
    // the legend bar carries no once chip either.
    expect(document.querySelectorAll('[data-testid^="baf-gates-once-badge-"]')).toHaveLength(0)
    expect(screen.getByTestId('baf-gates-flow').textContent).not.toContain('一次性')
    // 【变更】2026-10-20 (批次五 2.2): the bugfix twin (bugFix: true) and the
    // parked design-confirm re-pop are filtered from every surface.
    expect(screen.queryByTestId('baf-gates-gate-node-bugfix-open-advance')).toBeNull()
    expect(screen.queryByTestId('baf-gates-gate-node-design-confirm')).toBeNull()
    // Unanchored per-change gates ride their fixed client-side anchors —
    // each pill sits on the anchored node's leaving edge / branch stack.
    expect(screen.getByTestId('baf-gates-gate-node-verify-archive').textContent).toContain('verify-archive 标题')
    expect(screen.getByTestId('baf-gates-gate-node-resume').textContent).toContain('resume 标题')
    expect(screen.getByTestId('baf-gates-gate-node-abandon').textContent).toContain('abandon 标题')
    // 【变更】2026-10-23 (批次十七 2.1): the intake branch block, take two — a
    // REAL flowchart: the prominent 需求输入 entry box, then ONE horizontal
    // row of three option cards (each IS its 确认门 node — the customer-facing
    // option text leads, the active-change condition rides under it). The
    // 批次十六 chip / caption / rail anatomy is gone.
    expect(screen.getByTestId('baf-gates-entry').textContent).toContain('gates.entryInput')
    expect(screen.queryByTestId('baf-gates-cond-scaffold')).toBeNull()
    expect(screen.queryByTestId('baf-gates-pick-caption')).toBeNull()
    expect(screen.queryByTestId('baf-gates-case-rail')).toBeNull()
    expect(screen.getByTestId('baf-gates-gate-node-new-workflow').textContent).toContain('gates.entryOptNone')
    expect(screen.getByTestId('baf-gates-gate-node-new-workflow').textContent).toContain('gates.entryCondNone')
    expect(screen.getByTestId('baf-gates-gate-node-active-conflict').textContent).toContain('gates.entryOptOne')
    expect(screen.getByTestId('baf-gates-gate-node-active-conflict').textContent).toContain('gates.entryCondOne')
    expect(screen.getByTestId('baf-gates-gate-node-bind-workflow').textContent).toContain('gates.entryOptMany')
    expect(screen.getByTestId('baf-gates-gate-node-bind-workflow').textContent).toContain('gates.entryCondMany')
    // 【变更】2026-10-20 (批次三 4.5) + 批次十六 2.5: the 门禁明细 column prints
    // exactly ONE group — the default selection is the first node with
    // anything to print (接单, via its T2 leaving-edge condition). The node
    // group NO LONGER prints gate cards — the bootstrap pills left the node
    // for the branch block, and every gate card now opens on its PILL click.
    expect(screen.getByTestId('baf-gates-detail-node-intake')).toBeDefined()
    expect(screen.queryByTestId('baf-gates-detail-node-open')).toBeNull()
    expect(screen.queryByTestId('baf-gate-confirm-scaffold')).toBeNull()
    expect(screen.queryByTestId('baf-gate-confirm-intake-classify')).toBeNull()
    // Clicking a canvas card selects it — 【变更】2026-10-23 (批次十七 2.3):
    // the node group no longer counts 确认门 at all (a gate fires BETWEEN
    // states, so the state prints stage + entry conditions only); clicking
    // the PILL opens the gate's own group.
    fireEvent.click(screen.getByTestId('baf-gate-node-open'))
    expect(screen.getByTestId('baf-gates-detail-node-open')).toBeDefined()
    expect(screen.queryByTestId('baf-gates-detail-node-intake')).toBeNull()
    expect(screen.getByTestId('baf-gate-node-open').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByTestId('baf-gates-detail-gates-open')).toBeNull()
    expect(screen.getByTestId('baf-gates-detail').textContent).not.toContain('gates.sectionConfirm')
    expect(screen.queryByTestId('baf-gate-confirm-open-advance')).toBeNull()
    fireEvent.click(screen.getByTestId('baf-gates-gate-node-open-advance'))
    expect(screen.getByTestId('baf-gates-detail-gate-open-advance')).toBeDefined()
    expect(screen.getByTestId('baf-gate-confirm-open-advance')).toBeDefined()
    expect(screen.queryByTestId('baf-gate-confirm-bugfix-open-advance')).toBeNull()
    expect(screen.queryByTestId('baf-gates-detail-node-open')).toBeNull()
    // The pill took the selection — its node yields the pressed state.
    expect(screen.getByTestId('baf-gate-node-open').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('baf-gates-gate-node-open-advance').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('baf-gate-node-intake').getAttribute('aria-pressed')).toBe('false')
    // Stage rows render as the canvas nodes' meta line; the artifact shows.
    for (const node of ['open', 'clarify', 'design', 'plan', 'implement', 'verify']) {
      expect(screen.getByTestId(`baf-gate-stage-${node}`)).toBeDefined()
    }
    expect(screen.getByTestId('baf-gate-node-implement').textContent).toContain('plan.json')
    // 接单's bootstrap pills moved to the branch block (批次十六 2.1) — the
    // card itself reads gate-less like 归档; the classify pill sits on the
    // converge INTO the card instead.
    expect(screen.getByTestId('baf-gate-node-intake').textContent).toContain('gates.noGate')
    expect(screen.getByTestId('baf-gate-node-archive').textContent).toContain('gates.noGate')
    expect(screen.getByTestId('baf-gate-node-completed').textContent).toContain('node.completed')
    // The selected node's group prints the leaving-edge template conditions
    // — 【变更】2026-10-20 (批次五 2.3): the plain-zh line, no T-id prefix.
    fireEvent.click(screen.getByTestId('baf-gate-node-intake'))
    expect(screen.getByTestId('baf-gates-detail').textContent).toContain('分类确认为新需求或高风险缺陷')
    expect(screen.getByTestId('baf-gates-detail').textContent).not.toContain('T2')
    // The route-parity SVG edges carry arrowheads (marker-end on every path).
    expect(document.querySelectorAll('svg path[marker-end]').length).toBeGreaterThan(0)
    // The「开关与阈值在配置文件」block stays deleted; the 详/略 switch is gone
    // too (批次三 4.5) — no switch, no dropdown anywhere.
    expect(screen.queryByTestId('baf-gates-config')).toBeNull()
    expect(screen.queryByTestId('baf-gates-once')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
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
    // 【变更】2026-10-23 (批次十六 2.5): gate cards open on their PILL click —
    // the 分类 pill opens the classify card (was: intake's inline card).
    fireEvent.click(await screen.findByTestId('baf-gates-gate-node-intake-classify'))
    const classify = screen.getByTestId('baf-gate-confirm-intake-classify')
    expect(classify.textContent).toContain('gates.sentinelNoop')
    // real commands render verbatim.
    expect(classify.textContent).toContain('/baf-workflow-confirm')
    // dynamic-option gates say so instead of an empty cell.
    fireEvent.click(screen.getByTestId('baf-gates-gate-node-bind-workflow'))
    expect(screen.getByTestId('baf-gate-dynamic-bind-workflow').textContent).toContain('gates.dynamicOptions')
    // verify-advance rides 实现's leaving edge — its pill opens the card.
    fireEvent.click(screen.getByTestId('baf-gates-gate-node-verify-advance'))
    const verifyAdvance = await screen.findByTestId('baf-gate-confirm-verify-advance')
    expect(verifyAdvance.textContent).toContain('gates.sentinelContinued')
  })

  it('renders the gate question as 【…】 sections, not one run-on paragraph (批次十六 2.2)', async () => {
    const fixture = overviewFixture()
    const advance = fixture.confirmGates.find(gate => gate.id === 'clarify-advance')
    if (advance === undefined) throw new Error('fixture lost clarify-advance')
    advance.question = [
      '{{change:change-a}}',
      '【状态变化】提案（已完成，通过完成门）→ 澄清（待开始）',
      '【完成情况】',
      '- Why / Scope / Impact 均已填写',
      '- 澄清文档已就绪',
      '【确认后】',
      '- 系统装好澄清文档模板，模型填写',
      '- 填好后自动弹下一次确认卡',
    ].join('\n\n')
    const load = vi.fn().mockResolvedValue(fixture)
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    await screen.findByTestId('baf-gates-flow')
    // The pill's aria-label carries the full detail (title + body + options).
    const pill = screen.getByTestId('baf-gates-gate-node-clarify-advance')
    expect(pill.getAttribute('aria-label')).toContain('gates.sectionConfirm · clarify-advance 标题')
    expect(pill.getAttribute('aria-label')).toContain('【确认后】')
    // The card body segments: one section per 【…】 heading, list rows fold
    // into list blocks, the {{change:}} marker peels into the chip (never a
    // body paragraph). Untitled-lead-in absence is fine (question starts
    // with the marker).
    fireEvent.click(pill)
    const body = screen.getByTestId('baf-gate-question-clarify-advance')
    expect(body.textContent).toContain('状态变化')
    expect(body.textContent).toContain('提案（已完成，通过完成门）→ 澄清（待开始）')
    expect(body.textContent).toContain('完成情况')
    expect(body.textContent).toContain('Why / Scope / Impact 均已填写')
    expect(body.textContent).toContain('确认后')
    expect(body.textContent).toContain('填好后自动弹下一次确认卡')
    expect(body.textContent).not.toContain('{{change:')
    // Plain questions (no 【…】 heading) keep the flat fallback body.
    fireEvent.click(screen.getByTestId('baf-gates-gate-node-new-workflow'))
    const plain = screen.getByTestId('baf-gate-confirm-new-workflow')
    expect(plain.textContent).toContain('new-workflow 问题')
    expect(screen.queryByTestId('baf-gate-question-new-workflow')).toBeNull()
  })

  it('keeps every node detail in the aria-label while the column shows one node', async () => {
    const load = vi.fn().mockResolvedValue(overviewFixture())
    mount(load)
    fireEvent.click(screen.getByTestId('baf-gates-toggle'))
    await screen.findByTestId('baf-gates-flow')
    // Selecting 实现 prints its stage + entry conditions in the right column,
    // and only that group renders. 【变更】2026-10-23 (批次十七 2.3): the node
    // aria-label dropped the gate titles too — the pill carries its own.
    fireEvent.click(screen.getByTestId('baf-gate-node-implement'))
    expect(screen.getByTestId('baf-gates-detail-node-implement')).toBeDefined()
    expect(screen.queryByTestId('baf-gates-detail-node-intake')).toBeNull()
    expect(screen.getByTestId('baf-gates-detail').textContent).toContain('implement 条件一')
    fireEvent.click(screen.getByTestId('baf-gates-gate-node-verify-advance'))
    expect(screen.getByTestId('baf-gate-confirm-verify-advance').textContent).toContain('/baf-workflow-advance')
    // The canvas card's meta stays a COUNT — full conditions only in the
    // column — while the aria-label still carries the state detail.
    expect(screen.getByTestId('baf-gate-stage-implement').textContent).toContain('gates.conditionsCount')
    expect(screen.getByTestId('baf-gate-stage-implement').textContent).not.toContain('implement 条件一')
    expect(screen.getByTestId('baf-gate-node-implement').getAttribute('aria-label')).not.toContain('verify-advance 标题')
    expect(screen.getByTestId('baf-gate-node-implement').getAttribute('aria-label')).toContain('implement 条件一')
    // The branch nodes select too — 漂移回归's recovery-edge conditions print;
    // its stacked resume card opens on the resume pill.
    fireEvent.click(screen.getByTestId('baf-gate-node-drift'))
    expect(screen.getByTestId('baf-gates-detail-node-drift')).toBeDefined()
    fireEvent.click(screen.getByTestId('baf-gates-gate-node-resume'))
    expect(screen.getByTestId('baf-gate-confirm-resume')).toBeDefined()
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
