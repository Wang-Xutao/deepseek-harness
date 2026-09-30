/**
 * §18.4.2 `/baf-go` work-order dispatch — the pure half.
 *
 * The shipped bug these pin (2026-09-22, workspace `demo_1`): the workflow
 * rested at "the model must author `clarify.md`" and nothing woke the model, so
 * `/baf-go` only re-rendered the same refusal card and the customer read it as
 * a crash. The dispatch module builds the order that rest needs and refuses to
 * send the same order twice.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  artifactPathFor,
  expireDispatchLedger,
  makeGoDispatcher,
  resetDispatchLedger,
  workOrderMessage,
  workOrderText,
  type DispatchSignal,
} from '../src/go-dispatch.ts'

/** The stuck case, verbatim: clarify's gate refusal on an unfilled template. */
const CLARIFY_GAP: DispatchSignal = {
  changeId: 'change-20260922-ecum-7897',
  node: 'clarify',
  artifactPath: artifactPathFor('change-20260922-ecum-7897', 'clarify'),
  missing: ['## Acceptance criteria 节缺失：每条要能落成命令或可观测行为'],
}

/** An agent double recording every queued message. */
function recorder(status: 'idle' | 'running' = 'idle') {
  const sent: unknown[] = []
  return {
    sent,
    agent: {
      status,
      followup: vi.fn((message: unknown) => { sent.push(message) }),
    },
  }
}

describe('workOrderText', () => {
  it('names the change, the stage, the artifact and every missing item', () => {
    const text = workOrderText(CLARIFY_GAP)
    expect(text).toContain('【BAF 工单 · /baf-go 派单】')
    expect(text).toContain('变更：change-20260922-ecum-7897')
    expect(text).toContain('阶段：clarify')
    expect(text).toContain('产物：openspec/changes/change-20260922-ecum-7897/clarify.md')
    expect(text).toContain('- ## Acceptance criteria 节缺失：每条要能落成命令或可观测行为')
  })

  it('restates the stage gate as the completion condition, without repeating a missing item', () => {
    const text = workOrderText(CLARIFY_GAP)
    // `DOC_REQUIREMENTS_ZH.clarify` has two rows, neither of which is the
    // gate's own missing line — both are restated.
    expect(text).toContain('完成条件（裁决门）：')
    expect(text).toContain('- clarify.md 有实际内容（不是 TODO 模板占位）')
    expect(text.split('- ## Acceptance criteria 节缺失：每条要能落成命令或可观测行为')).toHaveLength(2)
  })

  it('collapses the work list and the conditions when they are the same lines', () => {
    // The template-installed rest passes the requirements table itself as the
    // gap — the order must not print the same line twice.
    const signal: DispatchSignal = {
      ...CLARIFY_GAP,
      missing: [
        'clarify.md 有实际内容（不是 TODO 模板占位）',
        '含 ## Acceptance criteria 节，每条可用命令或行为验证',
      ],
    }
    const text = workOrderText(signal)
    expect(text).toContain('缺什么（逐项补齐）：')
    expect(text).not.toContain('完成条件（裁决门）：')
  })

  it('quotes implementGate as the implement condition (the doc table has no implement row)', () => {
    const text = workOrderText({
      changeId: 'c-1',
      node: 'implement',
      artifactPath: artifactPathFor('c-1', 'implement'),
      missing: ['plan.json：1/3 个任务已 done——完成剩余任务并把 done 标为 true'],
    })
    expect(text).toContain('产物：openspec/changes/c-1/plan.json')
    // 【变更】2026-09-30 (demo33 问题 1): the ledger is mode-named — the
    // condition copy names both files instead of plan.json alone.
    expect(text).toContain('- 实现账本（plan.json / bug-fix-path-ledger.json）里每个任务的 done 标为 true（剩余任务做完并标记）')
    expect(text).toContain('- 改动文件全部在实现账本的 allowlist 内')
  })

  it('marks a T11 fix loop as a verification failure', () => {
    const text = workOrderText({
      changeId: 'c-1',
      node: 'implement',
      artifactPath: artifactPathFor('c-1', 'implement'),
      missing: ['test: expected 3 rows, got 2'],
      cause: 'verify-failed',
    })
    expect(text).toContain('【BAF 工单 · /baf-go 派单 · 验证未通过】')
    expect(text).toContain('- test: expected 3 rows, got 2')
  })

  // 【变更】2026-09-26 (用户需求 工作流 3): a bug-fix open rest's order quotes
  // the bug-record (clipped proposal) completion conditions.
  // 【变更】2026-09-30 (demo31 问题 4): the artifact file itself is proposal.md
  // on both modes — only the conditions fork on mode now.
  it('routes a bug-fix open order at proposal.md with the clipped conditions', () => {
    const signal: DispatchSignal = {
      changeId: 'c-bug',
      node: 'open',
      artifactPath: artifactPathFor('c-bug', 'open'),
      missing: ['Root cause：诊断出的根因（为什么会出现这个 Bug）'],
      mode: 'bug-fix-path',
    }
    const text = workOrderText(signal)
    expect(text).toContain('产物：openspec/changes/c-bug/proposal.md')
    expect(text).toContain('- Impact scope 节列出预期要改的文件（每行一个 - 路径，不是文字描述）')
    expect(text).toContain('- Regression test 节写回归测试文件路径与可执行的运行命令')
    expect(text).toContain('- proposal.md 的 Root cause 节写清诊断出的根因（不是 TODO / 待定位 占位）')
  })

  it('still names a gap when the gate reported no missing items', () => {
    const text = workOrderText({ ...CLARIFY_GAP, missing: [] })
    expect(text).toContain('缺什么：产物未达该阶段裁决门')
  })

  it('carries the four execution rules that keep the model inside the workflow', () => {
    const text = workOrderText(CLARIFY_GAP)
    expect(text).toContain('直接编辑上方产物补齐，不要另建文件')
    expect(text).toContain('补齐后立即结束本回合')
    expect(text).toContain('baf_question_ask')
    expect(text).toContain('本工单由客户敲 /baf-go 生成（客户已授权）')
  })
})

