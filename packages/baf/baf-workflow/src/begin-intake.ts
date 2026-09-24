/**
 * §22.19 — the single intake mint entry for every surface.
 *
 * Session 7.jsonl R1: the host-plane auto-pop row and the model's
 * `baf_gate_ask` bootstrap raced on one customer requirement. Each checked
 * "any active change?" *before* dispatching its mint, neither saw the other
 * land, and the same sentence became two changes (one confirmed to open, one
 * stranded at intake:pending). The fix is structural: one function owns the
 * mint, it holds a per-cwd in-process mutex, and it **re-reads the index
 * inside the lock** — so the second caller of a racing pair discovers the
 * first one's change and reuses it instead of minting beside it.
 *
 * Every mint surface funnels here (the old `driveOpen` body moved in; the
 * slash wrapper now delegates). The structured {@link BeginIntakeOutcome}
 * replaces the stale index-diff each caller used to run to learn which change
 * it had minted — under the mutex that diff was itself a race.
 *
 * The reuse rule: a lone active change still parked at `intake` is presumed
 * to be the same requirement when the process remembers minting it
 * (`lastRequirement`, same trimmed text) or when it remembers nothing
 * (process restart — reuse unconditionally; never double-mint on ignorance).
 * A *different* remembered requirement, or any other active shape, refuses
 * with the ranked candidate list — the caller (gate-ask / orchestrator)
 * turns that into the active-conflict dialog.
 *
 * Cross-process races (a second host or CLI child on the same cwd) remain a
 * documented leftover: the mutex is process-local, like `ProjectionStore`'s
 * own per-changeId queues.
 *
 * @module @deepseek-ai/dsh-baf-workflow/begin-intake
 */

import type { CommandResult } from '@deepseek-ai/dsh-commands'
import type { ProjectionIndexEntry } from './projection.ts'
import { ProjectionStore, isActiveChange } from './projection.ts'
import { focusFor } from './session-focus.ts'
import { createWorkflowService } from './workflow-service.ts'
import { cardTitle, formatCommandReport, modeZh } from './command-format.ts'
import { loadWorkspaceBaseline } from './pipeline-factory.ts'
import { sharedHostMap } from './host-memory.ts'

/** What {@link beginIntake} decided — every caller branches on `kind`. */
export type BeginIntakeOutcome =
  | { readonly kind: 'minted'; readonly changeId: string; readonly card: CommandResult }
  | { readonly kind: 'reused'; readonly changeId: string; readonly card: CommandResult }
  | { readonly kind: 'refused-active'; readonly actives: readonly ProjectionIndexEntry[]; readonly card: CommandResult }
  | { readonly kind: 'refused-input'; readonly card: CommandResult }

/** Per-cwd mutex chains — the same pattern `ProjectionStore.queues` uses.
 *
 * 【变更】2026-09-23 (demo2 re-test): anchored on globalThis — the mint lock
 * must serialize beginIntake across BUNDLE copies too (auto-pop.js vs
 * gate-ask.js vs the Tab remote's index.js); module-local locks only
 * serialized within one copy, silently reopening the R1 double-mint window on
 * every bundled composition (see host-memory.ts). */
const locks = sharedHostMap<Promise<unknown>>('begin-intake/locks')

/** The requirement text this process last minted (or reused) per cwd.
 * Same anchor: the reuse rule must see other bundles' remembered text. */
const lastRequirement = sharedHostMap<string>('begin-intake/last-requirement')

/** Test seam — forget every lock tail and remembered requirement. */
export function resetBeginIntakeState(): void {
  locks.clear()
  lastRequirement.clear()
}

/**
 * Rank active rows for refusal cards / caller dialogs: highest `seq` first,
 * tie-break lexical changeId — identical to {@link pickActiveChange}, so the
 * candidate the guard / Tab / coordinator would pick is the first row here.
 */
function rankActives(actives: readonly ProjectionIndexEntry[]): readonly ProjectionIndexEntry[] {
  return [...actives].sort((a, b) =>
    a.seq !== b.seq ? b.seq - a.seq : a.changeId.localeCompare(b.changeId),
  )
}

/** The classification card the slash surface has always printed (byte-identical). */
function mintedCard(intake: {
  readonly changeId: string
  readonly kind: string
  readonly mode: string
  readonly affectedScope: string
  readonly confidence: number
  readonly openspecRequired: boolean
  readonly reasonCodes: readonly string[]
}): CommandResult {
  return {
    kind: 'success',
    text: formatCommandReport(
      true,
      cardTitle('/baf-workflow-open', `分类完成 · ${modeZh(intake.mode)}`),
      [
        {
          title: '分类卡',
          lines: [
            `change: ${intake.changeId}`,
            `kind: ${intake.kind}`,
            `mode: ${intake.mode}`,
            `affectedScope: ${intake.affectedScope}`,
            `confidence: ${intake.confidence.toFixed(2)}`,
            `openspecRequired: ${String(intake.openspecRequired)}`,
            `reasonCodes: ${intake.reasonCodes.join(', ') || '（无）'}`,
          ],
        },
        {
          title: '下一步',
          lines: [
            `确认：/baf-workflow-classify confirm mode=${intake.mode === 'bug-fix-path' ? 'bug-fix-path problem=… root-cause=… file=… test=… test-cmd=…' : 'full-go-path title=…'}`,
            '拒绝：/baf-workflow-classify reject',
          ],
        },
      ],
    ),
  }
}

