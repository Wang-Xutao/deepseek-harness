/**
 * 【变更】2026-10-27 (同步产物): the artifact-drift detector and the ledger
 * scope split.
 *
 * The shipped bug the drift half pins: the customer edits `proposal.md` AFTER
 * `design.md` was written, and nothing noticed — every gate judges a document
 * on its own shape, so the change still walked to archive while the shipped
 * documents contradicted each other.
 *
 * The shipped bug the scope half pins: a customer-typed `/baf-go` could never
 * re-dispatch an unchanged gap. The orchestrator expires the dispatch ledger at
 * a turn's START and sends its turn-end order at the turn's END, so the
 * turn-end order re-armed the very key the customer's next command reads —
 * that command then deduped and sent NOTHING, and the only escape was free
 * text. The customer's orders and the host's turn-end order now live in
 * separate ledger scopes.
 *
 * 【变更】2026-10-28 (批次三十五 · 用户问题 1): the detector judges only
 * COMPLETED stages, against the `stage-completed` event's time. Every call
 * now carries the change's events, and the fixtures stamp completions the
 * way a real drive would — the stage settles when its gate passed, and only
 * an upstream AUTHORED write that lands AFTER that (and after the target's
 * own last write) is a desync.
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectionEvent } from '@deepseek-ai/dsh-baf-core'
import {
  detectArtifactDrift,
  driftArtifactPath,
  driftWorkLines,
  isDriftStage,
} from '../src/stages/artifact-drift.ts'
import { buildWorkflowTabView } from '../src/tab-view.ts'
import { createWorkflowService } from '../src/workflow-service.ts'
import { ProjectionStore } from '../src/projection.ts'
import {
  expireDispatchLedger,
  makeGoDispatcher,
  resetDispatchLedger,
  workOrderText,
  type DispatchSignal,
} from '../src/go-dispatch.ts'

const execFileAsync = promisify(execFile)

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** A base timestamp far from any real write, so the mtimes stay ordered. */
const BASE_MS = 1_700_000_000_000

/** One minute between two artifacts — coarse enough for any filesystem stamp. */
const STEP_MS = 60_000

/** The change id every fixture writes into. */
const CHANGE_ID = 'change-drift-1'

/**
 * 【变更】2026-10-28 (批次三十五): one `stage-completed` event — the only
 * field the detector folds is `at`.
 * @param node - the stage that settled.
 * @param atMs - when the stage completed (epoch ms).
 * @returns the event.
 */
function stageCompleted(
  node: 'open' | 'clarify' | 'design' | 'plan' | 'implement' | 'verify',
  atMs: number,
): ProjectionEvent {
  return {
    type: 'stage-completed',
    node,
    artifacts: [],
    eventId: `spec-${node}-${atMs}`,
    seq: atMs,
    at: new Date(atMs).toISOString(),
  }
}

/**
 * Write one change artifact with an exact mtime.
 * @param root - workspace root.
 * @param file - artifact file name.
 * @param mtimeMs - the modification time to stamp.
 */
async function writeArtifact(root: string, file: string, mtimeMs: number): Promise<void> {
  const dir = join(root, 'openspec', 'changes', CHANGE_ID)
  await mkdir(dir, { recursive: true })
  const path = join(dir, file)
  await writeFile(path, `# ${file}\n`, 'utf8')
  await utimes(path, new Date(mtimeMs), new Date(mtimeMs))
}

/** An empty workspace (no change directory at all). */
async function workspace(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'baf-drift-'))
}

