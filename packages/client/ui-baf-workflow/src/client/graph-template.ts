/**
 * Browser-local template graph so the flowchart still renders when Remote
 * fails or returns an empty placement list (Host owns the live graph).
 */
import type { TerminalStateId, WorkflowNodeId, WorkflowTabView } from './tab-types.ts'
import { CATALOG_ZH } from './catalog-i18n.ts'

/** One placement on the vertical template canvas. */
export interface TemplatePlacement {
  readonly id: WorkflowNodeId | TerminalStateId
  readonly column: number
  readonly row: number
  readonly onPath: boolean
}

/** One edge drawn on the template canvas. */
export interface TemplateEdge {
  readonly id: string
  readonly from: WorkflowNodeId | null
  readonly to: WorkflowNodeId | TerminalStateId
  readonly kind: 'forward' | 'loop' | 'cross' | 'entry'
  readonly condition: string
}

const MAIN: readonly WorkflowNodeId[] = [
  'intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive',
]

/** Full-go / empty-state placements (top → bottom). */
export const TEMPLATE_PLACEMENTS: readonly TemplatePlacement[] = [
  ...MAIN.map((id, row) => ({ id, column: 0, row, onPath: true })),
  { id: 'drift', column: 1, row: 4, onPath: true },
  { id: 'completed', column: 0, row: 8, onPath: true },
  { id: 'abandoned', column: 1, row: 8, onPath: true },
]

/** Template edges mirrored from baf-core full-go + shared recovery edges. */
export const TEMPLATE_EDGES: readonly TemplateEdge[] = [
  { id: 'T1', from: null, to: 'intake', kind: 'entry', condition: 'any BAF input' },
  { id: 'T2', from: 'intake', to: 'open', kind: 'forward', condition: 'confirmed new requirement or high-risk bug' },
  { id: 'T4', from: 'open', to: 'clarify', kind: 'forward', condition: 'skeleton created; clarify not merged into open' },
  { id: 'T4a', from: 'open', to: 'design', kind: 'forward', condition: 'clarify merged into open with recorded rationale' },
  { id: 'T6', from: 'clarify', to: 'design', kind: 'forward', condition: 'blocking questions answered or deferred' },
  { id: 'T7', from: 'design', to: 'plan', kind: 'forward', condition: 'design confirmed' },
  { id: 'T7a', from: 'design', to: 'implement', kind: 'forward', condition: 'design merged into plan' },
  { id: 'T8', from: 'plan', to: 'implement', kind: 'forward', condition: 'plan has file scope and verify commands' },
  { id: 'T9', from: 'implement', to: 'verify', kind: 'forward', condition: 'all tasks have results' },
  { id: 'T10', from: 'verify', to: 'archive', kind: 'forward', condition: 'required checks passed with no drift' },
  { id: 'T11', from: 'verify', to: 'implement', kind: 'loop', condition: 'required check failed' },
  { id: 'T12', from: null, to: 'drift', kind: 'cross', condition: 'evidence changed on an active change' },
  { id: 'T13', from: 'drift', to: 'intake', kind: 'cross', condition: 'earliest affected node restored' },
  { id: 'T14', from: 'archive', to: 'completed', kind: 'forward', condition: 'human confirmed archive' },
  { id: 'T16', from: null, to: 'abandoned', kind: 'forward', condition: 'user confirmed abandon' },
]

/**
 * Empty Tab view that still shows the full reference flowchart.
 * @returns template tab view.
 */
export function buildClientTemplateTabView(): WorkflowTabView {
  const nodes = MAIN.concat(['drift']).map((id) => {
    const zh = CATALOG_ZH[id]
    return {
      id,
      status: 'template' as const,
      catalog: {
        id,
        titleKey: `node.${id}`,
        purpose: zh?.purpose ?? id,
        prerequisites: zh?.prerequisites ?? [],
        actions: zh?.actions ?? [],
        artifacts: zh?.artifacts ?? [],
        completion: zh?.completion ?? [],
        failure: zh?.failure ?? [],
        entries: [],
      },
      onPath: true,
      transitionsIn: TEMPLATE_EDGES
        .filter(e => e.to === id)
        .map(e => ({ id: e.id, condition: e.condition, from: e.from })),
      transitionsOut: TEMPLATE_EDGES
        .filter(e => e.from === id)
        .map(e => ({ id: e.id, condition: e.condition, to: e.to })),
    }
  })

  return {
    empty: true,
    changeId: null,
    mode: 'template',
    current: null,
    nodes,
    graph: {
      mode: 'template',
      nodes: TEMPLATE_PLACEMENTS,
      edges: TEMPLATE_EDGES,
    },
    projectionVersion: 0,
    changes: [],
    selectedChangeId: null,
    actions: [{
      id: 'supplement-intake',
      enabled: true,
      labelKey: 'action.newChange',
      reason: 'Start intake from chat or Tab',
    }],
  }
}

/**
 * Ensure graph placements exist so the canvas never renders blank.
 * @param view - remote or local tab view.
 * @returns view with template graph/nodes when missing.
 */
export function withRenderableGraph(view: WorkflowTabView): WorkflowTabView {
  const template = buildClientTemplateTabView()
  const graphNodes = view.graph?.nodes ?? []
  const hasPlacements = graphNodes.some(
    n => typeof n.column === 'number' && typeof n.row === 'number',
  )
  return {
    ...view,
    nodes: view.nodes.length > 0 ? view.nodes : template.nodes,
    graph: hasPlacements
      ? view.graph
      : template.graph,
  }
}