/** The reuse card — the requirement is already sitting at the classification gate. */
function reusedCard(changeId: string): CommandResult {
  return {
    kind: 'success',
    text: formatCommandReport(true, cardTitle('/baf-workflow-open', `已有待确认分类的变更 · ${changeId}`), [
      {
        title: '状态',
        lines: [
          `这条需求已建立为 ${changeId}，正等待分类确认`,
          '本次未重复建立（同一需求只对应一条变更）',
        ],
      },
      {
        title: '下一步',
        lines: [
          '确认：/baf-workflow-classify confirm mode=full-go-path|bug-fix-path …',
          '拒绝：/baf-workflow-classify reject',
        ],
      },
    ]),
  }
}

/** The refusal card — one workspace carries one active change (§18.6). */
function refusedActiveCard(actives: readonly ProjectionIndexEntry[]): CommandResult {
  return {
    kind: 'error',
    text: formatCommandReport(false, cardTitle('/baf-workflow-open', '已有进行中的变更，未开始新需求'), [
      { title: '原因', lines: ['一个工作区同时只承载一条进行中的变更'] },
      { title: '当前活动变更', lines: rankActives(actives).map(c => `- ${c.changeId} · ${String(c.current)}`) },
      {
        title: '处理',
        lines: [
          '先推进或收尾现有变更（收到选择卡时点选「继续推进」或「放弃现有变更」）',
          '确需并行：另开一个工作区',
        ],
      },
    ]),
  }
}

/** The empty-description usage card (unchanged from the old `driveOpen`). */
function refusedInputCard(): CommandResult {
  return {
    kind: 'error',
    text: formatCommandReport(false, cardTitle('/baf-workflow-open', '缺少描述'), [
      { title: '用法', lines: ['/baf-workflow-open <需求或 Bug 描述>'] },
    ]),
  }
}

/**
 * The locked decision: re-read the index, then mint / reuse / refuse.
 *
 * Runs only while holding the per-cwd chain tail, so the index read and the
 * mint are one atomic step within this process.
 */
async function mintOrReuse(cwd: string, description: string): Promise<BeginIntakeOutcome> {
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const actives = (await store.readIndex()).changes.filter(isActiveChange)

  if (actives.length === 0) {
    const baseline = await loadWorkspaceBaseline(cwd)
    const service = createWorkflowService({ store })
    const { intake } = await service.intake({
      description,
      workspace: { root: cwd },
      ...(baseline === undefined ? {} : { baseline }),
    })
    // §18.6: bind this workspace's focus to the minted change. Every surface
    // that mints through here then has the coordinator continue it directly —
    // a tool-minted change that never carries focus stranded its own session
    // on the binding card (2026-09-20 incident 3.jsonl).
    focusFor(cwd).set(intake.changeId)
    lastRequirement.set(cwd, description)
    return { kind: 'minted', changeId: intake.changeId, card: mintedCard(intake) }
  }

  // A lone pending intake is the reuse window: the racing second caller (or a
  // re-stated identical requirement) converges on the change that already
  // exists instead of minting a twin. "Pending" here includes a confirmed-but
  // -blocked intake — either way minting a second change would be wrong, and
  // the callers already know how to surface that parked state.
  const lone = actives.length === 1 ? actives[0] : undefined
  if (lone !== undefined && lone.current === 'intake') {
    const known = lastRequirement.get(cwd)
    if (known === undefined || known === description) {
      focusFor(cwd).set(lone.changeId)
      lastRequirement.set(cwd, description)
      return { kind: 'reused', changeId: lone.changeId, card: reusedCard(lone.changeId) }
    }
  }

  return { kind: 'refused-active', actives: rankActives(actives), card: refusedActiveCard(actives) }
}

/**
 * Begin (or converge on) the intake change for a requirement — the ONLY mint
 * path in the package.
 *
 * @param cwd - workspace root.
 * @param rawInput - free-form change description (trimmed; empty refuses).
 * @returns which change the requirement now maps to, and the card to show.
 */
export async function beginIntake(cwd: string, rawInput: string): Promise<BeginIntakeOutcome> {
  const description = rawInput.trim()
  if (description === '') return { kind: 'refused-input', card: refusedInputCard() }

  const previous = locks.get(cwd) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(() => mintOrReuse(cwd, description))
  locks.set(cwd, run)
  try {
    return await run
  } finally {
    if (locks.get(cwd) === run) locks.delete(cwd)
  }
}