/** Remove a temp workspace (best effort). */
async function cleanup(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
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

/** The clarify gap the scope specs dispatch (the go-dispatch spec's fixture). */
const CLARIFY_GAP: DispatchSignal = {
  changeId: 'change-scope-1',
  node: 'clarify',
  artifactPath: 'openspec/changes/change-scope-1/clarify.md',
  missing: ['## Acceptance criteria 节缺失：每条要能落成命令或可观测行为'],
}

describe('detectArtifactDrift', () => {
  it('reports nothing when every artifact is at least as new as the one before it', async () => {
    const root = await workspace()
    try {
      await writeArtifact(root, 'proposal.md', BASE_MS)
      await writeArtifact(root, 'clarify.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS + 2 * STEP_MS)
      await writeArtifact(root, 'plan.md', BASE_MS + 3 * STEP_MS)
      await writeArtifact(root, 'plan.json', BASE_MS + 4 * STEP_MS)
      await writeArtifact(root, 'checklist.md', BASE_MS + 5 * STEP_MS)
      const events = [
        stageCompleted('open', BASE_MS),
        stageCompleted('clarify', BASE_MS + STEP_MS),
        stageCompleted('design', BASE_MS + 2 * STEP_MS),
        stageCompleted('plan', BASE_MS + 3 * STEP_MS),
        stageCompleted('implement', BASE_MS + 4 * STEP_MS),
        stageCompleted('verify', BASE_MS + 5 * STEP_MS),
      ]
      expect(await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)).toEqual([])
    } finally {
      await cleanup(root)
    }
  })

  it('names the stale document and the newer upstream one when an upstream edit lands late', async () => {
    const root = await workspace()
    try {
      // The customer re-edited proposal.md after design.md was written.
      await writeArtifact(root, 'proposal.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS)
      const events = [
        // open settled before the customer's edit; design settled at its own
        // write, so the re-edit (BASE + STEP) is later than both.
        stageCompleted('open', BASE_MS - STEP_MS),
        stageCompleted('design', BASE_MS),
      ]
      const rows = await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        node: 'design',
        file: 'design.md',
        sourceNode: 'open',
        sourceFile: 'proposal.md',
      })
      expect(rows[0]?.mtimeMs).toBeLessThan(rows[0]?.sourceMtimeMs ?? 0)
    } finally {
      await cleanup(root)
    }
  })

  it('pairs a stale document with the NEWEST upstream one, not the first', async () => {
    const root = await workspace()
    try {
      await writeArtifact(root, 'proposal.md', BASE_MS)
      await writeArtifact(root, 'clarify.md', BASE_MS + 2 * STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS + STEP_MS)
      const events = [
        stageCompleted('open', BASE_MS),
        stageCompleted('clarify', BASE_MS + 2 * STEP_MS),
        stageCompleted('design', BASE_MS + STEP_MS),
      ]
      const rows = await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        node: 'design',
        file: 'design.md',
        sourceNode: 'clarify',
        sourceFile: 'clarify.md',
      })
    } finally {
      await cleanup(root)
    }
  })

  it('keeps the earlier upstream when two of them share the newest stamp', async () => {
    const root = await workspace()
    try {
      await writeArtifact(root, 'proposal.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'clarify.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS)
      const events = [
        stageCompleted('open', BASE_MS - STEP_MS),
        stageCompleted('clarify', BASE_MS + STEP_MS),
        stageCompleted('design', BASE_MS),
      ]
      const rows = await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ node: 'design', sourceNode: 'open', sourceFile: 'proposal.md' })
    } finally {
      await cleanup(root)
    }
  })

  it('does not report drift when one stage\'s own documents were written in an arbitrary order', async () => {
    const root = await workspace()
    try {
      // 【变更】2026-10-28 (批次三十三 · 用户问题 1): plan.md and tasks.md are
      // RENDERED from the ledger, so ticking a task re-writes them and their
      // mtime jumps past the documents that came after. Here plan.md is the
      // newest file of the whole change — the old rule read that as "the plan
      // was edited after the ledger" and reported the change as out of sync on
      // a change nobody had touched.
      await writeArtifact(root, 'proposal.md', BASE_MS)
      await writeArtifact(root, 'clarify.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS + 2 * STEP_MS)
      await writeArtifact(root, 'plan.json', BASE_MS + 3 * STEP_MS)
      await writeArtifact(root, 'tasks.md', BASE_MS + 4 * STEP_MS)
      await writeArtifact(root, 'plan.md', BASE_MS + 5 * STEP_MS)
      await writeArtifact(root, 'checklist.md', BASE_MS + 6 * STEP_MS)
      const events = [
        stageCompleted('open', BASE_MS),
        stageCompleted('clarify', BASE_MS + STEP_MS),
        stageCompleted('design', BASE_MS + 2 * STEP_MS),
        stageCompleted('plan', BASE_MS + 3 * STEP_MS),
        stageCompleted('implement', BASE_MS + 3 * STEP_MS),
        stageCompleted('verify', BASE_MS + 6 * STEP_MS),
      ]
      expect(await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)).toEqual([])
    } finally {
      await cleanup(root)
    }
  })

  it('reports the ledger when the plan stage is older than an upstream edit', async () => {
    const root = await workspace()
    try {
      // The customer re-edited design.md after the plan was written — the
      // plan (the ledger its gate judges) is stale and must be re-authored.
      await writeArtifact(root, 'proposal.md', BASE_MS)
      await writeArtifact(root, 'clarify.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS + 2 * STEP_MS)
      await writeArtifact(root, 'plan.json', BASE_MS + STEP_MS)
      await writeArtifact(root, 'plan.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'checklist.md', BASE_MS + 3 * STEP_MS)
      const events = [
        stageCompleted('open', BASE_MS),
        stageCompleted('clarify', BASE_MS + STEP_MS),
        stageCompleted('design', BASE_MS + STEP_MS - 1),
        stageCompleted('plan', BASE_MS + STEP_MS),
        stageCompleted('implement', BASE_MS + STEP_MS),
        stageCompleted('verify', BASE_MS + 3 * STEP_MS),
      ]
      const rows = await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        node: 'plan',
        file: 'plan.json',
        sourceNode: 'design',
        sourceFile: 'design.md',
      })
    } finally {
      await cleanup(root)
    }
  })

  it('reports nothing when the implementation ledger was ticked after the checklist was written', async () => {
    const root = await workspace()
    try {
      // 【变更】2026-10-28 (批次三十四 · 用户问题 1): the customer filed
      // 「plan.json 在 checklist.md 之后被修改」 on a change nobody had touched.
      // The model authors the checklist WHILE the implementation runs and ticks
      // the last task afterwards, so the ledger's write lands after the
      // checklist's — the two files are not out of sync, the ledger is the
      // implementation's own progress tracker and it moves by design.
      await writeArtifact(root, 'proposal.md', BASE_MS)
      await writeArtifact(root, 'clarify.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS + 2 * STEP_MS)
      await writeArtifact(root, 'plan.json', BASE_MS + 3 * STEP_MS)
      // The checklist is authored before the last task tick.
      await writeArtifact(root, 'checklist.md', BASE_MS + 4 * STEP_MS)
      await writeArtifact(root, 'plan.json', BASE_MS + 5 * STEP_MS)
      const events = [
        stageCompleted('open', BASE_MS),
        stageCompleted('clarify', BASE_MS + STEP_MS),
        stageCompleted('design', BASE_MS + 2 * STEP_MS),
        stageCompleted('plan', BASE_MS + 3 * STEP_MS),
        stageCompleted('implement', BASE_MS + 3 * STEP_MS),
        stageCompleted('verify', BASE_MS + 4 * STEP_MS),
      ]
      expect(await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)).toEqual([])
    } finally {
      await cleanup(root)
    }
  })

  it('reports the documents a customer edited by hand', async () => {
    const root = await workspace()
    try {
      // The customer re-edited the design after the implementation and the
      // checklist were written — the plan (the ledger) and the checklist are
      // both stale, and the DESIGN is the reason.
      await writeArtifact(root, 'proposal.md', BASE_MS)
      await writeArtifact(root, 'clarify.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS + 4 * STEP_MS)
      await writeArtifact(root, 'plan.json', BASE_MS + 2 * STEP_MS)
      await writeArtifact(root, 'checklist.md', BASE_MS + 3 * STEP_MS)
      const events = [
        // The design STAGE settled at its own write; the file's later stamp
        // (BASE + 4 STEP) is the customer's hand.
        stageCompleted('open', BASE_MS),
        stageCompleted('clarify', BASE_MS + STEP_MS),
        stageCompleted('design', BASE_MS + 2 * STEP_MS),
        stageCompleted('plan', BASE_MS + 2 * STEP_MS),
        stageCompleted('implement', BASE_MS + 2 * STEP_MS),
        stageCompleted('verify', BASE_MS + 3 * STEP_MS),
      ]
      const rows = await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)
      expect(rows.map(row => [row.node, row.file, row.sourceFile])).toEqual([
        ['plan', 'plan.json', 'design.md'],
        ['verify', 'checklist.md', 'design.md'],
      ])
    } finally {
      await cleanup(root)
    }
  })

  it('bug-fix-path skips the clipped clarify/design/plan stages', async () => {
    const root = await workspace()
    try {
      await writeArtifact(root, 'proposal.md', BASE_MS + 4 * STEP_MS)
      await writeArtifact(root, 'clarify.md', BASE_MS)
      await writeArtifact(root, 'design.md', BASE_MS)
      await writeArtifact(root, 'bug-fix-path-ledger.json', BASE_MS)
      await writeArtifact(root, 'checklist.md', BASE_MS + STEP_MS)

      const bugFix = await detectArtifactDrift(root, CHANGE_ID, 'bug-fix-path', [
        stageCompleted('open', BASE_MS - STEP_MS),
        stageCompleted('implement', BASE_MS),
        stageCompleted('verify', BASE_MS + STEP_MS),
      ])
      expect(bugFix.map(row => row.node)).toEqual(['implement', 'verify'])
      expect(bugFix[0]).toMatchObject({
        node: 'implement',
        file: 'bug-fix-path-ledger.json',
        sourceNode: 'open',
        sourceFile: 'proposal.md',
      })
      expect(bugFix.map(row => row.node)).not.toContain('clarify')
      expect(bugFix.map(row => row.node)).not.toContain('design')

      // The same files on the full-go chain DO report the clipped stages.
      const fullGo = await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', [
        stageCompleted('open', BASE_MS - STEP_MS),
        stageCompleted('clarify', BASE_MS),
        stageCompleted('design', BASE_MS),
        stageCompleted('plan', BASE_MS + 2 * STEP_MS),
        stageCompleted('implement', BASE_MS + 2 * STEP_MS),
        stageCompleted('verify', BASE_MS + STEP_MS),
      ])
      expect(fullGo.map(row => row.node)).toEqual(['clarify', 'design', 'implement', 'verify'])
    } finally {
      await cleanup(root)
    }
  })

  it('reads the implement ledger under either of its two names', async () => {
    const root = await workspace()
    try {
      await writeArtifact(root, 'proposal.md', BASE_MS + STEP_MS)
      // Full-go's ledger name first, the fast-path name as the fallback.
      await writeArtifact(root, 'bug-fix-path-ledger.json', BASE_MS)
      const rows = await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', [
        stageCompleted('open', BASE_MS - STEP_MS),
        stageCompleted('implement', BASE_MS),
      ])
      expect(rows[0]).toMatchObject({ node: 'implement', file: 'bug-fix-path-ledger.json' })
    } finally {
      await cleanup(root)
    }
  })

  it('reports nothing for a missing change and never throws on an unreadable one', async () => {
    const root = await workspace()
    try {
      expect(await detectArtifactDrift(root, 'change-that-never-existed', 'full-go-path', [])).toEqual([])
      // A directory where the artifact should be: the stat fails, the stage is
      // simply absent.
      await mkdir(join(root, 'openspec', 'changes', CHANGE_ID, 'proposal.md'), { recursive: true })
      expect(await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', [])).toEqual([])
    } finally {
      await cleanup(root)
    }
  })

  it('【变更】2026-10-28 (批次三十五 · 用户问题 1) holds nothing while the model is still authoring the stage', async () => {
    const root = await workspace()
    try {
      // The customer's case: the model revised `proposal.md` and
      // `clarify.md` in the SAME turn, while the clarify stage was still
      // in progress — whichever file it wrote SECOND used to read as
      // evidence that the first was 「文档不同步」.
      await writeArtifact(root, 'proposal.md', BASE_MS + 2 * STEP_MS)
      await writeArtifact(root, 'clarify.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS)
      const events = [
        // Only open settled; clarify is IN PROGRESS (its stage-completed has
        // not landed yet) and design has not been entered.
        stageCompleted('open', BASE_MS - STEP_MS),
      ]
      // The in-progress clarify.md — written after design.md, written after
      // proposal.md's revision — is the model's own authoring domain.
      expect(await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)).toEqual([])
    } finally {
      await cleanup(root)
    }
  })

  it('【变更】2026-10-28 (批次三十五 · 用户问题 1) clears the row once the sync rewrote the target', async () => {
    const root = await workspace()
    try {
      // The customer re-edited proposal.md after design settled...
      await writeArtifact(root, 'proposal.md', BASE_MS + 3 * STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS)
      const events = [
        stageCompleted('open', BASE_MS - STEP_MS),
        stageCompleted('design', BASE_MS + STEP_MS),
      ]
      expect(await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)).toHaveLength(1)
      // ...and the sync order then rewrote design.md AFTER the edit — the
      // documents agree again, the hold must release.
      await writeArtifact(root, 'design.md', BASE_MS + 4 * STEP_MS)
      expect(await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)).toEqual([])
    } finally {
      await cleanup(root)
    }
  })

  it('【变更】2026-10-28 (批次三十五 · 用户问题 1) fires immediately on a real customer edit after every stage settled', async () => {
    const root = await workspace()
    try {
      await writeArtifact(root, 'proposal.md', BASE_MS + 9 * STEP_MS)
      await writeArtifact(root, 'clarify.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS + 2 * STEP_MS)
      await writeArtifact(root, 'plan.json', BASE_MS + 3 * STEP_MS)
      await writeArtifact(root, 'checklist.md', BASE_MS + 4 * STEP_MS)
      const events = [
        stageCompleted('open', BASE_MS),
        stageCompleted('clarify', BASE_MS + STEP_MS),
        stageCompleted('design', BASE_MS + 2 * STEP_MS),
        stageCompleted('plan', BASE_MS + 3 * STEP_MS),
        stageCompleted('implement', BASE_MS + 3 * STEP_MS),
        stageCompleted('verify', BASE_MS + 4 * STEP_MS),
      ]
      const rows = await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', events)
      expect(rows.map(row => row.node)).toEqual(['clarify', 'design', 'plan', 'verify'])
    } finally {
      await cleanup(root)
    }
  })
})