describe('artifactPathFor', () => {
  it('points every stage at the file its gate actually reads', () => {
    expect(artifactPathFor('c-1', 'open')).toBe('openspec/changes/c-1/proposal.md')
    expect(artifactPathFor('c-1', 'clarify')).toBe('openspec/changes/c-1/clarify.md')
    expect(artifactPathFor('c-1', 'design')).toBe('openspec/changes/c-1/design.md')
    expect(artifactPathFor('c-1', 'plan')).toBe('openspec/changes/c-1/plan.json')
    // implementGate judges the ledger inside plan.json, not tasks.md.
    expect(artifactPathFor('c-1', 'implement')).toBe('openspec/changes/c-1/plan.json')
  })

  // 【变更】2026-09-30 (demo31 问题 4): bug-fix-path's open artifact IS
  // proposal.md now (bug-record.md is gone) — every stage's file is
  // mode-independent, so the old mode-fork test collapsed into the one above
  // and `artifactPathFor` lost its `mode` parameter.
})

describe('workOrderMessage', () => {
  it('is baf-workflow-sourced with the go-dispatch form — never the customer\'s own words', () => {
    const message = workOrderMessage(CLARIFY_GAP)
    expect(message.role).toBe('user')
    expect(message.source).toMatchObject({
      kind: 'baf-workflow',
      form: 'go-dispatch',
      changeId: 'change-20260922-ecum-7897',
      node: 'clarify',
      missing: CLARIFY_GAP.missing,
    })
    expect(message.content).toEqual([{ type: 'text', text: workOrderText(CLARIFY_GAP) }])
  })
})

