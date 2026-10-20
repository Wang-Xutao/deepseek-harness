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

/** Template edges mirrored from baf-core full-go-path + shared recovery edges. */
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
 * 【变更】2026-10-20 (批次五 2.3): plain-zh renderings of the workflow edges'
 * English conditions, keyed by the stable edge id (T1–T16, baf-core
 * workflow.ts) — moved here from WorkflowView so the 确认门 门禁明细 quotes the
 * SAME plain copy. The T-id itself is internal vocabulary and never renders;
 * the raw condition string stays the fallback for an edge this table has not
 * covered.
 */
export const CONDITION_ZH: Readonly<Record<string, string>> = {
  T1: '任何 BAF 输入都从这里开始',
  T2: '分类确认为新需求或高风险缺陷',
  T3: '分类确认为低风险缺陷，且基线允许走快速路径',
  T4: '变更档案已建立，澄清单独进行',
  T4a: '澄清并入建立变更阶段（已记录理由）',
  T5: '根因和影响范围已记录',
  T6: '卡进度的问题已回答或明确延后；验收标准可检验',
  T7: '设计已确认，计划单独进行',
  T7a: '设计并入计划（任务和回退点已记录）',
  T8: '计划已包含文件白名单、验证命令和回退点',
  T9: '全部任务有结果，且没有越权改动',
  T10: '必需检查全部通过，且无漂移',
  T11: '有必需检查未通过',
  T12: '进行中的变更，其依据的文件 / 基线 / 报告发生了变化',
  T13: '最早受影响的阶段已恢复或重新确认',
  T14: '你确认后，归档一次完成',
  T15: '缺陷修复升级为完整流程，回头补澄清 / 设计 / 计划',
  T16: '你确认放弃进行中的变更',
}

/** 【变更】2026-10-20 (批次五 2.3): one edge's plain-zh condition (raw text as
 * the fallback) — the display form every surface quotes. */
export function conditionTextOf(edge: { id: string; condition: string }): string {
  return CONDITION_ZH[edge.id] ?? edge.condition
}

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