describe('drift helpers', () => {
  it('narrows a stage id to the drift chain', () => {
    expect(isDriftStage('design')).toBe(true)
    expect(isDriftStage('archive')).toBe(false)
  })

  it('renders one work-order line per stale document, naming both files', async () => {
    const root = await workspace()
    try {
      await writeArtifact(root, 'proposal.md', BASE_MS + STEP_MS)
      await writeArtifact(root, 'design.md', BASE_MS)
      const rows = await detectArtifactDrift(root, CHANGE_ID, 'full-go-path', [
        stageCompleted('open', BASE_MS - STEP_MS),
        stageCompleted('design', BASE_MS),
      ])
      expect(driftWorkLines(rows)).toEqual([
        '- design.md：上游 proposal.md 在本文件之后被修改——按 proposal.md 的最新内容重写 design.md',
      ])
    } finally {
      await cleanup(root)
    }
  })

  it('points at the change directory the artifact lives in', () => {
    expect(driftArtifactPath('c-1', 'design.md')).toBe('openspec/changes/c-1/design.md')
  })
})

describe('the sync work order', () => {
  it('carries its own head, the drift lines and the customer authorization', () => {
    const text = workOrderText({
      changeId: 'c-1',
      node: 'design',
      artifactPath: 'openspec/changes/c-1/design.md',
      missing: ['- design.md：上游 proposal.md 在本文件之后被修改——按 proposal.md 的最新内容重写 design.md'],
      cause: 'artifact-drift-sync',
    })
    expect(text).toContain('【BAF 工单 · 同步产物 · 上游已更新】')
    expect(text).toContain('上游已更新')
    expect(text).toContain('- design.md：上游 proposal.md 在本文件之后被修改')
    expect(text).toContain('本阶段之后每个阶段的文档都要按同样方式跟着重写')
    expect(text).toContain('本工单由客户点击「同步」生成（客户已授权）')
    // The re-authored document must still pass its stage's gate.
    expect(text).toContain('完成条件（裁决门）：')
    expect(text).toContain('- design.md 有实际内容：Approach（接口/数据流/错误路径/兼容性）为主')
  })
})