describe('makeGoDispatcher', () => {
  it('cannot be built without a live agent face', () => {
    expect(makeGoDispatcher('D:/ws', undefined)).toBeUndefined()
    expect(makeGoDispatcher('D:/ws', { status: 'idle' })).toBeUndefined()
  })

  it('queues one order and reports it sent', () => {
    resetDispatchLedger()
    const { agent, sent } = recorder()
    const dispatch = makeGoDispatcher('D:/ws', agent)
    expect(dispatch?.(CLARIFY_GAP)).toBe('sent')
    expect(agent.followup).toHaveBeenCalledTimes(1)
    // Compared field-wise: every order is a freshly identified message.
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      role: 'user',
      content: workOrderMessage(CLARIFY_GAP).content,
      source: workOrderMessage(CLARIFY_GAP).source,
    })
  })

  it('dedupes the identical gap and re-arms when the gap shrinks', () => {
    resetDispatchLedger()
    const { agent, sent } = recorder()
    const dispatch = makeGoDispatcher('D:/ws', agent)
    expect(dispatch?.(CLARIFY_GAP)).toBe('sent')
    expect(dispatch?.(CLARIFY_GAP)).toBe('deduped')
    expect(sent).toHaveLength(1)
    // The model filled one item: a smaller gap is a different gap.
    const shrunk: DispatchSignal = { ...CLARIFY_GAP, missing: [] }
    expect(dispatch?.(shrunk)).toBe('sent')
    expect(sent).toHaveLength(2)
  })

  it('2026-09-23 issue #4: the completed-turn expiry re-arms the SAME gap for its workspace only', () => {
    // The shipped bug: the ledger was permanent, so a dispatched turn that
    // ENDED with the gap still open left every later /baf-go answering
    // 「已派单 · 等待补齐」 while the model idled — free text was the only
    // escape. The orchestrator now expires the workspace's entries at every
    // turn end; the same gap dispatches again.
    resetDispatchLedger()
    const first = recorder()
    const dispatch = makeGoDispatcher('D:/ws-a', first.agent)
    expect(dispatch?.(CLARIFY_GAP)).toBe('sent')
    expect(dispatch?.(CLARIFY_GAP)).toBe('deduped')
    expireDispatchLedger('D:/ws-a')
    expect(dispatch?.(CLARIFY_GAP)).toBe('sent')
    expect(first.sent).toHaveLength(2)

    // Another workspace's ledger is untouched by the expiry.
    const other = recorder()
    const otherDispatch = makeGoDispatcher('D:/ws-b', other.agent)
    expect(otherDispatch?.(CLARIFY_GAP)).toBe('sent')
    expect(otherDispatch?.(CLARIFY_GAP)).toBe('deduped')
    expireDispatchLedger('D:/ws-a')
    expect(otherDispatch?.(CLARIFY_GAP)).toBe('deduped')
    expect(other.sent).toHaveLength(1)
  })

  it('scopes the ledger per workspace and per change', () => {
    resetDispatchLedger()
    const first = recorder()
    const second = recorder()
    makeGoDispatcher('D:/ws-a', first.agent)?.(CLARIFY_GAP)
    makeGoDispatcher('D:/ws-b', second.agent)?.(CLARIFY_GAP)
    expect(first.sent).toHaveLength(1)
    expect(second.sent).toHaveLength(1)
    const other = recorder()
    makeGoDispatcher('D:/ws-a', other.agent)?.({ ...CLARIFY_GAP, changeId: 'c-2' })
    expect(other.sent).toHaveLength(1)
  })

  it('2026-09-23: scopes the ledger per SESSION — an order parked in one session cannot silence another', () => {
    // The live bug: run 1's order sat in session A (its turn parked on a
    // question dialog); run 2's /baf-go in session B deduped against it and
    // the flow looked dead in the new session.
    resetDispatchLedger()
    const agentA = recorder().agent
    const dispatchA = makeGoDispatcher('D:/ws', agentA)
    expect(dispatchA?.(CLARIFY_GAP)).toBe('sent')
    const seen: unknown[] = []
    const dispatchB = makeGoDispatcher('D:/ws', {
      status: 'idle',
      session: { header: { id: 'session-b' } },
      followup: (message: unknown) => { seen.push(message) },
    })
    expect(dispatchB?.(CLARIFY_GAP)).toBe('sent')
    expect(seen).toHaveLength(1)
    // Session A's own dispatcher still dedupes its own order.
    expect(dispatchA?.(CLARIFY_GAP)).toBe('deduped')
  })

  it('re-arms after a reset (the test seam, not a live path)', () => {
    const { agent, sent } = recorder()
    const dispatch = makeGoDispatcher('D:/ws-reset', agent)
    expect(dispatch?.(CLARIFY_GAP)).toBe('sent')
    resetDispatchLedger()
    expect(dispatch?.(CLARIFY_GAP)).toBe('sent')
    expect(sent).toHaveLength(2)
  })

  it('refuses to queue into a turn that is already running', () => {
    resetDispatchLedger()
    const { agent, sent } = recorder('running')
    const dispatch = makeGoDispatcher('D:/ws', agent)
    expect(dispatch?.(CLARIFY_GAP)).toBe('busy')
    expect(sent).toHaveLength(0)
    // Busy is not a send: the ledger stays unarmed, so the next idle /baf-go
    // still dispatches this gap.
    ;(agent as { status: string }).status = 'idle'
    expect(dispatch?.(CLARIFY_GAP)).toBe('sent')
    expect(sent).toHaveLength(1)
  })
})
