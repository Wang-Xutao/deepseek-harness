/**
 * Locale keys and dictionaries for the BAF 工作流 Tab.
 */
export type WorkflowTabKey =
  | 'view.workflow'
  // 【变更】2026-10-21 (批次十 测试流图): the session tab + its settings row.
  | 'view.testFlow'
  | 'settings.testFlowTab.title'
  | 'settings.testFlowTab.description'
  | 'tflow.verdictCoverage'
  | 'tflow.verdictStatic'
  | 'tflow.verdictReport'
  | 'tflow.coverageValue'
  | 'tflow.staticValue'
  | 'tflow.gateMode'
  | 'tflow.state.passed'
  | 'tflow.state.failed'
  | 'tflow.state.idle'
  | 'tflow.required'
  | 'tflow.optional'
  | 'tflow.openReport'
  | 'tflow.noCwd'
  | 'tflow.loadFailed'
  | 'tflow.aria'
  | 'tflow.node.build'
  | 'tflow.node.test'
  | 'tflow.node.instrument'
  | 'tflow.node.report'
  | 'tflow.node.gate'
  | 'tflow.node.lint'
  | 'tflow.node.analyze'
  | 'tflow.node.format'
  | 'tflow.nodeEn.build'
  | 'tflow.nodeEn.test'
  | 'tflow.nodeEn.instrument'
  | 'tflow.nodeEn.report'
  | 'tflow.nodeEn.gate'
  | 'tflow.nodeEn.lint'
  | 'tflow.nodeEn.analyze'
  | 'tflow.nodeEn.format'
  // 【变更】2026-10-22 (批次十一 5): the click-to-inspect split — detail-pane
  // labels, per-step 作用 copy, and the 执行结果 line templates.
  | 'tflow.pickHint'
  | 'tflow.labelTool'
  | 'tflow.labelType'
  | 'tflow.labelCommand'
  | 'tflow.labelPurpose'
  | 'tflow.labelResult'
  | 'tflow.reportPath'
  | 'tflow.chainDone'
  | 'tflow.chainIdle'
  | 'tflow.gateUndecided'
  | 'tflow.staticIdle'
  | 'tflow.formatIdle'
  | 'tflow.desc.build'
  | 'tflow.desc.test'
  | 'tflow.desc.instrument'
  | 'tflow.desc.report'
  | 'tflow.desc.gate'
  | 'tflow.desc.lint'
  | 'tflow.desc.analyze'
  | 'tflow.desc.format'
  // 【变更】2026-10-22 (批次十二 2.1/2.3/2.5/2.6): the per-stage 运行 buttons,
  // the strip 配置 button, the format step's path row, and the 配置文件
  // preview modal.
  | 'tflow.run'
  | 'tflow.runDone'
  | 'tflow.runFailed'
  | 'tflow.runToolMissing'
  | 'tflow.runNoCwd'
  // 【变更】2026-10-22 (批次十四 5): the failed run's 错误解析 box — a cause
  // line and a fix line, one pair per classifier rule.
  | 'tflow.errTitle'
  | 'tflow.errCause'
  | 'tflow.errFix'
  | 'tflow.errTimeoutCause'
  | 'tflow.errTimeoutFix'
  | 'tflow.errToolCause'
  | 'tflow.errToolFix'
  | 'tflow.errCfgCause'
  | 'tflow.errCfgFix'
  | 'tflow.errPathCause'
  | 'tflow.errPathFix'
  | 'tflow.errCompileCause'
  | 'tflow.errCompileFix'
  | 'tflow.errTestCause'
  | 'tflow.errTestFix'
  | 'tflow.errCoverageCause'
  | 'tflow.errCoverageFix'
  | 'tflow.errStaticCause'
  | 'tflow.errStaticFix'
  | 'tflow.errPermCause'
  | 'tflow.errPermFix'
  | 'tflow.errGenericCause'
  | 'tflow.errGenericFix'
  // 【变更】2026-10-22 (批次十三 1/2/4): the 全部运行 sweep + its summary note,
  // the disabled-stage surfaces, and the 工作流图 jump chips' target labels.
  | 'tflow.runAll'
  | 'tflow.chainRunning'
  | 'tflow.chainSkipped'
  | 'tflow.chainSummary'
  | 'tflow.chainAllPassed'
  | 'tflow.chainHaltedNote'
  | 'tflow.runDisabled'
  | 'tflow.stageOff'
  | 'tflow.stageOffNote'
  | 'flow.testFlowJump'
  | 'flow.testFlowJumpDesc'
  | 'tflow.cfgFiles'
  | 'tflow.cfgPreview'
  | 'tflow.cfgOpen'
  | 'tflow.cfgClose'
  | 'tflow.cfgMissing'
  | 'tflow.cfgLoading'
  | 'tflow.fmtPathLabel'
  | 'strip.current'
  | 'strip.totalTime'
  | 'strip.totalTokens'
  | 'strip.empty'
  | 'strip.blocked'
  | 'strip.idle'
  | 'mode.template'
  | 'mode.fullGoPath'
  | 'mode.bugFixPath'
  | 'mode.clarify'
  | 'mode.help'
  | 'card.duration'
  | 'card.tokens'
  | 'card.next'
  | 'card.condition'
  | 'card.done'
  | 'card.todo'
  | 'card.current'
  | 'metrics.pending'
  | 'route.title'
  | 'route.noneAuto'
  | 'route.fallback'
  | 'route.keyword'
  | 'route.failed'
  | 'route.escalation'
  | 'route.tierHigh'
  | 'route.tierMid'
  | 'route.tierLow'
  // 【变更】2026-10-07 (九点批 问题 2/4): the gate cards' 「确认后派单」 line.
  | 'route.dispatchOn'
  | 'intake.title'
  | 'intake.help'
  | 'intake.kind'
  | 'intake.mode'
  | 'intake.scope'
  | 'intake.confidence'
  | 'intake.openspec'
  | 'intake.reasons'
  | 'intake.summary'
  | 'intake.confirmation'
  | 'intake.confirmation.pending'
  | 'intake.confirmation.confirmed'
  | 'intake.confirmation.rejected'
  | 'intake.heuristicNote'
  | 'intake.confidenceHelp'
  | 'intake.allowlist'
  | 'kind.new-requirement'
  | 'kind.bug'
  | 'kind.maintenance'
  | 'kind.unknown'
  | 'scope.single-file'
  | 'scope.small-local'
  | 'scope.cross-module'
  | 'scope.public-api'
  | 'scope.unknown'
  | 'intake.confirm'
  | 'intake.confirmFull'
  | 'intake.confirmFullHelp'
  | 'intake.confirmBugFix'
  | 'intake.confirmBugFixHelp'
  | 'intake.enterOpenHelp'
  | 'intake.reject'
  | 'intake.supplement'
  | 'intake.required'
  | 'intake.notRequired'
  | 'intake.bugFixPath.title'
  | 'intake.bugFixPath.help'
  | 'intake.bugFixPath.problem'
  | 'intake.bugFixPath.rootCause'
  | 'intake.bugFixPath.file'
  | 'intake.bugFixPath.fileHelp'
  | 'intake.bugFixPath.test'
  | 'intake.bugFixPath.testCmd'
  | 'intake.bugFixPath.submit'
  | 'intake.bugFixPath.required'
  | 'detail.title'
  | 'detail.empty'
  | 'detail.checklist'
  | 'detail.todoTitle'
  | 'detail.doneTitle'
  | 'detail.todoEmpty'
  | 'detail.purpose'
  | 'detail.prerequisites'
  | 'detail.actions'
  | 'detail.artifacts'
  | 'detail.completion'
  | 'detail.failure'
  | 'detail.entries'
  | 'detail.transitionsIn'
  | 'detail.transitionsOut'
  | 'detail.status'
  | 'detail.skipReasons'
  | 'detail.liveArtifacts'
  | 'detail.zh'
  | 'detail.en'
  | 'status.locked'
  | 'status.available'
  | 'status.in-progress'
  | 'status.completed'
  | 'status.failed'
  | 'status.blocked'
  | 'status.drifted'
  | 'status.skipped'
  | 'status.template'
  | 'status.clipped'
  | 'status.awaiting'
  | 'status.abandoned'
  | 'terminal.completed.artifacts'
  | 'terminal.completed.completion'
  | 'terminal.abandoned.artifacts'
  | 'terminal.abandoned.completion'
  // §22 — pendingGate card (workspace scaffold gate + change-scoped
  // intake-classify, 2026-09-23 demo2 issue #2).
  | 'pendingGate.title'
  | 'pendingGate.action'
  | 'pendingGate.classifyTitle'
  | 'pendingGate.bugFixFieldsHelp'
  | 'gate.bannerTitle'
  // §22.14 — abandon gate (change-level) Tab button label.
  | 'action.abandon'
  | 'abandon.confirmHelp'
  | 'gate.designDone'
  | 'gate.verifyPassed'
  | 'gate.confirmIntoPlan'
  | 'gate.confirmArchive'
  | 'gate.replyToContinue'
  // §22 GATE_REGISTRY is the single source of truth for gate card text
  // (`renderGate` reads it directly). Earlier we kept a frozen zh/en copy
  // here as a "future i18n migration anchor"; it was never rendered and
  // drifted risk (a §22 edit here had to be mirrored there by hand).
  // §22.16 P3 freeze contract removed 2026-09; if a future phase needs
  // i18n for gate cards, read GATE_REGISTRY and project per-locale at
  // render time, do not re-introduce dead dictionaries.
  | 'lane.bugFixPath'
  | 'lane.fullGoPath'
  | 'lane.help'
  | 'edge.upgraded'
  | 'edge.cause'
  | 'edge.at'
  | 'edge.preserved'
  | 'edge.preservedEmpty'
  | 'node.intake'
  | 'node.open'
  | 'node.clarify'
  | 'node.design'
  | 'node.plan'
  | 'node.implement'
  | 'node.verify'
  | 'node.archive'
  | 'node.drift'
  | 'node.completed'
  | 'node.abandoned'
  | 'action.enterOpen'
  | 'action.startStage'
  | 'action.confirmArchive'
  | 'action.advance'
  // 【变更】2026-09-25 (用户需求 工作流 1): the strip 推进 button became the
  // TOP advance dialog — its own copy (advanceHelp/advanceBlocked died with
  // the always-on button; not-ready simply does not pop the dialog).
  | 'advanceDialog.title'
  | 'advanceDialog.body'
  | 'advanceDialog.confirm'
  | 'advanceDialog.dismiss'
  // §22.19 R5 — terminal dead-end escape (回到进行中的变更).
  | 'action.backToActive'
  | 'action.resume'
  | 'action.resumeHelp'
  | 'action.refresh'
  | 'action.dashboard'
  | 'action.config'
  | 'action.newChange'
  | 'action.newChangeHelp'
  | 'dashboard.activeChanges'
  | 'dashboard.activeSection'
  | 'dashboard.archiveSection'
  | 'dashboard.archived'
  | 'dashboard.completion'
  | 'dashboard.loadFailed'
  | 'dashboard.tasks'
  | 'dashboard.tasksHelp'
  | 'dashboard.title'
  | 'dashboard.close'
  | 'dashboard.help'
  | 'dashboard.empty'
  | 'dashboard.focus'
  | 'dashboard.openChange'
  | 'dashboard.note'
  // 【变更】2026-09-23 (demo5 issue #5): the history flow modal's title.
  | 'dashboard.historyTitle'
  // 【变更】2026-10-23 (批次十八 2.2/2.3): the 工作流 page's 变更总览 tab — the
  // project's change ledger (the abandoned changes are recorded rows too).
  | 'ovw.title'
  | 'ovw.help'
  | 'ovw.project'
  | 'ovw.completed'
  | 'ovw.abandoned'
  | 'ovw.columnChange'
  | 'ovw.columnMode'
  | 'ovw.columnState'
  | 'ovw.columnEnded'
  | 'ovw.empty'
  | 'ovw.noWorkspace'
  | 'ovw.loading'
  | 'ovw.refresh'
  // 【变更】2026-10-24 (批次十九 1.1/1.2/1.3/1.4): the session 工作流图 tab's
  // fixed LEFT column + the rail's stage header + the strip's start time, and
  // the 变更总览 tab's redesigned ledger with its per-change detail modal.
  | 'rail.sideRail'
  | 'rail.stage'
  | 'rail.stageSelected'
  | 'rail.stageCurrent'
  | 'strip.startedAt'
  | 'ovw.clickHint'
  | 'ovw.detailOpen'
  | 'ovw.detailTitle'
  | 'ovw.detailFlow'
  | 'ovw.detailHistory'
  | 'ovw.detailArtifacts'
  | 'ovw.detailMetrics'
  | 'ovw.detailIntake'
  | 'ovw.detailLoading'
  | 'ovw.detailFailed'
  | 'ovw.detailEmpty'
  | 'ovw.detailClose'
  | 'ovw.detailUnknownChange'
  // 【变更】2026-10-24 (批次二十 1/3): the 变更总览 ledger's console copy and
  // the 变更详情 workspace's four zones (顶部 strip / 左侧 rail / 中间工作流图 /
  // 右侧 rail). The workspace reuses the session graph's own components, so the
  // copy here only names the zones the session tab does not have.
  | 'ovw.ledgerLabel'
  // 【变更】2026-10-25 (批次二十四 2): the ledger's list section head.
  | 'ovw.listLabel'
  // 【变更】2026-10-26 (批次二十八 5): the ledger's view controls — the
  // category segments, the sort and mode dropdowns, the search box, the
  // visible-count line and the empty-match notice.
  | 'ovw.categoryLabel'
  | 'ovw.sortLabel'
  | 'ovw.modeLabel'
  | 'ovw.searchPlaceholder'
  | 'ovw.filteredCount'
  | 'ovw.noMatch'
  | 'ovw.externalFailed'
  | 'ovw.category.all'
  | 'ovw.category.active'
  | 'ovw.category.completed'
  | 'ovw.category.abandoned'
  | 'ovw.sort.default'
  | 'ovw.sort.durationDesc'
  | 'ovw.sort.durationAsc'
  | 'ovw.sort.tasksDesc'
  | 'ovw.sort.idAsc'
  | 'ovw.mode.all'
  | 'ovw.mode.fullGoPath'
  | 'ovw.mode.bugFixPath'
  | 'ovw.mode.clarify'
  | 'ovw.detailGraph'
  | 'ovw.detailGraphHint'
  | 'ovw.detailStageHead'
  | 'ovw.detailStageHint'
  | 'ovw.detailSelectStage'
  | 'ovw.detailKind'
  | 'ovw.detailScope'
  | 'ovw.detailConfidence'
  | 'ovw.detailReason'
  | 'ovw.detailConfirmation'
  | 'ovw.detailTasks'
  | 'ovw.detailOpenSpec'
  | 'ovw.detailNoSession'
  | 'ovw.detailOpenFailed'
  // 【变更】2026-10-25 (批次二十四 1): the 文档产物 preview modal — the change
  // detail's artifacts open in the SAME preview window the 测试流图's config
  // files use.
  | 'ovw.artifactPreview'
  | 'ovw.artifactPreviewClose'
  | 'ovw.artifactPreviewLoading'
  | 'ovw.artifactPreviewMissing'
  | 'ovw.artifactPreviewFailed'
  | 'ovw.artifactPreviewOpen'
  | 'hist.event'
  | 'hist.intakeClassified'
  | 'hist.intakeConfirmed'
  | 'hist.intakeModeSet'
  | 'hist.intakeSettled'
  | 'hist.taskTierFrozen'
  | 'hist.baselineLocked'
  | 'hist.stageEntered'
  | 'hist.stageCompleted'
  | 'hist.stageFailed'
  | 'hist.driftDetected'
  | 'hist.modeUpgraded'
  | 'hist.awaitingConfirm'
  | 'hist.changeArchived'
  | 'hist.changeAbandoned'
  | 'hist.transitionRejected'
  // 【变更】2026-10-24 (批次十九 2.1): the BAF brand mark as a locale key, so
  // the 工作流图 tab and the 测试流图 tab carry the SAME badge text.
  | 'view.brandBaf'
  // 【变更】2026-09-29 (demo23 问题 3): terminal dashboard rows list the
  // artifacts the change actually generated (abandoned included).
  | 'dashboard.artifacts'
  // 【变更】2026-09-30 (demo33 问题 4): the standalone browser board — the
  // 变更总览's 在浏览器中打开 button bakes these into a Blob-URL page.
  | 'dashboard.openExternal'
  | 'dashboard.board.title'
  | 'dashboard.board.subtitle'
  | 'dashboard.board.generatedAt'
  | 'dashboard.board.snapshotNote'
  | 'dashboard.board.tileActive'
  | 'dashboard.board.tileArchived'
  | 'dashboard.board.tileAbandoned'
  | 'dashboard.board.tileTasks'
  | 'dashboard.board.tileDuration'
  | 'dashboard.board.tileTokens'
  | 'dashboard.board.chartModes'
  | 'dashboard.board.chartDuration'
  | 'dashboard.board.allChanges'
  | 'dashboard.board.empty'
  | 'dashboard.board.endedAt'
  // 【变更】2026-09-29 (demo23 问题 5): the 工作流 settings row copy.
  | 'settings.workflowTab.title'
  | 'settings.workflowTab.description'
  // 【变更】2026-10-07 (九点批 问题 9): the 门禁总览 read-only row copy.
  // 【变更】2026-10-18 (工作流确认门 2.1): gates.title + gates.description
  // deleted — the tab title carries the meaning; the row head keeps controls.
  | 'gates.expand'
  | 'gates.collapse'
  | 'gates.loading'
  | 'gates.loadFailed'
  | 'gates.confirmTitle'
  | 'gates.confirmHint'
  | 'gates.stageTitle'
  | 'gates.stageHint'
  | 'gates.colGate'
  | 'gates.colNode'
  | 'gates.colQuestion'
  | 'gates.colOptions'
  | 'gates.colArtifact'
  | 'gates.colGateFn'
  | 'gates.colConditions'
  | 'gates.colAdvanceGate'
  | 'gates.sentinelNoop'
  | 'gates.sentinelContinued'
  | 'gates.dynamicOptions'
  // 【变更】2026-10-19 (六问题批 4.2): the「开关与阈值在配置文件」block is
  // deleted (configTitle/configIntro/configBaseline/configRoute/configPresets/
  // honesty keys removed); the density control is renamed 详略.
  // 【变更】2026-10-20 (批次三 4.5): the 详/略 switch itself is deleted too —
  // the flow is always 详 with a selected-node detail column.
  | 'gates.onceTitle'
  | 'gates.onceHint'
  | 'gates.branchTitle'
  | 'gates.conditionsCount'
  | 'gates.noGate'
  // 【变更】2026-10-25 (批次二十四 2): the page's own chrome — the hero band
  // (identity + purpose), the figure plates (the live counts), and the frame's
  // quiet hint. They make the 确认门 tab a sibling of the 变更总览 tab.
  | 'gates.heroLabel'
  | 'gates.heroTitle'
  | 'gates.heroHelp'
  | 'gates.tileStates'
  | 'gates.canvasHint'
  // 【变更】2026-10-18 (工作流确认门 2.3): the flow copy (canvas since gone).
  | 'gates.canvasAria'
  | 'gates.stageGate'
  // 【变更】2026-10-22 (批次十四 2): 'gates.legendState' retired with the
  // legend bar (客户决策：删除图例). The 详-mode detail section heading stays.
  | 'gates.detailTitle'
  // 【变更】2026-10-20 (批次五 2.1): the 门禁明细 section labels (阶段门禁 /
  // 进入下一步的条件 / 确认门) layering the selected node's group.
  | 'gates.sectionStage'
  | 'gates.sectionEdge'
  | 'gates.sectionConfirm'
  // 【变更】2026-10-23 (批次十七 2.1): the intake branch block copy, take two —
  // the 需求输入 entry box, the three horizontal option cards (the customer's
  // option text), and their quiet condition lines (the runtime state that
  // picks each branch). The scaffold chip / caption / pointer keys left with
  // their DOM (批次十七 2.3 dropped the state's 确认门 pointer entirely).
  | 'gates.entryInput'
  | 'gates.entryOptNone'
  | 'gates.entryOptOne'
  | 'gates.entryOptMany'
  | 'gates.entryCondNone'
  | 'gates.entryCondOne'
  | 'gates.entryCondMany'
  | 'gates.node.intake'
  | 'gates.node.open'
  | 'gates.node.clarify'
  | 'gates.node.design'
  | 'gates.node.plan'
  | 'gates.node.implement'
  | 'gates.node.verify'
  | 'gates.node.archive'
  | 'gates.node.drift'
  // 2026-09-21 (session 5.jsonl) — artifact rail card.
  | 'artifact.title'
  | 'artifact.help'
  | 'artifact.open'
  | 'artifact.gapCount'
  | 'artifact.missing'
  | 'artifact.state.missing'
  | 'artifact.state.template'
  | 'artifact.state.planned'
  | 'artifact.state.filled'
  | 'artifact.state.clipped'
  // 【变更】2026-09-22 (user report #4) — session token statistics card.
  | 'stats.title'
  | 'stats.help'
  | 'stats.breakdownTitle'
  // 【变更】2026-09-23 (demo5 issue #6): the stats card's three sections.
  | 'stats.section.overview'
  | 'stats.section.tools'
  | 'stats.section.tokens'
  | 'stats.turns'
  | 'stats.steps'
  | 'stats.toolCalls'
  | 'stats.llmTime'
  | 'stats.toolTime'
  | 'stats.ttft'
  | 'stats.tokens'
  | 'stats.total'
  | 'stats.input'
  | 'stats.cacheRead'
  | 'stats.cacheWrite'
  | 'stats.output'
  | 'stats.cacheHit'
  | 'stats.pending'
  | 'empty.hint'
  | 'openspec.skipped'
  | 'graph.aria'
  | 'graph.ops'
  | 'none'

