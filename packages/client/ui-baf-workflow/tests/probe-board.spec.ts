// @vitest-environment node
/**
 * Throwaway probe (not part of the suite): bakes the 变更总览 board HTML from a
 * REAL projection written into a temp workspace, so the exported page — the
 * workflow graph included — can be opened in the in-app browser and inspected.
 */
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { loadBaselineFile } from '../../../../packages/baf/baf-core/src/index.ts'
import {
  ProjectionStore, buildWorkflowDashboard, buildWorkflowTabView, confirmIntake, createWorkflowService,
} from '../../../../packages/baf/baf-workflow/src/index.ts'
import { buildDashboardHtml } from '../src/client/dashboard-html.ts'
import { toBoardGraph } from '../src/client/ChangeOverviewRow.tsx'
import { formatDuration, formatTimestamp, formatTokens, modeLabel } from '../src/client/dashboard-format.ts'
import { zh } from '../src/client/locales.ts'

const FIXTURE_BASELINE = join(process.cwd(), 'packages/baf/baf-core/tests/fixtures/baseline/baseline.yml')

it('bakes the board html', async () => {
  const root = await mkdtemp(join(tmpdir(), 'baf-board-'))
  await mkdir(join(root, '.baf'), { recursive: true })
  await mkdir(join(root, 'openspec', 'changes'), { recursive: true })
  const baseline = await loadBaselineFile(FIXTURE_BASELINE)
  await writeFile(join(root, '.baf', 'baseline.yml'), JSON.stringify(baseline), 'utf8')

  const store = new ProjectionStore({ workspaceRoot: root })
  const service = createWorkflowService({ store })
  const { intake } = await service.intake({
    description: 'feat: add the exported board graph',
    workspace: { root },
    affectedScopeHint: 'public-api',
  })
  const changeId = intake.changeId
  await confirmIntake(store, changeId, 'user')
  // Walk the change to the design→plan gate so the board shows completed,
  // in-progress, gated and idle cards at once.
  const tail = async (): Promise<number> => (await store.readEvents(changeId)).events.at(-1)?.seq ?? 0
  await store.append(changeId, await tail(), meta => ({ type: 'stage-entered', node: 'design', ...meta }))
  await store.append(changeId, await tail(), meta => ({ type: 'stage-completed', node: 'design', artifacts: [], ...meta }))
  await store.append(changeId, await tail(), meta => ({ type: 'awaiting-confirm', gate: 'design-to-plan', ...meta }))

  const t = ((key: string): string => (zh as Record<string, string>)[key] ?? key) as never
  const dashboard = await buildWorkflowDashboard(store, [])
  const view = await buildWorkflowTabView(store, changeId, { includeMetrics: true, usagePoints: [] })
  const row = dashboard.rows.find(entry => entry.changeId === changeId)
  expect(row).toBeDefined()
  if (row === undefined) return

  const graph = toBoardGraph({
    status: 'ready', cwd: root, changeId, view, history: (await store.readEvents(changeId)).events,
  } as never, t)

  const labels = {
    title: 'BAF 变更看板', subtitle: root, generatedAt: '生成时间', snapshotNote: '静态快照',
    tileActive: '进行中变更', tileArchived: '已完成', tileAbandoned: '已放弃', tileTasks: '计划任务',
    tileDuration: '耗时', tileTokens: 'Tokens', chartModes: '流程分布', chartDuration: '耗时排行',
    allChanges: '变更记录', empty: '暂无变更', tasksHelp: '任务进度', durationHelp: '耗时',
    tokensHelp: 'Tokens', endedAt: '结束时间', artifactsLabel: '阶段产物',
    artifactStates: {
      template: '仍是未填的模板',
      planned: '尚未生成',
      filled: '已填写',
      // 【变更】2026-10-29 (批次三十七 · 用户问题 6): the lifecycle tail.
      completed: '已完成',
      updated: '已更新',
      stale: '待更新',
    },
    nodeLabels: {},
    modeLabels: { 'full-go-path': '完整流程', 'bug-fix-path': '缺陷修复', 'clarify-required': '需要澄清' },
    // 【变更】2026-10-27 (批次三十): the top bar + the artifact preview.
    themeLight: '白天',
    themeDark: '黑夜',
    refresh: '刷新',
    preview: '产物预览',
    previewEmpty: '（空）暂无可预览的内容',
    previewTruncated: '内容已截断',
    previewClose: '关闭',
    board: {
      filter: '筛选', sort: '排序', order: '升降序', mode: '流程', search: '搜索',
      clickHint: '点击变更项可展开它的流程图与完整历史记录。',
      categories: [{ id: 'all', label: '全部' }],
      sorts: [{ id: 'default', label: '默认顺序' }],
      orders: [{ id: 'desc', label: '降序' }],
      modes: [{ id: 'all', label: '全部流程' }],
    },
    detail: {
      title: '变更详情', close: '关闭', intake: '变更分类', kind: '变更类型', scope: '影响范围',
      confidence: '置信度', reason: '判定依据', flow: '工作流图', metrics: '指标', tasks: '计划任务',
      artifacts: '阶段产物', history: '历史记录', empty: '暂无记录', unknown: '未知变更', failed: '读取失败',
      startedAt: '开始时间', endedAt: '结束时间', mode: '模式', duration: '耗时', tokens: 'Tokens',
      state: '状态', openSpec: '打开规格', confirmation: '确认结论', current: '当前',
    },
  }

  const detail = {
    changeId, status: 'ready' as const,
    modeLabel: modeLabel(view.mode, t),
    stateLabel: '进行中',
    ...(view.current === null ? {} : { stageLabel: t(`node.${view.current}`) }),
    ...(view.startedAt === undefined ? {} : { startedAtText: formatTimestamp(view.startedAt) }),
    ...(row.durationMs === undefined ? {} : { durationText: formatDuration(row.durationMs) }),
    tokensText: formatTokens(row.inputTokens, row.outputTokens),
    // 【变更】2026-10-27 (批次三十): one artifact with a body so the board's
    // preview pane can be exercised offline.
    artifacts: [
      {
        file: 'design.md',
        path: `openspec/changes/${changeId}/design.md`,
        stateLabel: '已填写',
        content: '# 设计方案\n\n## 选定方案\n- 接口：Foo.bar()\n- 数据流：a → b → c\n- 错误路径：超时 → 重试 3 次\n- 兼容性：向后兼容\n\n## 仓库引用\n- packages/example/src/foo.ts\n\n## 风险\n- 风险：并发写\n- 对策：加锁\n',
      },
      {
        file: 'proposal.md',
        path: `openspec/changes/${changeId}/proposal.md`,
        stateLabel: '仍是未填的模板',
      },
    ],
    ...(graph === undefined ? {} : { graph }),
  }

  const html = buildDashboardHtml({ rows: dashboard.rows, summary: dashboard.summary }, labels as never, [detail as never])
  // 【变更】2026-10-27 (批次三十): the sample lands under `apps/web/tmp/` — the
  // `apps/web/dist/` tree SHIPS inside the desktop package, so a probe page
  // written there would ride along in every baf-dsh.exe.
  const out = join(process.cwd(), 'apps', 'web', 'tmp', 'probe-board.html')
  mkdirSync(join(process.cwd(), 'apps', 'web', 'tmp'), { recursive: true })
  writeFileSync(out, html, 'utf8')
  console.log('board bytes', html.length, 'out', out, 'graph', graph === undefined ? null : {
    width: graph.width, height: graph.height,
    nodes: graph.nodes.length, edges: graph.edges.length,
    tones: [...new Set(graph.nodes.map(node => node.tone))],
  })
  console.log('hasSvg', html.includes('class="wfGraph"'), 'hasEdge', html.includes('wfEdge'))
  expect(readFileSync(out, 'utf8').length).toBe(html.length)

  // 【变更】2026-10-27 (批次三十 · 客户反馈): the theme control is a real
  // SWITCH, not a text button — it carries the switch role, the checked
  // state and a visible state caption.
  expect(html).toContain('role="switch"')
  expect(html).toContain('aria-checked="false"')
  expect(html).toContain('id="boardThemeState"')
  expect(html).toContain('class="themeSwitchTrack"')
  expect(html).toContain('class="themeGlyph themeGlyphSun"')
  expect(html).toContain('class="themeGlyph themeGlyphMoon"')

  // 【变更】2026-10-27 (批次三十 · 客户反馈): the artifact preview is a MODAL
  // LAYER over the whole page, not a pane inside the detail overlay's left
  // column. The page carries exactly one preview container, and it sits
  // outside <main> — a direct child of the body, above the detail overlay.
  expect(html).not.toContain('previewPane')
  expect(html.split('id="boardPreview"').length - 1).toBe(1)
  expect(html.indexOf('id="boardPreview"')).toBeGreaterThan(html.indexOf('</main>'))
  expect(html).toContain('class="previewDialog" role="dialog" aria-modal="true"')
}, 60_000)