describe('the dispatch ledger scopes', () => {
  it('never dedupes the auto-scope order against the customer scope', () => {
    resetDispatchLedger()
    const { agent, sent } = recorder()
    const dispatch = makeGoDispatcher('D:/ws-scope', agent)
    const auto: DispatchSignal = { ...CLARIFY_GAP, scope: 'auto' }
    const customer: DispatchSignal = { ...CLARIFY_GAP, scope: 'customer' }
    expect(dispatch?.(auto)).toBe('sent')
    expect(dispatch?.(customer)).toBe('sent')
    // Two customer commands in ONE turn still dedupe against each other.
    expect(dispatch?.(customer)).toBe('deduped')
    expect(dispatch?.(auto)).toBe('deduped')
    expect(sent).toHaveLength(2)
  })

  it('defaults an unscoped order to the customer scope', () => {
    resetDispatchLedger()
    const { agent, sent } = recorder()
    const dispatch = makeGoDispatcher('D:/ws-default', agent)
    expect(dispatch?.(CLARIFY_GAP)).toBe('sent')
    expect(dispatch?.(CLARIFY_GAP)).toBe('deduped')
    expect(dispatch?.({ ...CLARIFY_GAP, scope: 'customer' })).toBe('deduped')
    expect(dispatch?.({ ...CLARIFY_GAP, scope: 'auto' })).toBe('sent')
    expect(sent).toHaveLength(2)
  })

  it('2026-10-27 (派单死路): the turn-end order re-arms its own key without silencing the customer', () => {
    // The shipped bug: the orchestrator expires the ledger at the turn's start
    // and sends its turn-end order at the turn's end, so the auto key was
    // armed again — and the customer's next /baf-go deduped against it and
    // sent NOTHING.
    resetDispatchLedger()
    const { agent, sent } = recorder()
    const dispatch = makeGoDispatcher('D:/ws-deadend', agent)
    const auto: DispatchSignal = { ...CLARIFY_GAP, scope: 'auto' }
    const customer: DispatchSignal = { ...CLARIFY_GAP, scope: 'customer' }
    expect(dispatch?.(auto)).toBe('sent')
    expireDispatchLedger('D:/ws-deadend')
    // The turn-end order re-arms its key after the expiry...
    expect(dispatch?.(auto)).toBe('sent')
    // ...and the customer's command still dispatches.
    expect(dispatch?.(customer)).toBe('sent')
    expect(sent).toHaveLength(3)
  })
})