/** Dictionary namespace. */
export const NS = 'baf.go-workflow'

/** English copy. */
export const en: Record<WorkflowTabKey, string> = {
  // 【变更】2026-10-06 (问题 1): the tab shows the workflow GRAPH — renamed
  // from 'Workflow' to 'Workflow graph'.
  'view.workflow': 'Workflow graph',
  // 【变更】2026-10-21 (批次十 测试流图): the session test-flow tab + its copy.
  'view.testFlow': 'Test flow',
  'settings.testFlowTab.title': 'Test flow tab',
  'settings.testFlowTab.description': 'Turn off to hide the Test flow tab on the conversation view.',
  'tflow.verdictCoverage': 'Coverage',
  'tflow.verdictStatic': 'Static',
  'tflow.verdictReport': 'Report at',
  'tflow.coverageValue': '{line}% (min {min}%)',
  'tflow.staticValue': '{n} errors',
  'tflow.gateMode': 'gate mode',
  'tflow.state.passed': 'Passed',
  'tflow.state.failed': 'Failed',
  'tflow.state.idle': 'Not run',
  'tflow.required': 'required',
  'tflow.optional': 'optional',
  'tflow.openReport': 'Open report',
  'tflow.noCwd': 'This session has no workspace folder — the test flow reads the workspace quality reports produced by /baf-quality check and /baf-quality lint.',
  'tflow.loadFailed': 'Test-flow status read failed — ',
  'tflow.aria': 'Unit-test execution flow with results',
  // 【变更】2026-10-22 (批次十二 2.2): the 执行纪律 band copy is gone — the
  // discipline line no longer renders anywhere (customer deletion).
  'tflow.node.build': 'gcc build',
  'tflow.node.test': 'ceedling unit tests',
  'tflow.node.instrument': 'gcov instrumentation',
  'tflow.node.report': 'gcovr report',
  'tflow.node.gate': 'Coverage gate',
  'tflow.node.lint': 'cpplint style lint',
  'tflow.node.analyze': 'cppcheck static analysis',
  'tflow.node.format': 'clang-format',
  'tflow.nodeEn.build': 'Build (gcc)',
  'tflow.nodeEn.test': 'Ceedling test',
  'tflow.nodeEn.instrument': 'Instrument (gcov)',
  'tflow.nodeEn.report': 'Report (gcovr)',
  'tflow.nodeEn.gate': 'Coverage gate',
  'tflow.nodeEn.lint': 'Style lint (cpplint)',
  'tflow.nodeEn.analyze': 'cppcheck',
  'tflow.nodeEn.format': 'clang-format',
  // 【变更】2026-10-22 (批次十一 5): detail-pane copy for the click-to-inspect split.
  'tflow.pickHint': 'Click a step on the left to inspect its details and results here.',
  'tflow.labelTool': 'Tool',
  'tflow.labelType': 'Type',
  'tflow.labelCommand': 'Command',
  'tflow.labelPurpose': 'Purpose',
  'tflow.labelResult': 'Result',
  'tflow.reportPath': 'HTML report',
  'tflow.chainDone': 'Ran with the /baf-quality chain (report at {at})',
  'tflow.chainIdle': 'Not run yet — run /baf-quality check to fill in this pane.',
  'tflow.gateUndecided': 'Coverage report exists but carries no pass verdict.',
  'tflow.staticIdle': 'Not run yet — run /baf-quality lint to fill in this pane.',
  // 【变更】2026-10-22 (批次十二 2.5): the 无独立报告 note is gone; the format
  // step carries a configurable path instead.
  'tflow.formatIdle': 'The final clang-format runs after lint is clean, before code freeze — use the 运行 button (it formats the configured path).',
  'tflow.desc.build': 'Compiles the production sources and test stubs with gcc and links the Unity/CMock test executables — the first step of the check chain: if it does not compile, the tests, instrumentation and coverage below never happen.',
  'tflow.desc.test': 'Drives every unit test through ceedling. The daily path skips coverage instrumentation and stays fast — regress here first after a code change, then run the full check chain once green.',
  'tflow.desc.instrument': 'Rebuilds the sources with gcov coverage instrumentation (check path only — the daily test run is not instrumented), producing the data gcovr later scores.',
  'tflow.desc.report': 'Aggregates the instrumented data with gcovr into an overall line-coverage verdict, and writes the HTML/Cobertura reports into the workspace report directory for browser review.',
  'tflow.desc.gate': 'Reads the coverage report and decides the verdict: line coverage ≥ the threshold (default 80%) passes; the conclusion lands in ut-coverage.json, and a missing report counts as failed.',
  'tflow.desc.lint': 'Checks style and banned constructs with cpplint under the SORA-tuned rule set (driven by the repo-root CPPLINT.cfg, not the Google defaults); runs together with cppcheck inside one /baf-quality lint.',
  'tflow.desc.analyze': 'Hunts defect and undefined-behavior classes with cppcheck; third-party, test and build directories are exempt per the suppression file, and the error count feeds the static verdict above.',
  'tflow.desc.format': 'Applies the final layout pass (clang-format -i) to the .c/.h files this change touched — only after lint is clean, before code freeze; no source edits afterwards.',
  // 【变更】2026-10-22 (批次十二 2.1/2.3/2.5/2.6): the per-stage run, the
  // format path row, and the 配置文件 preview modal.
  'tflow.run': 'Run',
  'tflow.runDone': 'Run finished (exit 0)',
  'tflow.runFailed': 'Run failed (exit {code})',
  'tflow.runToolMissing': 'baf-quality not found — install the quality toolchain first (工作流 · 测试流 · 环境).',
  'tflow.runNoCwd': 'This session has no workspace folder.',
  // 【变更】2026-10-22 (批次十四 5): the failed run's 错误解析 box.
  'tflow.errTitle': 'Error analysis',
  'tflow.errCause': 'Cause',
  'tflow.errFix': 'How to fix',
  'tflow.errTimeoutCause': 'The command timed out — it did not finish within the limit and was terminated.',
  'tflow.errTimeoutFix': 'Retry once; if it still times out, narrow the scope (e.g. a single test file), or paste the output into the chat for AI analysis.',
  'tflow.errToolCause': 'Tool "{tool}" was not found — it is not installed or not on PATH, so the command never really ran.',
  'tflow.errToolFix': 'Open 工作流 · 测试流 · 环境 and click 一键安装: gem/pip tools install automatically; GCC / Ruby / Cppcheck / LLVM follow the manual steps in the install report.',
  'tflow.errCfgCause': 'The workspace is missing the config file this step reads (the default template has not been written yet).',
  'tflow.errCfgFix': 'Open 工作流 · 测试流 · 环境 and click 一键安装 to copy the default config templates into the workspace, then rerun.',
  'tflow.errPathCause': 'A file or directory the command needs does not exist in the workspace — it never really ran.',
  'tflow.errPathFix': 'Check the path named in the output against the workspace tree (the layout may differ from what the command assumes); create the missing directory, or adjust the command here.',
  'tflow.errCompileCause': 'Compilation failed — the first error in the output names the file and the line.',
  'tflow.errCompileFix': 'Fix the syntax/linker error at that spot and rerun; or paste the output into the chat for AI help.',
  'tflow.errTestCause': 'Not all unit tests passed — the failing cases are listed as FAILED in the output.',
  'tflow.errTestFix': 'Check the FAILED case names, fix the code or the cases, then rerun this stage.',
  'tflow.errCoverageCause': 'Line coverage is below the gate threshold.',
  'tflow.errCoverageFix': 'Add tests for the uncovered branches, or check the threshold in .baf/quality/ceedling-config.json.',
  'tflow.errStaticCause': 'Static analysis found issues — the counts are in the output summary lines.',
  'tflow.errStaticFix': 'Fix each file:line entry; exemptions belong in CPPLINT.cfg / cppcheck-suppressions.xml.',
  'tflow.errPermCause': 'A file is locked or permission is denied, so the command cannot read what it needs.',
  'tflow.errPermFix': 'Close the program holding the file (IDE, antivirus scan) and retry; run as administrator if needed.',
  'tflow.errGenericCause': 'The command ended with exit code {code} and matched no known error pattern.',
  'tflow.errGenericFix': 'Check the error lines at the end of the output; paste it into the chat for AI help.',
  // 【变更】2026-10-22 (批次十三 1/2/4): the 全部运行 sweep, the disabled-stage
  // surfaces, and the 工作流图 jump chips.
  'tflow.runAll': 'Run all',
  'tflow.chainRunning': 'Running…',
  'tflow.chainSkipped': 'Skipped — this stage is switched off in the test-flow canvas (工作流 · 测试流).',
  'tflow.chainSummary': 'Sweep finished — {n} stages in {secs}s, some failed; open the failed card for details.',
  'tflow.chainAllPassed': 'Sweep finished — all {n} enabled stages passed in {secs}s.',
  'tflow.chainHaltedNote': 'Halted at「{stage}」— its 错误即中止 switch is on; later stages did not run.',
  'tflow.runDisabled': 'Not run — this stage is switched off.',
  'tflow.stageOff': 'Off',
  'tflow.stageOffNote': 'This stage is switched off in the 测试流 canvas (工作流 · 测试流); turn it on there to run it.',
  'flow.testFlowJump': '测试流图',
  'flow.testFlowJumpDesc': 'Open the test-flow chart at this stage',
  'tflow.cfgFiles': 'Config files',
  'tflow.cfgPreview': 'Config file preview',
  'tflow.cfgOpen': 'Open file',
  'tflow.cfgClose': 'Close',
  'tflow.cfgMissing': 'File not found — install the quality assets first (工作流 · 测试流 · 环境 · 一键安装).',
  'tflow.cfgLoading': 'Reading…',
  'tflow.fmtPathLabel': 'Format path',
  'strip.current': 'Current',
  'strip.totalTime': 'Change time',
  'strip.totalTokens': 'Session tokens',
  'strip.empty': 'No active change — reference graph (template)',
  'strip.blocked': 'Blocked',
  'strip.idle': 'Idle',
  'mode.template': 'Template (idle)',
  'mode.fullGoPath': 'Full-go',
  'mode.bugFixPath': 'Bug fix path',
  'mode.clarify': 'Needs clarify',
  'mode.help': 'Template = reference graph before a change starts. After intake: full-go-path / bug-fix-path / clarify-required.',
  'card.duration': 'Time',
  'card.tokens': 'Tokens',
  'card.next': 'Next',
  'card.condition': 'When',
  'card.done': 'Done',
  'card.todo': 'Todo',
  'card.current': 'Current',
  'metrics.pending': 'Model tokens used during this stage',
  'route.title': 'Current routing',
  'route.noneAuto': 'Auto is engaged · waiting for the first dispatch',
  'route.fallback': 'fallback',
  'route.keyword': 'keyword',
  'route.failed': 'failed',
  'route.escalation': 'escalated',
  'route.tierHigh': 'Commander',
  'route.tierMid': 'Reviewer',
  'route.tierLow': 'Worker',
  // 【变更】2026-10-07 (九点批 问题 2/4): the gate cards' dispatch line.
  'route.dispatchOn': 'Dispatches on confirm: ',
  'intake.title': 'Change classification',
  'intake.help': 'Intake decides kind/mode/scope before writes. Trigger: chat or New change. Confirm → projection; reject → abandon; supplement → keep chatting.',
  'intake.heuristicNote': 'Kind / scope / confidence are the system\'s keyword pre-judgment (unmatched shows To be determined; confirming does not rewrite them). Mode is the path YOU picked on the classification card; the bug-fix pick settles kind = Bug.',
  'intake.confidenceHelp': 'Confidence = how strongly the keyword pre-judgment matched your description: 70% when a feature/bug keyword hit (新增/需求/feat… or bug/修复/fix…), 40% as the base when nothing matched. It only shapes the system\'s INITIAL suggestion — the path is settled by your click on the classification card, never by this number. It settles with the flow: kind at classification confirm, scope when the plan freezes the file allowlist.',
  'intake.allowlist': 'Allowlist',
  'intake.kind': 'Kind',
  'intake.mode': 'Mode',
  'intake.scope': 'Scope',
  'intake.confidence': 'Confidence',
  'intake.openspec': 'OpenSpec',
  'intake.reasons': 'Reason codes',
  'intake.summary': 'Summary',
  'intake.confirmation': 'Confirmation',
  'intake.confirmation.pending': 'Awaiting your choice',
  'intake.confirmation.confirmed': 'Confirmed (path settled by your click)',
  'intake.confirmation.rejected': 'Rejected',
  'kind.new-requirement': 'New requirement',
  'kind.bug': 'Bug',
  'kind.maintenance': 'Maintenance',
  'kind.unknown': 'To be determined',
  'scope.single-file': 'Single file',
  'scope.small-local': 'Small local change',
  'scope.cross-module': 'Cross-module',
  'scope.public-api': 'Public API',
  // 【变更】2026-09-25 (用户需求 工作流 7): the unsettled scope reads as the
  // plan-stage promise, not archive vocabulary — the plan freeze settles it.
  'scope.unknown': 'To be confirmed at plan stage',
  'intake.confirm': 'Confirm classification',
  'intake.confirmFull': 'Confirm · Full path',
  'intake.confirmFullHelp': 'Confirm the classification and enter the full go path (one click: confirm + open)',
  'intake.confirmBugFix': 'Confirm · Bug-fix path',
  'intake.confirmBugFixHelp': 'Confirm the bug-fix fast path — fill the five bug fields below first, the click submits them in one step',
  'intake.enterOpenHelp': 'The classification is confirmed but the open step was blocked (e.g. Git unavailable) — click to retry entering open',
  'intake.reject': 'Reject and exit',
  'intake.supplement': 'Add details in chat',
  'intake.required': 'Required',
  'intake.notRequired': 'Not required',
  'intake.bugFixPath.title': 'Fast-path Bug fields',
  'intake.bugFixPath.help': 'Optional accelerator: confirming without fields creates a TODO draft the model completes from the work order; filling all five fields establishes the complete record in one step.',
  'intake.bugFixPath.problem': 'Problem',
  'intake.bugFixPath.rootCause': 'Root cause',
  'intake.bugFixPath.file': 'Affected files (one per line)',
  'intake.bugFixPath.fileHelp': 'Repeat or list — each line becomes one `file=` argument.',
  'intake.bugFixPath.test': 'Regression test file',
  'intake.bugFixPath.testCmd': 'Regression test command',
  'intake.bugFixPath.submit': 'Submit fast-path',
  'intake.bugFixPath.required': 'All five fields are required before fast-path can dispatch.',
  'detail.title': 'Stage detail',
  'detail.empty': 'Select a stage on the graph',
  'detail.checklist': 'Stage checklist',
  'detail.todoTitle': 'Not done yet',
  'detail.doneTitle': 'Done',
  'detail.todoEmpty': 'No open items for this stage',
  'detail.purpose': 'Purpose',
  'detail.prerequisites': 'Prerequisites',
  'detail.actions': 'Actions',
  'detail.artifacts': 'Expected artifacts',
  'detail.completion': 'Completion',
  'detail.failure': 'Anomaly — reason & fix',
  'detail.entries': 'Entries',
  'detail.transitionsIn': 'Inbound transitions',
  'detail.transitionsOut': 'Outbound transitions',
  'detail.status': 'Status',
  'detail.skipReasons': 'Skip / block reasons',
  'detail.liveArtifacts': 'Recorded artifacts',
  'detail.zh': 'Chinese',
  'detail.en': 'English',
  'status.locked': 'Locked',
  'status.available': 'Available',
  'status.in-progress': 'In progress',
  'status.completed': 'Completed',
  'status.failed': 'Failed',
  'status.blocked': 'Blocked',
  'status.drifted': 'Drifted',
  'status.skipped': 'Ignored',
  'status.template': 'Idle',
  'status.clipped': 'Clipped',
  'status.awaiting': 'Awaiting customer',
  'status.abandoned': 'Abandoned',
  'terminal.completed.artifacts': 'Archived under openspec/changes/archive/<changeId>/ — every stage document plus the verify report',
  'terminal.completed.completion': 'The change passed verification and was archived; the audit trail is preserved',
  'terminal.abandoned.artifacts': 'Kept in place for audit (no archive move); the projection log records the abandon decision',
  'terminal.abandoned.completion': 'The change was abandoned before completion; nothing further runs on it',
  // §22 — pendingGate card.
  'pendingGate.title': 'Workspace bootstrap required',
  'pendingGate.action': 'Resolve in Tab',
  'pendingGate.classifyTitle': 'Requirement classification awaiting your choice',
  'pendingGate.bugFixFieldsHelp': 'Bug-fix path can be confirmed with no fields — a TODO draft (proposal.md + plan.json) is created and the model completes it from the work order; fill the rail form first to establish the complete record in one step',
  'gate.bannerTitle': 'Workflow decision',
  // §22.14 — abandon change-level gate button label.
  'action.abandon': 'Abandon this change',
  'abandon.confirmHelp': 'Abandoning ends this change and keeps only the audit trail. The slash form /baf-workflow-abandon confirm has the same effect.',
  'gate.designDone': 'Design done · confirm to enter plan',
  'gate.verifyPassed': 'Verification done · confirm to archive',
  'gate.confirmIntoPlan': 'Confirm and continue',
  'gate.confirmArchive': 'Confirm archive',
  'gate.replyToContinue': 'Run /baf-go again to continue',
  'lane.bugFixPath': 'Bug fix path (before the upgrade)',
  'lane.fullGoPath': 'Full-go (after the upgrade)',
  'lane.help': 'A fast-path change that escalated keeps both paths: the earlier lane is greyed but never deleted.',
  'edge.upgraded': 'Upgraded to the full flow: {from} → {to}',
  'edge.cause': 'Cause',
  'edge.at': 'When',
  'edge.preserved': 'Pre-upgrade artifacts (no OpenSpec)',
  'edge.preservedEmpty': 'No artifacts were produced before the upgrade',
  'node.intake': 'Intake',
  'node.open': 'Open',
  'node.clarify': 'Clarify',
  'node.design': 'Design',
  'node.plan': 'Plan',
  'node.implement': 'Implement',
  'node.verify': 'Verify',
  'node.archive': 'Archive',
  'node.drift': 'Drift',
  'node.completed': 'Completed',
  'node.abandoned': 'Abandoned',
  'action.enterOpen': 'Enter open',
  'action.startStage': 'Start stage',
  'action.confirmArchive': 'Confirm archive',
  'action.advance': 'Advance',
  'advanceDialog.title': '{from} done · confirm to enter {to}',
  'advanceDialog.body': '【Status change】{from} (completed, passed its gate) → {to} (not started)\n\n【After confirming】\n- The workflow advances to {to} and the system dispatches the next work order',
  'advanceDialog.confirm': 'Confirm · enter {to}',
  'advanceDialog.dismiss': 'Not now',
  'action.backToActive': 'Back to the active change',
  'action.resume': 'Roll back to…',
  'action.resumeHelp': 'Drift never clears itself. Pick the stage to re-enter — everything after it is re-run.',
  'action.refresh': 'Refresh',
  'action.dashboard': 'Changes',
  'action.config': 'Configure',
  'action.newChange': 'New change',
  'action.newChangeHelp': 'Starts intake for a new change (no source writes until confirmed).',
  'dashboard.title': 'Change dashboard',
  'dashboard.close': 'Close',
  'dashboard.help': 'Every change in this workspace — phases, task progress, and cost at a glance.',
  'dashboard.empty': 'No active changes.',
  'dashboard.focus': 'Focus',
  'dashboard.openChange': 'Show this change in the workflow tab',
  'dashboard.note': 'Rows open the flow graph focused on that change; terminal rows read their archived artifacts.',
  'dashboard.activeChanges': 'Active changes',
  'dashboard.activeSection': 'Active changes',
  'dashboard.archiveSection': 'Archive history',
  'dashboard.archived': 'Archived',
  'dashboard.completion': 'Task completion',
  'dashboard.tasks': 'Plan tasks',
  'dashboard.tasksHelp': 'Plan tasks: done/total checkboxes from the change\'s plan.json task ledger (full-go-path changes only; a change without a plan ledger counts 0).',
  'dashboard.loadFailed': 'Dashboard load failed — retry with Refresh.',
  'dashboard.historyTitle': 'Change history',
  // 【变更】2026-10-23 (批次十八 2.2/2.3): the 工作流 page's 变更总览 tab.
  'ovw.title': 'Change overview',
  'ovw.help': 'Every change of this project — active, completed, and abandoned ones recorded.',
  'ovw.project': 'Project',
  'ovw.completed': 'Completed',
  'ovw.abandoned': 'Abandoned',
  'ovw.columnChange': 'Change',
  'ovw.columnMode': 'Mode',
  'ovw.columnState': 'State',
  'ovw.columnEnded': 'Ended',
  'ovw.empty': 'This project has no change yet.',
  'ovw.noWorkspace': 'No workspace is bound — open a session in this project to list its changes.',
  'ovw.loading': 'Loading changes…',
  'ovw.refresh': 'Refresh',
  // 【变更】2026-10-24 (批次十九 1.1/1.2/1.3/1.4)
  'rail.sideRail': 'Change info',
  'rail.stage': 'Stage',
  'rail.stageSelected': 'Selected stage',
  'rail.stageCurrent': 'Current stage',
  'strip.startedAt': 'Started at',
  'ovw.clickHint': 'Click a change to open its flow and full history.',
  'ovw.detailOpen': 'Open details',
  'ovw.detailTitle': 'Change details',
  'ovw.detailFlow': 'Stage flow',
  'ovw.detailHistory': 'History',
  'ovw.detailArtifacts': 'Artifacts',
  'ovw.detailMetrics': 'Duration & tokens',
  'ovw.detailIntake': 'Intake',
  'ovw.detailLoading': 'Loading change details…',
  'ovw.detailFailed': 'Could not load the change details.',
  'ovw.detailEmpty': 'This change has no history yet.',
  'ovw.detailClose': 'Close',
  'ovw.detailUnknownChange': 'This change is no longer in the project ledger.',
  // 【变更】2026-10-24 (批次二十 1/3): the ledger's console copy + the 变更详情
  // workspace's four zones.
  'ovw.ledgerLabel': 'Change ledger',
  // 【变更】2026-10-25 (批次二十四 2): the ledger's list section head.
  'ovw.listLabel': 'Change records',
  // 【变更】2026-10-26 (批次二十八 5): the ledger's view controls.
  'ovw.categoryLabel': 'Category',
  'ovw.sortLabel': 'Sort',
  'ovw.modeLabel': 'Flow',
  'ovw.searchPlaceholder': 'Search change id',
  'ovw.filteredCount': '{shown} of {total} shown',
  'ovw.noMatch': 'No change matches the current filters.',
  'ovw.externalFailed': 'The board could not be opened in a browser.',
  'ovw.category.all': 'All',
  'ovw.category.active': 'Active',
  'ovw.category.completed': 'Done',
  'ovw.category.abandoned': 'Abandoned',
  'ovw.sort.default': 'Default order',
  'ovw.sort.durationDesc': 'Longest first',
  'ovw.sort.durationAsc': 'Shortest first',
  'ovw.sort.tasksDesc': 'Task completion',
  'ovw.sort.idAsc': 'Change id',
  'ovw.mode.all': 'All flows',
  'ovw.mode.fullGoPath': 'Full flow',
  'ovw.mode.bugFixPath': 'Bug fix path',
  'ovw.mode.clarify': 'Needs clarification',
  'ovw.detailGraph': 'Workflow graph',
  'ovw.detailGraphHint': 'Scroll to pan · Ctrl + wheel to zoom · click a node for its stage',
  'ovw.detailStageHead': 'Stage',
  'ovw.detailStageHint': 'Pick a node in the graph to read its stage.',
  'ovw.detailSelectStage': 'No stage selected.',
  'ovw.detailKind': 'Kind',
  'ovw.detailScope': 'Affected scope',
  'ovw.detailConfidence': 'Confidence',
  'ovw.detailReason': 'Reason',
  'ovw.detailConfirmation': 'Needs confirmation',
  'ovw.detailTasks': 'Tasks',
  'ovw.detailOpenSpec': 'Openspec',
  'ovw.detailNoSession': 'No live session in this workspace — the artifacts are read-only here.',
  'ovw.detailOpenFailed': 'Could not open the artifact in the sidebar.',
  'ovw.artifactPreview': 'Document preview',
  'ovw.artifactPreviewClose': 'Close',
  'ovw.artifactPreviewLoading': 'Loading the document…',
  'ovw.artifactPreviewMissing': 'This document does not exist yet.',
  'ovw.artifactPreviewFailed': 'Could not read the document: ',
  'ovw.artifactPreviewOpen': 'Open in the sidebar',
  'hist.event': 'Event',
  'hist.intakeClassified': 'Change classified',
  'hist.intakeConfirmed': 'Classification confirmed',
  'hist.intakeModeSet': 'Path adjusted',
  'hist.intakeSettled': 'Classification settled',
  'hist.taskTierFrozen': 'Tier frozen',
  'hist.baselineLocked': 'Baseline locked',
  'hist.stageEntered': 'Stage entered',
  'hist.stageCompleted': 'Stage completed',
  'hist.stageFailed': 'Stage failed',
  'hist.driftDetected': 'Drift detected',
  'hist.modeUpgraded': 'Path upgraded',
  'hist.awaitingConfirm': 'Awaiting confirmation',
  'hist.changeArchived': 'Change archived',
  'hist.changeAbandoned': 'Change abandoned',
  'hist.transitionRejected': 'Transition rejected',
  // 【变更】2026-10-24 (批次十九 2.1)
  'view.brandBaf': 'BAF',
  'dashboard.artifacts': 'Generated artifacts',
  'dashboard.openExternal': 'Open in browser',
  'dashboard.board.title': 'BAF Change Board',
  'dashboard.board.subtitle': 'Every change in this workspace — mode distribution, duration ranking, and each change\'s stage, tasks, and cost.',
  'dashboard.board.generatedAt': 'Generated at',
  'dashboard.board.snapshotNote': 'This page is a snapshot taken when it was opened; refresh inside the app\'s change dashboard for live data.',
  'dashboard.board.tileActive': 'Active changes',
  'dashboard.board.tileArchived': 'Archived',
  'dashboard.board.tileAbandoned': 'Abandoned',
  'dashboard.board.tileTasks': 'Tasks done',
  'dashboard.board.tileDuration': 'Total duration',
  'dashboard.board.tileTokens': 'Total tokens',
  'dashboard.board.chartModes': 'Mode distribution',
  'dashboard.board.chartDuration': 'Duration ranking (top 8)',
  'dashboard.board.allChanges': 'All changes',
  'dashboard.board.empty': 'No change records yet.',
  'dashboard.board.endedAt': 'Ended at',
  'settings.workflowTab.title': 'Workflow graph tab',
  'settings.workflowTab.description': 'Turn off to hide the Workflow graph tab on the conversation view.',
  // 【变更】2026-10-07 (九点批 问题 9): the 门禁总览 read-only row.
  // 【变更】2026-10-18 (工作流确认门 2.1): intro paragraph deleted (see union note).
  'gates.expand': 'Expand',
  'gates.collapse': 'Collapse',
  'gates.loading': 'Loading…',
  'gates.loadFailed': 'Load failed: ',
  'gates.confirmTitle': 'Customer-confirm gates',
  'gates.confirmHint': 'The confirmation cards the workflow pops at decision points; clicking an option runs the listed command.',
  'gates.stageTitle': 'Stage completion gates',
  'gates.stageHint': 'What each stage\'s artifact must satisfy before the flow may advance; work orders quote exactly these lines.',
  'gates.colGate': 'Gate',
  'gates.colNode': 'Stage',
  'gates.colQuestion': 'Question',
  'gates.colOptions': 'Options (command)',
  'gates.colArtifact': 'Artifact',
  'gates.colGateFn': 'Adjudicator',
  'gates.colConditions': 'Pass conditions',
  'gates.colAdvanceGate': 'Advance gate',
  'gates.sentinelNoop': 'dismiss (runs nothing)',
  'gates.sentinelContinued': 'continued by the caller',
  'gates.dynamicOptions': 'options are filled at runtime (from the live workspace state)',
  'gates.onceTitle': 'One-shot confirm gates',
  'gates.onceHint': 'not yet placed on the flow chart (a future release will anchor them)',
  'gates.branchTitle': 'Branches',
  'gates.conditionsCount': 'pass conditions: ',
  'gates.noGate': 'no gate on this node',
  // 【变更】2026-10-25 (批次二十四 2): the page's own chrome.
  'gates.heroLabel': 'Confirmation gate ledger',
  'gates.heroTitle': 'Workflow confirmation gates',
  'gates.heroHelp': 'Every stage of the flow with the gate that guards it — click a node or a gate on the chart to read its detail.',
  'gates.tileStates': 'State nodes',
  'gates.canvasHint': 'Click a node or a gate to read its detail',
  // 【变更】2026-10-18 (工作流确认门 2.3): flow-canvas copy.
  'gates.canvasAria': 'Workflow confirmation-gate flow chart',
  'gates.stageGate': 'stage gate:',
  'gates.detailTitle': 'Gate details',
  'gates.sectionStage': 'Stage gate',
  'gates.sectionEdge': 'Condition to advance',
  'gates.sectionConfirm': 'Confirm gates',
  // 【变更】2026-10-23 (批次十七 2.1): intake branch block, take two — entry
  // box + the three horizontal option cards and their condition lines.
  'gates.entryInput': 'Request input',
  'gates.entryOptNone': 'no active workflow found',
  'gates.entryOptOne': 'one change in progress',
  'gates.entryOptMany': 'multiple unfinished changes — pick one to take over',
  'gates.entryCondNone': 'no active change',
  'gates.entryCondOne': 'one active change',
  'gates.entryCondMany': 'multiple unfinished changes',
  'gates.node.intake': 'Intake',
  'gates.node.open': 'Open',
  'gates.node.clarify': 'Clarify',
  'gates.node.design': 'Design',
  'gates.node.plan': 'Plan',
  'gates.node.implement': 'Implement',
  'gates.node.verify': 'Verify',
  'gates.node.archive': 'Archive',
  'gates.node.drift': 'Drift',
  'artifact.title': 'Stage artifacts',
  'artifact.help': 'One row per stage document. Open reviews/edits it in the sidebar; the state mirrors /baf-status.',
  'artifact.open': 'Open',
  'artifact.gapCount': '{n} items missing (hover to view)',
  'artifact.missing': 'Not generated yet — run /baf-go to reach the stage that creates it',
  'artifact.state.missing': 'not generated',
  'artifact.state.template': 'template unfilled',
  'artifact.state.planned': 'planned',
  'artifact.state.filled': 'filled',
  'artifact.state.clipped': 'clipped',
  'stats.title': 'Session stats',
  'stats.help': 'Whole-session figures from the durable log: turn/step counts, model and tool wall time, and cumulative provider token usage.',
  'stats.breakdownTitle': 'Input {input} · cache read {cacheRead} · cache write {cacheWrite} · output {output}',
  'stats.section.overview': 'Overview',
  'stats.section.tools': 'Tools',
  'stats.section.tokens': 'Tokens',
  'stats.turns': 'Turns',
  'stats.steps': 'Steps',
  'stats.toolCalls': 'Tool calls',
  'stats.llmTime': 'Model time',
  'stats.toolTime': 'Tool time',
  'stats.ttft': 'First token',
  'stats.tokens': 'Tokens',
  'stats.total': 'Total',
  'stats.input': 'Input (uncached)',
  'stats.cacheRead': 'Cache read',
  'stats.cacheWrite': 'Cache write',
  'stats.output': 'Output',
  'stats.cacheHit': 'Cache hit',
  'stats.pending': 'No usage recorded yet — stats appear after the first completed step',
  'empty.hint': 'Describe the change, then start intake.',
  'openspec.skipped': 'OpenSpec skipped (fast path)',
  'graph.aria': 'BAF go workflow graph',
  'graph.ops': 'Operations',
  'none': '—',
}

