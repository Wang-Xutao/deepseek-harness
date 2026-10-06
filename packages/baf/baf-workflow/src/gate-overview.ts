/**
 * 【变更】2026-10-07 (九点批 问题 9): read-only projection of the workflow's
 * TWO gate layers, for the settings 门禁总览 row (customer decision: 只读总览
 * + 开关说明 — gate entries themselves stay a product registry locked by code
 * and tests; configuration files govern switches and thresholds).
 *
 * Layer 1 — 客户确认门 `GATE_REGISTRY`: every dialog the workflow may pop,
 * quoted verbatim (title/question/options with their slash commands), plus
 * the stage node each advance gate rests on (derived from
 * `advanceGateIdForNode`, so the mapping can never drift from the dialog
 * code).
 * Layer 2 — 阶段完成门: the per-stage artifact gates — the exact condition
 * lines (`DOC_REQUIREMENTS_ZH` and siblings, the same constants work orders
 * quote), the gate function, and the artifact file it judges.
 *
 * Pure: no I/O, no Context — the projection is static product data, so the
 * Remote method that serves it is zero-arg and cacheable forever.
 * @module @deepseek-ai/dsh-baf-workflow/gate-overview
 */

import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { GATE_REGISTRY, type GateId } from './gate-cards.ts'
import { advanceGateIdForNode } from './gate-dialog.ts'
import {
  CHECKLIST_FILE, CHECKLIST_REQUIREMENTS_ZH, DOC_REQUIREMENTS_ZH,
} from './stages/gates.ts'
import { BUG_FIX_PATH_LEDGER_FILE } from './stages/bug-fix-path.ts'
import { IMPLEMENT_REQUIREMENTS_ZH } from './go-dispatch.ts'

/** One option of a confirm gate: its label and the command a click runs. */
export interface GateOverviewOptionRow {
  readonly id: string
  readonly label: string
  readonly command: string
}

/** One 客户确认门 row (a `GATE_REGISTRY` entry, verbatim). */
export interface GateOverviewConfirmRow {
  readonly id: string
  readonly title: string
  readonly question: string
  readonly options: readonly GateOverviewOptionRow[]
  /** Stage node the gate rests on (advance gates); absent for one-shot gates. */
  readonly node?: string
  /** Bug-fix-path variant of the same rest (open only). */
  readonly bugFix?: boolean
  /** Registry marker that options are populated at runtime (bind-workflow). */
  readonly dynamicOptions?: string
}

/** One 阶段完成门 row: what a stage must produce before it may advance. */
export interface GateOverviewStageRow {
  readonly node: string
  /** The gate function that adjudicates (name only — the code is the truth). */
  readonly gateFn: string
  /** Artifact file the gate reads, under `openspec/changes/<id>/`. */
  readonly artifact: string
  /** The exact pass-condition lines (identical to what work orders quote). */
  readonly conditions: readonly string[]
  /** The confirm gate that pops when this stage completes. */
  readonly advanceGateId?: string
  /** Mode note (open quotes different conditions on the bug-fix path). */
  readonly note?: string
}

/** The full overview payload. */
export interface GateOverview {
  readonly confirmGates: readonly GateOverviewConfirmRow[]
  readonly stageGates: readonly GateOverviewStageRow[]
}

/** The rests `advanceGateIdForNode` knows, in workflow order. */
const ADVANCE_RESTS: readonly { node: string; mode?: 'full-go-path' | 'bug-fix-path' }[] = [
  { node: 'open', mode: 'full-go-path' },
  { node: 'open', mode: 'bug-fix-path' },
  { node: 'clarify' },
  { node: 'design' },
  { node: 'plan' },
  { node: 'implement' },
]

/**
 * Project both gate layers. Pure and static — the same answer every call.
 * @returns the registry rows and the stage-gate rows.
 */
export function projectGateOverview(): GateOverview {
  // Reverse-map advanceGateIdForNode: which node (and mode) each advance gate
  // rests on. Derived, never hand-listed, so a mapping change in the dialog
  // code flows through untouched.
  const gateToRest = new Map<string, { node: string; bugFix?: boolean }>()
  for (const rest of ADVANCE_RESTS) {
    const gateId = advanceGateIdForNode(rest.node, rest.mode)
    if (gateId !== undefined) {
      gateToRest.set(gateId, { node: rest.node, ...(rest.mode === 'bug-fix-path' ? { bugFix: true } : {}) })
    }
  }
  const confirmGates: GateOverviewConfirmRow[] = Object.values(GATE_REGISTRY).map((spec) => {
    const rest = gateToRest.get(spec.id)
    return {
      id: spec.id,
      title: spec.title,
      question: spec.question,
      options: spec.options.map(option => ({ id: option.id, label: option.label, command: option.command })),
      ...(rest === undefined ? {} : rest),
      // dynamicOptions rides verbatim so the overview can say WHY the option
      // cell is empty (bind-workflow / resume fill theirs at runtime).
      ...(spec.dynamicOptions === undefined ? {} : { dynamicOptions: spec.dynamicOptions }),
    }
  })
  const stageGates: GateOverviewStageRow[] = [
    {
      node: 'open',
      gateFn: 'openGate / proposalGate',
      artifact: ARTIFACT_FILES.proposal,
      conditions: DOC_REQUIREMENTS_ZH.open,
      advanceGateId: 'open-advance',
      note: 'bug-fix 模式引 BUG_RECORD_REQUIREMENTS_ZH（裁剪模板），确认门为 bugfix-open-advance',
    },
    {
      node: 'clarify',
      gateFn: 'clarifyGate',
      artifact: ARTIFACT_FILES.clarify,
      conditions: DOC_REQUIREMENTS_ZH.clarify,
      advanceGateId: 'clarify-advance',
    },
    {
      node: 'design',
      gateFn: 'designGate',
      artifact: ARTIFACT_FILES.design,
      conditions: DOC_REQUIREMENTS_ZH.design,
      advanceGateId: 'design-advance',
    },
    {
      node: 'plan',
      gateFn: 'planGate',
      artifact: ARTIFACT_FILES.planJson,
      conditions: DOC_REQUIREMENTS_ZH.plan,
      advanceGateId: 'plan-advance',
    },
    {
      node: 'implement',
      gateFn: 'implementGate',
      artifact: ARTIFACT_FILES.planJson,
      conditions: IMPLEMENT_REQUIREMENTS_ZH,
      advanceGateId: 'verify-advance',
      note: `账本在 bug-fix 模式为 ${BUG_FIX_PATH_LEDGER_FILE}`,
    },
    {
      node: 'verify',
      gateFn: 'verifyGate / checklistGate / checklistTickedGate',
      artifact: CHECKLIST_FILE,
      conditions: CHECKLIST_REQUIREMENTS_ZH,
      advanceGateId: 'verify-archive',
    },
  ]
  return { confirmGates, stageGates }
}

/** Exported for the overview's honesty line: the registry gate ids. */
export function gateOverviewIds(): readonly GateId[] {
  return Object.keys(GATE_REGISTRY) as GateId[]
}