describe('the Tab view artifact drift', () => {
  it('attaches the stale documents of the focused change', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-drift-tab-'))
    try {
      await mkdir(join(root, '.baf'), { recursive: true })
      await writeFile(
        join(root, '.baf', 'baseline.yml'),
        await readFile(FIXTURE_BASELINE, 'utf8'),
        'utf8',
      )
      await execFileAsync('git', ['init', '-q'], { cwd: root })
      await execFileAsync('git', [
        '-c', 'user.email=baf@test', '-c', 'user.name=baf', '-c', 'commit.gpgsign=false',
        'commit', '-q', '--allow-empty', '-m', 'init',
      ], { cwd: root })
      const store = new ProjectionStore({ workspaceRoot: root })
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'feat: report the stale stage documents',
        workspace: { root },
      })
      const dir = join(root, 'openspec', 'changes', intake.changeId)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'proposal.md'), '# proposal\n', 'utf8')
      await writeFile(join(dir, 'design.md'), '# design\n', 'utf8')
      // 【变更】2026-10-28 (批次三十五 · 用户问题 1): settle the two stages the
      // way a real drive would — the detector judges only COMPLETED stages,
      // and the completion event's time is what the files must beat.
      let seq = (await store.readEvents(intake.changeId)).events.at(-1)?.seq ?? 0
      let settledMs = Date.now()
      for (const node of ['open', 'design'] as const) {
        const appended = await store.append(intake.changeId, seq, () => ({
          type: 'stage-completed' as const,
          node,
          artifacts: [],
        }))
        seq = appended.event.seq
        settledMs = Date.parse(appended.event.at)
      }
      await utimes(join(dir, 'design.md'), new Date(settledMs + STEP_MS), new Date(settledMs + STEP_MS))
      await utimes(join(dir, 'proposal.md'), new Date(settledMs + 2 * STEP_MS), new Date(settledMs + 2 * STEP_MS))

      const view = await buildWorkflowTabView(store, intake.changeId)
      expect(view.artifactDrift).toHaveLength(1)
      expect(view.artifactDrift?.[0]).toMatchObject({
        node: 'design',
        file: 'design.md',
        sourceNode: 'open',
        sourceFile: 'proposal.md',
      })
    } finally {
      await cleanup(root)
    }
  })

  it('leaves the drift field absent when nothing is stale', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-drift-tab-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'feat: report the stale stage documents',
        workspace: { root },
      })
      const view = await buildWorkflowTabView(store, intake.changeId)
      expect(view.artifactDrift).toBeUndefined()
    } finally {
      await cleanup(root)
    }
  })
})
