/**
 * Graph layout vocabulary for the go workflow flowchart (enterprise-workflow §5.1).
 * UI places nodes using these lanes; edge legality still comes from TRANSITIONS.
 * @module @deepseek-ai/dsh-baf-core/graph
 */

import type { WorkflowMode } from './intake.ts'
import type { TerminalState, WorkflowNode } from './workflow.ts'
import { TRANSITIONS } from './workflow.ts'

/** One node placement hint for SVG layout. */
export interface GraphNodePlacement {
  /** Workflow node or terminal marker. */
  readonly id: WorkflowNode | TerminalState
  /** Horizontal branch index (0 = primary lane). */
  readonly column: number
  /** Vertical depth on the primary path (0 = top). */
  readonly row: number
  /** Whether this node appears on the happy path for the mode. */
  readonly onPath: boolean
}

/** One rendered edge derived from TRANSITIONS for a mode. */
export interface GraphEdge {
  /** Transition table id. */
  readonly id: string
  /** Source node or null for T1-from-empty. */
  readonly from: WorkflowNode | null
  /** Target node or terminal. */
  readonly to: WorkflowNode | TerminalState
  /** Visual kind for stroke styling. */
  readonly kind: 'forward' | 'loop' | 'cross' | 'entry'
  /** Short condition for tooltips. */
  readonly condition: string
}

/** Mode-specific graph model shared by Tab and diagnostics. */
export interface WorkflowGraphModel {
  readonly mode: WorkflowMode | 'template'
  readonly nodes: readonly GraphNodePlacement[]
  readonly edges: readonly GraphEdge[]
}

/** Node ids on the full-go-path path, top → bottom. Also the §18.4.3 full-go-path lane. */
export const FULL_GO_PATH_ROWS: readonly WorkflowNode[] = [
  'intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive',
]

/** Node ids on the bug-fix-path. Also the §18.4.3 pre-upgrade lane. */
export const BUG_FIX_PATH_ROWS: readonly WorkflowNode[] = [
  'intake', 'open', 'implement', 'verify', 'archive',
]

/**
 * Classify an edge for styling.
 * @param from - source.
 * @param to - target.
 * @returns visual kind.
 */
function edgeKind(
  from: WorkflowNode | null,
  to: WorkflowNode | TerminalState,
): GraphEdge['kind'] {
  if (from === null) return 'entry'
  if (to === 'drift' || from === 'drift') return 'cross'
  if (from === 'verify' && to === 'implement') return 'loop'
  if (from === 'implement' && to === 'clarify') return 'loop'
  if (to === 'abandoned' || to === 'completed') return 'forward'
  return 'forward'
}

/**
 * Build placements for a mode (or the full template when mode is unset).
 * Main path is top-to-bottom (`row`); branches use `column`.
 * @param mode - workflow mode, or template for empty-state rendering.
 * @returns placements.
 */
export function placementsForMode(mode: WorkflowMode | 'template'): readonly GraphNodePlacement[] {
  if (mode === 'bug-fix-path') {
    return [
      ...BUG_FIX_PATH_ROWS.map((id, row) => ({ id, column: 0, row, onPath: true })),
      { id: 'clarify', column: 1, row: 1, onPath: false },
      { id: 'design', column: 2, row: 1, onPath: false },
      { id: 'plan', column: 1, row: 2, onPath: false },
      { id: 'drift', column: 1, row: 3, onPath: true },
      { id: 'completed', column: 0, row: 5, onPath: true },
      { id: 'abandoned', column: 1, row: 5, onPath: true },
    ]
  }
  // full-go-path and template (clarify-required uses full-go-path visual until confirmed)
  return [
    ...FULL_GO_PATH_ROWS.map((id, row) => ({ id, column: 0, row, onPath: true })),
    { id: 'drift', column: 1, row: 4, onPath: true },
    { id: 'completed', column: 0, row: 8, onPath: true },
    { id: 'abandoned', column: 1, row: 8, onPath: true },
  ]
}

/**
 * Edges visible for a mode. Template shows both full-go-path and fast-path edges.
 * @param mode - workflow mode or template.
 * @returns edges.
 */
export function edgesForMode(mode: WorkflowMode | 'template'): readonly GraphEdge[] {
  const wanted = new Set<string>()
  if (mode === 'template' || mode === 'full-go-path' || mode === 'clarify-required') {
    for (const id of ['T1', 'T2', 'T4', 'T4a', 'T6', 'T7', 'T7a', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T16']) {
      wanted.add(id)
    }
  }
  if (mode === 'template' || mode === 'bug-fix-path') {
    for (const id of ['T1', 'T3', 'T5', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16']) {
      wanted.add(id)
    }
  }
  return TRANSITIONS.filter(rule => wanted.has(rule.id)).map(rule => ({
    id: rule.id,
    from: rule.from,
    to: rule.to,
    kind: edgeKind(rule.from, rule.to),
    condition: rule.condition,
  }))
}

/**
 * Build the authoritative graph model for one mode.
 * @param mode - workflow mode or template for empty state.
 * @returns graph model.
 */
export function buildWorkflowGraph(mode: WorkflowMode | 'template' = 'template'): WorkflowGraphModel {
  return {
    mode,
    nodes: placementsForMode(mode),
    edges: edgesForMode(mode),
  }
}

/** Convenience export used by Tab Remote assembly. */
export const WORKFLOW_GRAPH_TEMPLATE = buildWorkflowGraph('template')
