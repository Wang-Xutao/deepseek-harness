// @vitest-environment node
/**
 * Throwaway probe (not part of the suite): bakes the 变更总览 board HTML from
 * the REAL seeded workspace (tmp/b31-verify-ws) — the real projection, the real
 * stage documents — so the exported page can be opened in the in-app browser
 * and inspected: the theme switch, the artifact preview modal, the change's own
 * documents.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import {
  ProjectionStore, buildWorkflowDashboard, buildWorkflowTabView,
} from '../../../../packages/baf/baf-workflow/src/index.ts'
import { buildDashboardHtml } from '../src/client/dashboard-html.ts'
import { toBoardGraph } from '../src/client/ChangeOverviewRow.tsx'
import { formatDuration, formatTimestamp, formatTokens, modeLabel } from '../src/client/dashboard-format.ts'
import { zh } from '../src/client/locales.ts'

const ROOT = resolve(process.env.BAF_BOARD_WS ?? 'tmp/b31-verify-ws')
const OUT = resolve(process.env.BAF_BOARD_OUT ?? 'tmp/b31-board/board.html')

// 【变更】2026-10-27 (批次三十一): the probe needs a SEEDED workspace (the
// real projection and the real stage documents), which lives under the
// gitignored `tmp/`. Without it there is nothing to bake, so the probe
// skips instead of failing a suite that has no such workspace.
const seeded = existsSync(join(ROOT, 'openspec', 'changes'))

it('bakes the real board html', async () => {
  if (!seeded) {
    console.log('board probe skipped: no seeded workspace at', ROOT)
    return
  }
  const t = ((key: string): string => (zh as Record<string, string>)[key] ?? key) as never

  const store = new ProjectionStore({ workspaceRoot: ROOT })
  const index = await store.readIndex()
  const changeId = index.changes.find(c => c.current !== 'completed' && c.current !== 'abandoned')?.changeId
  expect(changeId).toBeDefined()
  if (changeId === undefined) return

  const dashboard = await buildWorkflowDashboard(store, [])
  const view = await buildWorkflowTabView(store, changeId, { includeMetrics: true, usagePoints: [] })
  const events = await store.readEvents(changeId)
  const row = dashboard.rows.find(entry => entry.changeId === changeId)
  expect(row).toBeDefined()
  if (row === undefined) return

  const graph = toBoardGraph(
    { status: 'ready', cwd: ROOT, changeId, view, history: events.events } as never,
    t,
  )

  const artifacts = []
  for (const artifact of view.artifacts ?? []) {
    const body = await readFile(join(ROOT, artifact.path), 'utf8').catch(() => undefined)
    artifacts.push({
      file: artifact.file,
      path: artifact.path,
      stateLabel: t(`artifact.state.${artifact.state}`),
      ...(body === undefined ? {} : { content: body }),
    })
  }

  const nodeIds = ['intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive', 'drift', 'completed', 'abandoned'] as const
  const nodeLabels: Record<string, string> = {}
  for (const id of nodeIds) nodeLabels[id] = t(`node.${id}`)

  const labels = {
    title: t('dashboard.board.title'),
    subtitle: t('dashboard.board.subtitle'),
    generatedAt: t('dashboard.board.generatedAt'),
    snapshotNote: t('dashboard.board.snapshotNote'),
    tileActive: t('dashboard.board.tileActive'),
    tileArchived: t('dashboard.board.tileArchived'),
    tileAbandoned: t('dashboard.board.tileAbandoned'),
    tileTasks: t('dashboard.board.tileTasks'),
    tileDuration: t('dashboard.board.tileDuration'),
    tileTokens: t('dashboard.board.tileTokens'),
    chartModes: t('dashboard.board.chartModes'),
    chartDuration: t('dashboard.board.chartDuration'),
    allChanges: t('dashboard.board.allChanges'),
    empty: t('dashboard.board.empty'),
    tasksHelp: t('dashboard.tasksHelp'),
    durationHelp: t('card.duration'),
    tokensHelp: t('card.tokens'),
    endedAt: t('dashboard.board.endedAt'),
    artifactsLabel: t('dashboard.artifacts'),
    artifactStates: {
      template: t('artifact.state.template'),
      planned: t('artifact.state.planned'),
      filled: t('artifact.state.filled'),
    },
    nodeLabels,
    modeLabels: {
      'full-go-path': t('mode.fullGoPath'),
      'bug-fix-path': t('mode.bugFixPath'),
      'clarify-required': t('mode.clarify'),
    },
    themeLight: t('dashboard.board.themeLight'),
    themeDark: t('dashboard.board.themeDark'),
    refresh: t('dashboard.board.refresh'),
    preview: t('dashboard.board.preview'),
    previewEmpty: t('dashboard.board.previewEmpty'),
    previewTruncated: t('dashboard.board.previewTruncated'),
    previewClose: t('dashboard.board.previewClose'),
    board: {
      filter: t('ovw.categoryLabel'),
      sort: t('ovw.sortLabel'),
      order: t('ovw.orderLabel'),
      mode: t('ovw.modeLabel'),
      search: t('ovw.searchPlaceholder'),
      clickHint: t('ovw.clickHint'),
      categories: [
        { id: 'all', label: t('ovw.category.all') },
        { id: 'active', label: t('ovw.category.active') },
        { id: 'completed', label: t('ovw.category.completed') },
        { id: 'abandoned', label: t('ovw.category.abandoned') },
      ],
      sorts: [
        { id: 'default', label: t('ovw.sort.default') },
        { id: 'started', label: t('ovw.sort.started') },
        { id: 'ended', label: t('ovw.sort.ended') },
      ],
      orders: [
        { id: 'asc', label: t('ovw.order.asc') },
        { id: 'desc', label: t('ovw.order.desc') },
      ],
      modes: [
        { id: 'all', label: t('ovw.mode.all') },
        { id: 'full-go-path', label: t('mode.fullGoPath') },
        { id: 'bug-fix-path', label: t('mode.bugFixPath') },
      ],
    },
    detail: {
      title: t('ovw.detailTitle'),
      close: t('ovw.detailClose'),
      intake: t('ovw.detailIntake'),
      kind: t('ovw.detailKind'),
      scope: t('ovw.detailScope'),
      confidence: t('ovw.detailConfidence'),
      reason: t('ovw.detailReason'),
      flow: t('ovw.detailFlow'),
      metrics: t('ovw.detailMetrics'),
      tasks: t('ovw.detailTasks'),
      artifacts: t('ovw.detailArtifacts'),
      history: t('ovw.detailHistory'),
      empty: t('ovw.detailEmpty'),
      unknown: t('ovw.unknownChange'),
      failed: t('ovw.failed'),
      startedAt: t('strip.startedAt'),
      endedAt: t('ovw.columnEnded'),
      mode: t('ovw.columnMode'),
      duration: t('card.duration'),
      tokens: t('card.tokens'),
      state: t('ovw.columnState'),
      openSpec: t('ovw.detailOpenSpec'),
      confirmation: t('ovw.detailConfirmation'),
      current: t('card.current'),
    },
  }

  const detail = {
    changeId,
    status: 'ready' as const,
    modeLabel: modeLabel(view.mode, t),
    stateLabel: t('dashboard.activeChanges'),
    ...(view.current === null ? {} : { stageLabel: t(`node.${view.current}`) }),
    ...(view.startedAt === undefined ? {} : { startedAtText: formatTimestamp(view.startedAt) }),
    ...(row.endedAt === undefined ? {} : { endedAtText: formatTimestamp(row.endedAt) }),
    ...(row.durationMs === undefined ? {} : { durationText: formatDuration(row.durationMs) }),
    tokensText: formatTokens(row.inputTokens, row.outputTokens),
    ...(row.tasks === undefined ? {} : { tasksText: `${row.tasks.done}/${row.tasks.total}` }),
    ...(view.intake === undefined ? {} : {
      intake: {
        kind: view.intake.kind,
        modeLabel: modeLabel(view.intake.mode, t),
        affectedScope: view.intake.affectedScope,
        confidence: view.intake.confidence,
        reasonCodes: view.intake.reasonCodes,
        openspecRequired: view.intake.openspecRequired,
        requiresUserConfirmation: view.intake.requiresUserConfirmation,
        confirmation: view.intake.confirmation,
      },
    }),
    artifacts,
    ...(view.nodes.length === 0 ? {} : {
      stages: view.nodes.map(node => ({
        label: t(`node.${node.id}`),
        statusLabel: t(`status.${node.status}`),
        onPath: node.onPath,
      })),
    }),
    ...(graph === undefined ? {} : { graph }),
    history: events.events.map(entry => ({
      at: formatTimestamp(entry.at),
      title: entry.type,
      ...(entry.node === undefined ? {} : { nodeLabel: t(`node.${entry.node}`) }),
      ...(entry.gate === undefined ? {} : { gate: entry.gate }),
      ...(entry.detail === undefined ? {} : { detail: entry.detail }),
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
    })),
  }

  const html = buildDashboardHtml(
    { rows: dashboard.rows, summary: dashboard.summary },
    labels as never,
    [detail as never],
  )
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, html, 'utf8')
  console.log('board', JSON.stringify({
    out: OUT,
    bytes: html.length,
    changeId,
    artifacts: artifacts.map(a => ({ file: a.file, hasContent: a.content !== undefined })),
    hasSwitch: html.includes('role="switch"'),
    previewIsModal: html.includes('class="previewDialog" role="dialog" aria-modal="true"'),
    noPreviewPane: !html.includes('previewPane'),
  }, null, 2))
  expect(html.length).toBeGreaterThan(1000)
}, 60_000)