/** Simplified Chinese copy. */
export const zh: Record<WorkflowTabKey, string> = {
  // 【变更】2026-10-06 (问题 1): 页签呈现的是工作流图，改名「工作流图」。
  'view.workflow': '工作流图',
  // 【变更】2026-10-21 (批次十 测试流图): 会话测试流图页签 + 工作流通用开关行。
  'view.testFlow': '测试流图',
  'settings.testFlowTab.title': '测试流图',
  // 【变更】2026-10-22 (批次十一 1): 描述去掉括注（单元测试结果）——页签名已自明。
  'settings.testFlowTab.description': '关闭后，对话 Tab 不再显示「测试流图」。',
  'tflow.verdictCoverage': '覆盖率',
  'tflow.verdictStatic': '静态检查',
  'tflow.verdictReport': '报告时间',
  'tflow.coverageValue': '{line}%（≥ {min}%）',
  'tflow.staticValue': '{n} 项错误',
  'tflow.gateMode': '门禁模式',
  'tflow.state.passed': '通过',
  'tflow.state.failed': '未通过',
  'tflow.state.idle': '未运行',
  'tflow.required': '必装',
  'tflow.optional': '选装',
  'tflow.openReport': '打开报告',
  'tflow.noCwd': '本会话未绑定工作区目录——测试流图读取工作区质量报告（由 /baf-quality check · /baf-quality lint 生成）。',
  'tflow.loadFailed': '测试流状态读取失败 —',
  'tflow.aria': '单元测试执行流程与结果',
  // 【变更】2026-10-22 (批次十二 2.2): 执行纪律横幅已删除——纪律文案不再出现。
  'tflow.node.build': 'gcc 编译',
  'tflow.node.test': 'ceedling 单元测试',
  'tflow.node.instrument': 'gcov 覆盖率插桩',
  'tflow.node.report': 'gcovr 报告生成',
  'tflow.node.gate': '覆盖率检查',
  'tflow.node.lint': 'cpplint 风格检查',
  'tflow.node.analyze': 'cppcheck 静态分析',
  'tflow.node.format': 'clang-format 格式化',
  'tflow.nodeEn.build': 'Build (gcc)',
  'tflow.nodeEn.test': 'Ceedling test',
  'tflow.nodeEn.instrument': 'Instrument (gcov)',
  'tflow.nodeEn.report': 'Report (gcovr)',
  'tflow.nodeEn.gate': 'Coverage gate',
  'tflow.nodeEn.lint': 'Style lint (cpplint)',
  'tflow.nodeEn.analyze': 'cppcheck',
  'tflow.nodeEn.format': 'clang-format',
  // 【变更】2026-10-22 (批次十一 5): 点击步骤后的右侧详情文案（作用/结果）。
  'tflow.pickHint': '点击左侧步骤，可在此查看它的详细信息与执行结果。',
  'tflow.labelTool': '工具',
  'tflow.labelType': '类型',
  'tflow.labelCommand': '命令',
  'tflow.labelPurpose': '作用',
  'tflow.labelResult': '执行结果',
  'tflow.reportPath': 'HTML 报告',
  'tflow.chainDone': '已随 /baf-quality 链执行（报告时间 {at}）',
  'tflow.chainIdle': '尚未运行——执行 /baf-quality check 后此处显示结果。',
  'tflow.gateUndecided': '覆盖率报告已生成，但未包含达标结论。',
  'tflow.staticIdle': '尚未运行——执行 /baf-quality lint 后此处显示结果。',
  // 【变更】2026-10-22 (批次十二 2.5): 「无独立报告」注记已删除，改为可配置路径。
  'tflow.formatIdle': '最终 clang-format 在 lint 修完后、代码冻结前执行——用「运行」按钮（对配置的路径执行 clang-format -i）。',
  'tflow.desc.build': '用 gcc 编译生产源码与测试桩，链接 Unity/CMock 测试可执行件，是整条 check 链的第一步：编译不过，后面的测试、插桩与覆盖率都无从谈起。',
  'tflow.desc.test': '用 ceedling 驱动全部单元测试。日常路径不做覆盖率插桩、速度快——改完代码先用它快速回归，绿了再走 check 全链。',
  'tflow.desc.instrument': '用 gcov 对源码做覆盖率插桩并重新编译，仅 check 路径执行（日常 test 不插桩），产出供 gcovr 统计的行覆盖数据。',
  'tflow.desc.report': '用 gcovr 汇总插桩数据，得出整体行覆盖率结论，并把 HTML/Cobertura 报告落盘到工作区报告目录，供浏览器逐文件回看。',
  'tflow.desc.gate': '读取覆盖率报告做达标判定：行覆盖率 ≥ 阈值（默认 80%）通过，结论写入 ut-coverage.json；报告未生成按未通过处理。',
  'tflow.desc.lint': '用 cpplint 按 SORA 定制规则（由仓根 CPPLINT.cfg 驱动，非 Google 默认集）做风格与禁项检查；与 cppcheck 同在 /baf-quality lint 一次执行。',
  'tflow.desc.analyze': '用 cppcheck 做缺陷与未定义行为类静态分析；第三方、测试与构建目录按抑制文件豁免，错误数计入顶部静态检查结论。',
  'tflow.desc.format': '对本轮触及的 .c/.h 做最终排版（clang-format -i）——必须等 lint 修完才执行，代码冻结前完成，此后不再改源码。',
  // 【变更】2026-10-22 (批次十二 2.1/2.3/2.5/2.6): 单阶段运行、格式化路径行、配置文件预览弹窗。
  'tflow.run': '运行',
  'tflow.runDone': '运行完成（退出码 0）',
  'tflow.runFailed': '运行失败（退出码 {code}）',
  'tflow.runToolMissing': '未找到 baf-quality 命令——请先安装质量工具链（工作流 · 测试流 · 环境）。',
  'tflow.runNoCwd': '本会话未绑定工作区目录。',
  // 【变更】2026-10-22 (批次十四 5): 运行失败的错误解析卡。
  'tflow.errTitle': '错误解析',
  'tflow.errCause': '原因',
  'tflow.errFix': '解决方法',
  'tflow.errTimeoutCause': '命令超时——在时限内没有跑完，已被自动终止。',
  'tflow.errTimeoutFix': '先直接重试一次；若仍超时，缩小运行范围（如只跑单个测试文件），或把输出贴进会话让 AI 分析耗时点。',
  'tflow.errToolCause': '未找到工具「{tool}」——它还没安装、或不在 PATH 里，命令并没有真正执行。',
  'tflow.errToolFix': '到 工作流 · 测试流 · 环境 卡点「一键安装」：gem/pip 类工具会自动安装，GCC / Ruby / Cppcheck / LLVM 按安装报告的提示手动安装。',
  'tflow.errCfgCause': '工程里缺少这一步要读的配置文件（默认模板还没有写入工程目录）。',
  'tflow.errCfgFix': '到 工作流 · 测试流 · 环境 卡点「一键安装」，把配置文件按默认模板复制进工程后再运行。',
  'tflow.errPathCause': '命令要访问的文件或目录在工程里不存在——命令并没有真正执行成功。',
  'tflow.errPathFix': '对照输出里报错的路径检查工程目录结构（可能与命令假设的不一致）；缺少的目录先创建，或在这里调整命令。',
  'tflow.errCompileCause': '源码编译失败——输出里第一个 error 标出了出错的文件与行号。',
  'tflow.errCompileFix': '按提示修复对应位置的语法/链接错误后重跑；也可以把输出贴进会话，让 AI 定位。',
  'tflow.errTestCause': '单元测试没有全部通过——未通过的用例在输出里以 FAILED 列出。',
  'tflow.errTestFix': '查看 FAILED 用例名，修正实现或用例后重跑这一步。',
  'tflow.errCoverageCause': '行覆盖率低于门禁阈值。',
  'tflow.errCoverageFix': '为未覆盖的分支补充测试；或到 .baf/quality/ceedling-config.json 确认阈值设置是否符合预期。',
  'tflow.errStaticCause': '静态检查发现了问题——数量见输出的统计行。',
  'tflow.errStaticFix': '按输出中的 文件:行号 逐条修复；需要豁免的条目写进 CPPLINT.cfg / cppcheck-suppressions.xml。',
  'tflow.errPermCause': '文件被占用或权限不足，命令读不到需要的文件。',
  'tflow.errPermFix': '关闭占用该文件的程序（IDE、杀毒扫描等）后重试；必要时以管理员身份运行。',
  'tflow.errGenericCause': '命令以退出码 {code} 结束，没有命中已知的错误模式。',
  'tflow.errGenericFix': '查看输出末尾的错误行；也可以把整段输出贴进会话，让 AI 协助分析。',
  // 【变更】2026-10-22 (批次十三 1/2/4): 全部运行链、关闭步骤的展示、工作流图跳转键。
  'tflow.runAll': '全部运行',
  'tflow.chainRunning': '运行中…',
  'tflow.chainSkipped': '已跳过——该步骤已在测试流画布（工作流 · 测试流）中关闭。',
  'tflow.chainSummary': '链跑完——共 {n} 步 · {secs}s，存在失败；点击失败卡片查看详情。',
  'tflow.chainAllPassed': '链跑完——启用的 {n} 步全部通过 · {secs}s。',
  'tflow.chainHaltedNote': '「{stage}」失败后中止——该步骤的「错误即中止」开关已开启，后续步骤未运行。',
  'tflow.runDisabled': '未运行——该步骤已关闭。',
  'tflow.stageOff': '已关闭',
  'tflow.stageOffNote': '该步骤已在测试流画布（工作流 · 测试流）中关闭；可前往打开后运行。',
  'flow.testFlowJump': '测试流图',
  'flow.testFlowJumpDesc': '跳转到测试流图的这一步',
  'tflow.cfgFiles': '配置文件',
  'tflow.cfgPreview': '配置文件预览',
  'tflow.cfgOpen': '打开文件',
  'tflow.cfgClose': '关闭',
  'tflow.cfgMissing': '文件不存在——请先安装质量资产（工作流 · 测试流 · 环境 · 一键安装）。',
  'tflow.cfgLoading': '读取中…',
  'tflow.fmtPathLabel': '格式化路径',
  'strip.current': '当前',
  'strip.totalTime': '变更耗时',
  'strip.totalTokens': '会话 tokens',
  'strip.empty': '暂无变更 — 参考图（模板）',
  'strip.blocked': '阻断',
  'strip.idle': '空闲',
  'mode.template': '模板（空闲）',
  'mode.fullGoPath': '完整流程',
  'mode.bugFixPath': '缺陷修复路径',
  'mode.clarify': '需先澄清',
  'mode.help': '模板 = 还没开始变更时的参考图。分类确认后才会变成完整流程 / 缺陷修复路径 / 需澄清。',
  'card.duration': '耗时',
  'card.tokens': 'Tokens',
  'card.next': '下一跳',
  'card.condition': '条件',
  'card.done': '已作',
  'card.todo': '未作',
  'card.current': '当前',
  'metrics.pending': '本阶段消耗的模型用量',
  'route.title': '当前路由',
  'route.noneAuto': 'Auto 已接管 · 等待首次派单',
  'route.fallback': '回落',
  'route.keyword': '词',
  'route.failed': '失败',
  'route.escalation': '升档',
  'route.tierHigh': 'Commander',
  'route.tierMid': 'Reviewer',
  'route.tierLow': 'Worker',
  // 【变更】2026-10-07 (九点批 问题 2/4): 门卡上的派单预告行。
  'route.dispatchOn': '确认后派单：',
  'intake.title': '变更分类',
  'intake.help': '写源码前判定类型/模式/范围。触发：对话或「新建变更」。确认→投影；拒绝→放弃；补充→继续对话。',
  'intake.heuristicNote': '类型 / 影响范围 / 置信度是系统关键词初判（没匹配上就显示「待定」，确认分类不会改写它们）；模式是你在分类卡上点的路径；选「缺陷修复路径」会把类型定为「缺陷」。',
  // 【变更】2026-09-24 (demo6 问题 8): 置信度给出可读解释——40% 基准 / 70% 命中
  // 关键词，且说明它在流程中何时落定（类型随确认、范围随计划白名单）。
  'intake.confidenceHelp': '初判置信度 = 关键词初判的把握程度：描述里命中「新增 / 需求 / feat」或「bug / 修复 / fix」这类关键词时为 70%；一个关键词都没命中时为基准 40%。它只影响系统的最初建议——路径由你在分类卡上的点选决定，与这个数字无关。这两个字段会随流程落定：类型在分类确认时确定，影响范围在计划冻结文件白名单时确定。',
  'intake.allowlist': '白名单',
  'intake.kind': '类型',
  'intake.mode': '模式',
  'intake.scope': '影响范围',
  'intake.confidence': '初判置信度',
  'intake.openspec': 'OpenSpec',
  'intake.reasons': '原因码',
  'intake.summary': '摘要',
  'intake.confirmation': '确认状态',
  'intake.confirmation.pending': '待你确认',
  'intake.confirmation.confirmed': '已确认（路径由你的点选落定）',
  'intake.confirmation.rejected': '已拒绝',
  'kind.new-requirement': '新需求',
  'kind.bug': '缺陷',
  'kind.maintenance': '维护',
  // 【变更】2026-09-23 (demo1 十问题 3/9): 待定 says WHEN it settles — bug-fix
  // 选择在分类确认即定类型，其余在归档时随账本落定。
  'kind.unknown': '待分类/归档确定',
  'scope.single-file': '单文件',
  'scope.small-local': '局部小改',
  'scope.cross-module': '跨模块',
  'scope.public-api': '公共 API',
  // 【变更】2026-09-25 (用户需求 工作流 7): 未落定的影响范围读「待计划阶段确认」——
  // 计划阶段冻结文件白名单时确定（pipeline settled-at-plan），不是归档时确定。
  'scope.unknown': '待计划阶段确认',
  'intake.confirm': '确认分类',
  'intake.confirmFull': '确认 · 完整流程',
  'intake.confirmFullHelp': '确认分类并进入完整流程（一次点击 = 确认 + 进入建立变更）',
  'intake.confirmBugFix': '确认 · 缺陷修复路径',
  'intake.confirmBugFixHelp': '确认走缺陷修复快速路径——先在下方补齐五个缺陷字段，点击时一并提交',
  'intake.enterOpenHelp': '分类已确认但进入建立变更被阻断（如 Git 不可用）——点击重试进入',
  'intake.reject': '拒绝并退出',
  'intake.supplement': '在对话中补充',
  'intake.required': '需要',
  'intake.notRequired': '不需要',
  'intake.bugFixPath.title': 'fast-path Bug 字段',
  'intake.bugFixPath.help': '可选加速：不填直接点「确认 · 缺陷修复路径」会建 TODO 草稿（模型按工单补齐）；填齐 5 字段再提交则一次建立完整记录。',
  'intake.bugFixPath.problem': '现象',
  'intake.bugFixPath.rootCause': '根因',
  'intake.bugFixPath.file': '受影响文件（每行一个）',
  'intake.bugFixPath.fileHelp': '可重复也可换行 — 每行就是一个 file= 参数。',
  'intake.bugFixPath.test': '回归测试文件',
  'intake.bugFixPath.testCmd': '回归测试命令',
  'intake.bugFixPath.submit': '提交 fast-path',
  'intake.bugFixPath.required': 'fast-path 必须填齐 5 字段后才能提交。',
  'detail.title': '阶段详情',
  'detail.empty': '在流程图中选择一个阶段',
  'detail.checklist': '本阶段清单',
  'detail.todoTitle': '未作（优先处理）',
  'detail.doneTitle': '已作',
  'detail.todoEmpty': '本阶段暂无未作项',
  'detail.purpose': '目标',
  'detail.prerequisites': '前置条件',
  'detail.actions': '操作步骤',
  'detail.artifacts': '期望产物',
  'detail.completion': '完成条件',
  // 【变更】2026-09-25 (用户需求 工作流 4): 失败信息只在阶段真正异常时渲染——
  // 标题改为「异常原因与解决方法」，常见失败参考表已删除。
  'detail.failure': '异常原因与解决方法',
  'detail.entries': '入口',
  'detail.transitionsIn': '入边条件',
  'detail.transitionsOut': '出边条件',
  'detail.status': '状态',
  'detail.skipReasons': '跳过/阻断理由',
  'detail.liveArtifacts': '已记录产物',
  'detail.zh': '中文',
  'detail.en': 'English',
  'status.locked': '锁定',
  'status.available': '可用',
  'status.in-progress': '进行中',
  'status.completed': '已完成',
  'status.failed': '失败',
  'status.blocked': '阻断',
  'status.drifted': '漂移',
  // 【变更】2026-09-23 (demo1 十问题 9): 终态后未走到的节点读「已忽略」——
  // 不再显示 锁定/空闲（终态之后没有待解锁的东西）。
  'status.skipped': '已忽略',
  'status.template': '空闲',
  'status.clipped': '已裁剪',
  'status.awaiting': '待客户确认',
  'status.abandoned': '已放弃',
  'terminal.completed.artifacts': '归档在 openspec/changes/archive/<变更ID>/——保留各阶段文档与验收报告',
  'terminal.completed.completion': '变更通过验证并已归档；完整审计记录保留，随时可回查',
  'terminal.abandoned.artifacts': '文件原地保留供审计（不移动归档）；放弃决定已记录在案',
  'terminal.abandoned.completion': '变更在完成前被放弃；不再有任何流程动作',
  // §22 — pendingGate card.
  'pendingGate.title': '工作区需要先初始化',
  'pendingGate.action': '在 Tab 解决',
  'pendingGate.classifyTitle': '需求分类待确认',
  'pendingGate.bugFixFieldsHelp': '缺陷修复路径可不填字段直接确认——系统建立 TODO 草稿（proposal.md + plan.json），模型按工单补齐；右侧表单填齐后再提交则一次建立完整记录',
  'gate.bannerTitle': '工作流决策',
  // §22.14 — abandon change-level gate button label.
  'action.abandon': '放弃此变更',
  'abandon.confirmHelp': '放弃将结束此变更并仅保留审计轨迹。slash 形式 /baf-workflow-abandon confirm 效果相同。',
  'gate.designDone': '设计已完成 · 请确认进入计划',
  'gate.verifyPassed': '验证已完成 · 请确认归档',
  'gate.confirmIntoPlan': '确认进入下一阶段',
  'gate.confirmArchive': '确认归档',
  'gate.replyToContinue': '再敲一次 /baf-go 继续',
  // §22.16 P3 freeze contract removed 2026-09 — see WorkflowTabKey.
  'lane.bugFixPath': '缺陷修复路径（升级前）',
  'lane.fullGoPath': '完整流程（升级后）',
  'lane.help': '缺陷修复路径中途升级后，两条路径都保留：升级前那条置灰，但不删除。',
  'edge.upgraded': '升级为完整流程：{from} → {to}',
  'edge.cause': '原因',
  'edge.at': '时间',
  'edge.preserved': '升级前产物（未走 OpenSpec）',
  'edge.preservedEmpty': '升级前没有产生产物',
  'node.intake': '分类',
  'node.open': '建立变更',
  'node.clarify': '澄清',
  'node.design': '设计',
  'node.plan': '计划',
  'node.implement': '实现',
  'node.verify': '验证',
  'node.archive': '归档',
  'node.drift': '漂移',
  'node.completed': '完成',
  'node.abandoned': '已放弃',
  'action.enterOpen': '进入建立变更',
  'action.startStage': '开始阶段',
  'action.confirmArchive': '确认归档',
  'action.advance': '推进',
  // 【变更】2026-09-25 (用户需求 工作流 1): 常驻推进按钮改为顶部推进对话框，
  // 需要推进时才弹出；确认即推进（advanceDialog 即确认，不再二次弹窗）。
  'advanceDialog.title': '{from}已完成 · 请确认进入{to}',
  'advanceDialog.body': '【状态变化】{from}（已完成，通过完成门）→ {to}（待开始）\n\n【确认后】\n- 工作流推进到 {to}，系统自动派单给模型继续',
  'advanceDialog.confirm': '确认推进 · 进入{to}',
  'advanceDialog.dismiss': '暂不推进',
  'action.backToActive': '回到进行中的变更',
  'action.resume': '复位到…',
  'action.resumeHelp': '漂移不会自行消失。请选择要重新进入的阶段——它之后的阶段会重跑。',
  'action.refresh': '刷新',
  'action.dashboard': '变更总览',
  'action.config': '配置',
  'action.newChange': '新建变更',
  'action.newChangeHelp': '启动 intake；确认前不写源码。',
  'dashboard.title': '变更总览',
  'dashboard.close': '关闭',
  'dashboard.help': '本工作区全部变更 — 阶段、任务进度、耗时与 token 一览。',
  'dashboard.empty': '暂无进行中的变更。',
  'dashboard.activeChanges': '进行中变更',
  'dashboard.activeSection': '进行中的变更',
  'dashboard.archiveSection': '归档历史',
  'dashboard.archived': '已归档',
  'dashboard.completion': '任务完成率',
  // 【变更】2026-09-24 (demo6 问题 7): 「任务」改名「计划任务」并配悬停解释——
  // 统计的是 plan.json 任务清单的勾选数，不是任意待办。
  'dashboard.tasks': '计划任务',
  'dashboard.tasksHelp': '计划任务：该变更实现账本（plan.json / bug-fix-path-ledger.json）中已完成任务的数量。',
  'dashboard.loadFailed': '总览加载失败 — 点刷新重试。',
  'dashboard.historyTitle': '历史流程图',
  // 【变更】2026-10-23 (批次十八 2.2/2.3): the 工作流 page's 变更总览 tab.
  'ovw.title': '变更总览',
  'ovw.help': '本项目的全部变更 — 进行中、已完成，以及已放弃的记录都在这里。',
  'ovw.project': '项目路径',
  'ovw.completed': '已完成',
  'ovw.abandoned': '已放弃',
  'ovw.columnChange': '变更',
  'ovw.columnMode': '模式',
  'ovw.columnState': '状态',
  'ovw.columnEnded': '结束时间',
  'ovw.empty': '本项目还没有任何变更。',
  'ovw.noWorkspace': '未绑定工作区 — 在本项目里开一个会话后即可看到它的变更。',
  'ovw.loading': '正在加载变更…',
  'ovw.refresh': '刷新',
  // 【变更】2026-10-24 (批次十九 1.1/1.2/1.3/1.4)
  'rail.sideRail': '变更信息',
  'rail.stage': '阶段',
  'rail.stageSelected': '已选阶段',
  'rail.stageCurrent': '当前阶段',
  'strip.startedAt': '开始时间',
  'ovw.clickHint': '点击变更项可展开它的流程图与完整历史记录。',
  'ovw.detailOpen': '查看详情',
  'ovw.detailTitle': '变更详情',
  'ovw.detailFlow': '阶段流程',
  'ovw.detailHistory': '历史记录',
  'ovw.detailArtifacts': '阶段产物',
  'ovw.detailMetrics': '耗时与 Tokens',
  'ovw.detailIntake': '变更分类',
  'ovw.detailLoading': '正在加载变更详情…',
  'ovw.detailFailed': '无法加载该变更的详情。',
  'ovw.detailEmpty': '该变更还没有历史记录。',
  'ovw.detailClose': '关闭',
  'ovw.detailUnknownChange': '该变更已不在项目台账中。',
  // 【变更】2026-10-24 (批次二十 1/3): the ledger's console copy + the 变更详情
  // workspace's four zones.
  'ovw.ledgerLabel': '变更台账',
  // 【变更】2026-10-25 (批次二十四 2): the ledger's list section head.
  'ovw.listLabel': '变更记录',
  // 【变更】2026-10-26 (批次二十八 5): 变更记录视图控件。
  'ovw.categoryLabel': '分类',
  'ovw.sortLabel': '排序',
  'ovw.modeLabel': '流程',
  'ovw.searchPlaceholder': '搜索变更编号',
  'ovw.filteredCount': '显示 {shown} / {total} 条',
  'ovw.noMatch': '没有符合当前筛选条件的变更。',
  'ovw.externalFailed': '看板未能在浏览器中打开。',
  'ovw.category.all': '全部',
  'ovw.category.active': '进行中',
  'ovw.category.completed': '已完成',
  'ovw.category.abandoned': '已放弃',
  'ovw.sort.default': '默认顺序',
  'ovw.sort.durationDesc': '耗时最长',
  'ovw.sort.durationAsc': '耗时最短',
  'ovw.sort.tasksDesc': '任务完成率',
  'ovw.sort.idAsc': '变更编号',
  'ovw.mode.all': '全部流程',
  'ovw.mode.fullGoPath': '完整流程',
  'ovw.mode.bugFixPath': 'Bug 修复路径',
  'ovw.mode.clarify': '待澄清',
  'ovw.detailGraph': '工作流图',
  'ovw.detailGraphHint': '滚轮平移 · Ctrl + 滚轮缩放 · 点击节点查看该阶段',
  'ovw.detailStageHead': '阶段详情',
  'ovw.detailStageHint': '在中间的流程图上点选一个节点，即可查看该阶段详情。',
  'ovw.detailSelectStage': '尚未选择阶段。',
  'ovw.detailKind': '变更类型',
  'ovw.detailScope': '影响范围',
  'ovw.detailConfidence': '置信度',
  'ovw.detailReason': '判定依据',
  'ovw.detailConfirmation': '需人工确认',
  'ovw.detailTasks': '任务进度',
  'ovw.detailOpenSpec': '需要 Openspec',
  'ovw.detailNoSession': '该工作区没有可用会话 — 此处的阶段产物仅作只读展示。',
  'ovw.detailOpenFailed': '无法在侧栏打开该产物。',
  'ovw.artifactPreview': '文档预览',
  'ovw.artifactPreviewClose': '关闭',
  'ovw.artifactPreviewLoading': '正在读取文档…',
  'ovw.artifactPreviewMissing': '该文档尚未生成。',
  'ovw.artifactPreviewFailed': '无法读取文档：',
  'ovw.artifactPreviewOpen': '在侧栏打开',
  'hist.event': '事件',
  'hist.intakeClassified': '变更分类',
  'hist.intakeConfirmed': '分类已确认',
  'hist.intakeModeSet': '路径已调整',
  'hist.intakeSettled': '分类已收敛',
  'hist.taskTierFrozen': '档位已冻结',
  'hist.baselineLocked': '基线已锁定',
  'hist.stageEntered': '进入阶段',
  'hist.stageCompleted': '阶段完成',
  'hist.stageFailed': '阶段失败',
  'hist.driftDetected': '检测到漂移',
  'hist.modeUpgraded': '路径升级',
  'hist.awaitingConfirm': '等待确认',
  'hist.changeArchived': '变更已归档',
  'hist.changeAbandoned': '变更已放弃',
  'hist.transitionRejected': '推进被拒',
  // 【变更】2026-10-24 (批次十九 2.1)
  'view.brandBaf': 'BAF',
  'dashboard.artifacts': '已生成产物',
  'dashboard.openExternal': '在浏览器中打开',
  'dashboard.board.title': 'BAF 变更看板',
  'dashboard.board.subtitle': '本工作区全部历史变更记录 — 模式分布、耗时排行，以及每条变更的阶段、任务进度与成本。',
  'dashboard.board.generatedAt': '生成时间',
  'dashboard.board.snapshotNote': '本页为打开时刻的数据快照；最新数据请回到应用内「变更总览」刷新查看。',
  'dashboard.board.tileActive': '进行中变更',
  'dashboard.board.tileArchived': '已归档',
  'dashboard.board.tileAbandoned': '已放弃',
  'dashboard.board.tileTasks': '任务完成',
  'dashboard.board.tileDuration': '累计耗时',
  'dashboard.board.tileTokens': '累计 Tokens',
  'dashboard.board.chartModes': '模式分布',
  'dashboard.board.chartDuration': '耗时排行（Top 8）',
  'dashboard.board.allChanges': '全部变更',
  'dashboard.board.empty': '暂无变更记录',
  'dashboard.board.endedAt': '结束于',
  'settings.workflowTab.title': '工作流图',
  'settings.workflowTab.description': '关闭后，对话 Tab 不再显示「工作流图」。',
  // 【变更】2026-10-07 (九点批 问题 9): 门禁总览·只读行。
  // 【变更】2026-10-18 (工作流确认门 2.1): 首段说明文字删除（见 union 注）。
  'gates.expand': '展开',
  'gates.collapse': '收起',
  'gates.loading': '读取中…',
  'gates.loadFailed': '读取失败：',
  'gates.confirmTitle': '客户确认门',
  'gates.confirmHint': '工作流走到关键节点时弹出的确认卡；点选项＝执行括号里的命令。',
  'gates.stageTitle': '阶段完成门',
  'gates.stageHint': '每个阶段的产物必须满足的条件；工单派发引用的正是这些条件行。',
  'gates.colGate': '门禁',
  'gates.colNode': '阶段',
  'gates.colQuestion': '问题',
  'gates.colOptions': '选项（命令）',
  'gates.colArtifact': '产物',
  'gates.colGateFn': '裁决函数',
  'gates.colConditions': '完成条件',
  'gates.colAdvanceGate': '推进确认门',
  'gates.sentinelNoop': '关闭（不执行命令）',
  'gates.sentinelContinued': '由调用方续接',
  'gates.dynamicOptions': '选项在运行时按现场状态动态生成',
  'gates.onceTitle': '一次性确认门',
  'gates.onceHint': '暂未在流程图上定位的确认门（后续版本会补上位置）',
  'gates.branchTitle': '分支',
  'gates.conditionsCount': '完成条件数：',
  'gates.noGate': '本节点无门禁',
  // 【变更】2026-10-25 (批次二十四 2): 页面自身的标识区。
  'gates.heroLabel': '确认门台账',
  'gates.heroTitle': '工作流确认门',
  'gates.heroHelp': '流程的每一个阶段与守在它门口的门禁 — 点击图上的节点或门禁即可查看明细。',
  'gates.tileStates': '状态节点',
  'gates.canvasHint': '点击节点或门禁查看明细',
  // 【变更】2026-10-18 (工作流确认门 2.3): 流程图画布文案。
  'gates.canvasAria': '工作流确认门流程图',
  'gates.stageGate': '阶段门：',
  'gates.detailTitle': '门禁明细',
  'gates.sectionStage': '阶段门禁',
  'gates.sectionEdge': '进入下一步的条件',
  'gates.sectionConfirm': '确认门',
  // 【变更】2026-10-23 (批次十七 2.1): 接单前分支判定块二改 —— 需求输入
  // 醒目框 + 三张横向选项卡（选项文案 + 条件行都上节点）。
  'gates.entryInput': '需求输入',
  'gates.entryOptNone': '未发现进行中的工作流',
  'gates.entryOptOne': '已有进行中的变更',
  'gates.entryOptMany': '多条未完成的变更，请选择接手对象',
  'gates.entryCondNone': '无进行中的变更',
  'gates.entryCondOne': '已有一条进行中的变更',
  'gates.entryCondMany': '多条未完成的变更',
  'gates.node.intake': '接单',
  'gates.node.open': '建立变更',
  'gates.node.clarify': '澄清',
  'gates.node.design': '设计',
  'gates.node.plan': '计划',
  'gates.node.implement': '实现',
  'gates.node.verify': '验证',
  'gates.node.archive': '归档',
  'gates.node.drift': '漂移回归',
  'dashboard.focus': '当前焦点',
  'dashboard.openChange': '在工作流页查看该变更',
  'dashboard.note': '点击行即在流程图聚焦该变更；终态行的产物从归档目录读取。',
  'artifact.title': '阶段产物',
  'artifact.help': '每个阶段文档一行；「打开」在侧栏查看/编辑。状态与 /baf-status 一致。',
  'artifact.open': '打开',
  'artifact.gapCount': '缺 {n} 项（悬停查看）',
  'artifact.missing': '尚未生成——先 /baf-go 推进到产出它的阶段',
  'artifact.state.missing': '尚未生成',
  'artifact.state.template': '仍是未填的模板',
  'artifact.state.planned': '已计划',
  'artifact.state.clipped': '已裁剪',
  'artifact.state.filled': '已填写',
  'stats.title': '会话统计',
  'stats.help': '来自完整会话日志的累计数字：回合/步骤数、模型与工具耗时、以及按 provider 上报累计的 token 用量。',
  'stats.breakdownTitle': '输入 {input} · 缓存读 {cacheRead} · 缓存写 {cacheWrite} · 输出 {output}',
  'stats.section.overview': '概览',
  'stats.section.tools': '工具',
  'stats.section.tokens': 'Tokens',
  'stats.turns': '回合',
  'stats.steps': '步骤',
  'stats.toolCalls': '工具调用',
  'stats.llmTime': '模型耗时',
  'stats.toolTime': '工具耗时',
  'stats.ttft': '首字延迟',
  'stats.tokens': 'Tokens',
  'stats.total': '合计',
  'stats.input': '输入（未命中）',
  'stats.cacheRead': '缓存读',
  'stats.cacheWrite': '缓存写',
  'stats.output': '输出',
  'stats.cacheHit': '缓存命中',
  'stats.pending': '暂无用量——完成一个步骤后统计会出现',
  'empty.hint': '描述变更，然后启动 intake。',
  'openspec.skipped': '已跳过 OpenSpec（缺陷修复路径）',
  'graph.aria': 'BAF go 工作流图',
  'graph.ops': '细分操作',
  'none': '—',
}
