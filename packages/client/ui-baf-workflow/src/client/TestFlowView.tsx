/**
 * 【变更】2026-10-21 (批次十 测试流图): the conversation Tab「测试流图」— the
 * unit-test execution flow (the SAME 8-step order the 质量监控 page's chart
 * teaches) painted with THIS workspace's real results: the check chain and
 * gate read `.baf/reports/ut-coverage.json`, lint/analyze read
 * `.baf/reports/static-analysis.json` (cpplint + cppcheck run inside one
 * `/baf-quality lint`), format keeps no report. Missing reports paint 未运行
 * — never a fabricated verdict. Push-fed: the same
 * `baf-workflow/projection-appended` subscription the 工作流图 tab uses, plus
 * a manual 刷新.
 * 【变更】2026-10-22 (批次十一 5): the surface is now a CLICK-TO-INSPECT split
 * — a state-colored step rail on the left (one node per step, metrics at a
 * glance) and a detail pane on the right that answers, for the clicked step:
 * 工具/类型/命令/状态/指标, 作用 (what it is for), and 执行结果 (the real
 * numbers this workspace's reports carry — coverage line vs threshold, lint
 * error counts, report timestamps, the HTML report opener). Same data
 * contract as 批次十; presentation only.
 * 【变更】2026-10-22 (批次十二): 2.1 every rail node carries its own 运行
 * button — the host Remote spawns the stage's baf-wrapped command in the
 * workspace root and the real outcome (exit code + output tail) renders in
 * the detail pane's run block; 2.2 the 执行纪律 band is GONE; 2.3 the strip
 * gains a 配置 button opening the same 工作流 config page the 工作流图 tab
 * opens; 2.5 the format step drops the 无独立报告 note and gains a
 * configurable path (persisted device-local) its run button formats; 2.6 the
 * detail pane lists each step's 配置文件 (CPPLINT.cfg / project.yml /
 * .clang-format / …) as chips — click previews the file in a modal (open it
 * in the right sidebar from there).
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  TEST_FLOW_STEPS,
  projectTestFlowSteps,
  type TestFlowStepId,
  type WorkflowTabFileReadResult,
  type WorkflowTabStageRunResult,
  type WorkflowTabTestFlowStatus,
} from './tab-types.ts'
import type { WorkflowTabKey } from './locales.ts'
import css from './TestFlowView.module.css'

/** Session-bound 测试流图 Remote callbacks. */
export interface TestFlowViewInjected {
  /** Re-read the workspace's test-flow status. */
  refresh: () => Promise<WorkflowTabTestFlowStatus>
  /** Open one workspace file in the right sidebar (the HTML coverage report). */
  openArtifact: (path: string) => void
  /**
   * Real-time push subscription — the same workspace event the 工作流图 tab
   * listens on; the returned disposer unregisters.
   */
  subscribe: (onChange: () => void) => () => void
  /**
   * 【变更】2026-10-22 (批次十二 2.1): run ONE stage's baf-wrapped command in
   * the workspace root. `arg` carries the format node's configured path
   * ('' elsewhere); the result is the REAL outcome (exit code + output tail).
   */
  runStage: (stage: TestFlowStepId, arg: string) => Promise<WorkflowTabStageRunResult>
  /**
   * 【变更】2026-10-22 (批次十二 2.6): read one workspace config file for the
   * preview modal.
   */
  readFile: (path: string) => Promise<WorkflowTabFileReadResult>
  /**
   * 【变更】2026-10-22 (批次十二 2.3): open the 工作流 config page — the same
   * main-stage panel the 工作流图 tab's 配置 button selects.
   */
  openWorkflowConfig: () => void
}

export type TestFlowViewProps =
  & ConvViewProps
  & PropsLocale<'baf.go-workflow'>
  & InjectFace<TestFlowViewInjected>

/** zh label key per step (the settings-page chart's twin catalog). */
const NODE_LABEL: Record<TestFlowStepId, WorkflowTabKey> = {
  build: 'tflow.node.build',
  test: 'tflow.node.test',
  instrument: 'tflow.node.instrument',
  report: 'tflow.node.report',
  gate: 'tflow.node.gate',
  lint: 'tflow.node.lint',
  analyze: 'tflow.node.analyze',
  format: 'tflow.node.format',
}

/** Inline English name per step (one name line, like the settings chart). */
const NODE_EN: Record<TestFlowStepId, WorkflowTabKey> = {
  build: 'tflow.nodeEn.build',
  test: 'tflow.nodeEn.test',
  instrument: 'tflow.nodeEn.instrument',
  report: 'tflow.nodeEn.report',
  gate: 'tflow.nodeEn.gate',
  lint: 'tflow.nodeEn.lint',
  analyze: 'tflow.nodeEn.analyze',
  format: 'tflow.nodeEn.format',
}

/** 作用 key per step (批次十一 5 detail pane). */
const NODE_PURPOSE: Record<TestFlowStepId, WorkflowTabKey> = {
  build: 'tflow.desc.build',
  test: 'tflow.desc.test',
  instrument: 'tflow.desc.instrument',
  report: 'tflow.desc.report',
  gate: 'tflow.desc.gate',
  lint: 'tflow.desc.lint',
  analyze: 'tflow.desc.analyze',
  format: 'tflow.desc.format',
}

const STATE_TEXT: Record<'passed' | 'failed' | 'idle', WorkflowTabKey> = {
  passed: 'tflow.state.passed',
  failed: 'tflow.state.failed',
  idle: 'tflow.state.idle',
}

type StepState = 'passed' | 'failed' | 'idle'

/** Device-local storage key for the format step's configurable path (2.5). */
const FORMAT_PATH_KEY = 'baf.testflow.formatPath'

/**
 * The detail pane's 执行结果 lines for one step — REAL numbers from the
 * payload, never a fabricated verdict. Each entry is one rendered line; the
 * tuple's third slot colors the line (ok/bad/muted).
 */
function resultLines(
  id: TestFlowStepId,
  status: WorkflowTabTestFlowStatus | undefined,
  t: (key: WorkflowTabKey) => string,
): Array<{ text: string; tone: StepState }> {
  const ready = status?.status === 'ready' ? status : undefined
  const coverage = ready?.coverage
  const statics = ready?.staticAnalysis
  const chainAt = coverage?.generatedAt
  switch (id) {
    case 'build':
    case 'test':
    case 'instrument':
      return chainAt === undefined
        ? [{ text: t('tflow.chainIdle'), tone: 'idle' }]
        : [{ text: t('tflow.chainDone').replace('{at}', chainAt), tone: 'passed' }]
    case 'report':
      return chainAt === undefined
        ? [{ text: t('tflow.chainIdle'), tone: 'idle' }]
        : [
          { text: t('tflow.chainDone').replace('{at}', chainAt), tone: 'passed' },
          ...(ready?.reportHtmlExists === true && ready.reportHtmlRel !== undefined
            ? [{ text: `${t('tflow.reportPath')}：${ready.reportHtmlRel}`, tone: 'idle' as StepState }]
            : []),
        ]
    case 'gate': {
      if (coverage === undefined) return [{ text: t('tflow.chainIdle'), tone: 'idle' }]
      if (coverage.passed === undefined) return [{ text: t('tflow.gateUndecided'), tone: 'idle' }]
      const line = coverage.line === undefined ? '—' : String(coverage.line)
      const minPct = coverage.minimum ?? (ready?.thresholdLine !== undefined
        ? Math.round(ready.thresholdLine * 100)
        : undefined)
      const value = t('tflow.coverageValue')
        .replace('{line}', line)
        .replace('{min}', minPct === undefined ? '—' : String(minPct))
      return [{ text: value, tone: coverage.passed ? 'passed' : 'failed' }]
    }
    case 'lint':
    case 'analyze': {
      if (statics === undefined) return [{ text: t('tflow.staticIdle'), tone: 'idle' }]
      const lines = [{ text: t('tflow.staticValue').replace('{n}', String(statics.errors ?? '—')), tone: (statics.errors ?? 0) > 0 ? ('failed' as StepState) : ('passed' as StepState) }]
      if (statics.generatedAt !== undefined) {
        lines.push({ text: t('tflow.chainDone').replace('{at}', statics.generatedAt), tone: 'passed' })
      }
      return lines
    }
    case 'format':
    default:
      return [{ text: t('tflow.formatIdle'), tone: 'idle' }]
  }
}

/** One rail node — index + state dot + names + the at-a-glance metric + 运行. */
function StepNode({
  id, index, command, state, metric, stateLabel, enLabel, nameLabel,
  toolChip, selected, running, onPick, onRun, runLabel,
}: {
  id: TestFlowStepId
  index: number
  command: string
  state: StepState
  metric?: string | undefined
  stateLabel: string
  enLabel: string
  nameLabel: string
  toolChip: string
  selected: boolean
  running: boolean
  onPick: () => void
  onRun: () => void
  runLabel: string
}) {
  return (
    <li className={clsx(css.node, state === 'passed' ? css.passed : state === 'failed' ? css.failed : css.idle)}>
      <button
        type="button"
        className={clsx(css.nodeBtn, selected ? css.nodeSelected : undefined)}
        data-testid={`baf-test-flow-step-${id}`}
        data-state={state}
        aria-pressed={selected}
        onClick={onPick}
      >
        <span className={css.nodeIdx}>{String(index + 1).padStart(2, '0')}</span>
        <span className={css.dot} aria-hidden />
        <span className={css.nodeMain}>
          <span className={css.nodeName}>
            {nameLabel}
            <span className={css.nodeEn}>{enLabel}</span>
          </span>
          <span className={css.nodeTool}>{toolChip}</span>
          <span className={clsx(css.nodeCmd, css.ellipsis)} title={command}>{command}</span>
        </span>
        <span className={css.nodeSide}>
          {metric !== undefined && metric !== '' && <span className={clsx(css.metric, css.ellipsis)} title={metric}>{metric}</span>}
          <span className={clsx(css.stateText, css[state])}>{stateLabel}</span>
        </span>
      </button>
      {/* 批次十二 2.1 — this node's independent 运行 button (a sibling of the
          pick button, never nested): spawns the stage's baf-wrapped command. */}
      <button
        type="button"
        className={clsx(css.nodeRun, running ? css.running : undefined)}
        data-testid={`baf-test-flow-run-${id}`}
        disabled={running}
        aria-busy={running}
        aria-label={`${runLabel} ${nameLabel}`}
        title={`${runLabel}：${command}`}
        onClick={onRun}
      >
        {running ? '…' : runLabel}
      </button>
    </li>
  )
}

/** One label-left / value-right line in the detail pane. */
function KvRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={css.kvRow}>
      <span className={css.kvKey}>{label}</span>
      <span className={css.kvVal}>{children}</span>
    </div>
  )
}

/**
 * Render the 测试流图 conversation tab.
 * @param props - composed conversation-view + inject props.
 * @returns the tab surface.
 */
export function TestFlowView({ refresh, openArtifact, subscribe, runStage, readFile, openWorkflowConfig, t }: TestFlowViewProps) {
  const [status, setStatus] = useState<WorkflowTabTestFlowStatus | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  // null = nothing picked yet: the detail follows the FIRST step (gcc 编译)
  // until the user clicks.
  const [picked, setPicked] = useState<TestFlowStepId | null>(null)
  const selected = picked ?? TEST_FLOW_STEPS[0]?.id ?? 'build'
  // 批次十二 2.1 — per-stage manual runs: which stage is running right now,
  // and each finished stage's real outcome (kept per stage so switching the
  // detail pane doesn't erase a result).
  const [running, setRunning] = useState<TestFlowStepId | null>(null)
  const [runResults, setRunResults] = useState<Partial<Record<TestFlowStepId, WorkflowTabStageRunResult>>>({})
  // 批次十二 2.5 — the format step's configurable path (device-local).
  const [formatPath, setFormatPath] = useState('source')
  // 批次十二 2.6 — the config-file preview modal (loading → result).
  const [preview, setPreview] = useState<{ path: string; result?: WorkflowTabFileReadResult } | null>(null)

  // Restore the persisted format path once on mount (SSR-safe: no window in
  // the node test env means the default stands).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FORMAT_PATH_KEY)
      if (saved !== null && saved.trim() !== '') setFormatPath(saved)
    } catch { /* storage unavailable — the default stands */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setStatus(await refresh())
      setError(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [refresh])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const dispose = subscribe(() => { void load() })
    return () => { dispose() }
  }, [subscribe, load])

  // Escape closes the preview modal.
  useEffect(() => {
    if (preview === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPreview(null)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [preview])

  const openPreview = useCallback(async (path: string) => {
    setPreview({ path })
    try {
      const result = await readFile(path)
      setPreview(current => (current !== null && current.path === path ? { path, result } : current))
    } catch (err) {
      setPreview(current => (current !== null && current.path === path
        ? { path, result: { status: 'unreadable', reason: err instanceof Error ? err.message : String(err) } }
        : current))
    }
  }, [readFile])

  const run = useCallback(async (id: TestFlowStepId) => {
    if (running !== null) return
    setRunning(id)
    try {
      const result = await runStage(id, id === 'format' ? formatPath : '')
      setRunResults(current => ({ ...current, [id]: result }))
    } catch (err) {
      setRunResults(current => ({
        ...current,
        [id]: { status: 'ready', exitCode: 1, output: err instanceof Error ? err.message : String(err) },
      }))
    } finally {
      setRunning(null)
      // The run may have (re)written reports — pull the fresh statuses.
      void load()
    }
  }, [running, runStage, formatPath, load])

  const changeFormatPath = useCallback((value: string) => {
    setFormatPath(value)
    try {
      window.localStorage.setItem(FORMAT_PATH_KEY, value)
    } catch { /* storage unavailable — state-only */ }
  }, [])

  const noCwd = status?.status === 'no-cwd'
  const outcomes = projectTestFlowSteps(status)
  const coverage = status?.status === 'ready' ? status.coverage : undefined
  const statics = status?.status === 'ready' ? status.staticAnalysis : undefined
  const gatePassed = coverage?.passed
  const reportAt = coverage?.generatedAt ?? statics?.generatedAt
  // thresholdLine is a 0-1 fraction; the report's own minimum (already a
  // percent) wins when present.
  const minPct = coverage?.minimum ?? (status?.thresholdLine !== undefined
    ? Math.round(status.thresholdLine * 100)
    : undefined)
  const step = TEST_FLOW_STEPS.find(entry => entry.id === selected) ?? TEST_FLOW_STEPS[0]
  const outcome = outcomes[selected]
  const results = resultLines(selected, status, t)
  const runResult = runResults[selected]

  return (
    <div className={css.root} data-testid="baf-test-flow-view">
      <div className={css.strip}>
        <span className={css.stripBrand}>{t('view.testFlow')}</span>
        <span className={css.stripItem}>
          <span className={css.stripLabel}>{t('tflow.verdictCoverage')}</span>
          <span className={clsx(
            css.stripValue,
            gatePassed === true ? css.stripOk : gatePassed === false ? css.stripBad : css.stripMuted,
          )}>
            {coverage?.line === undefined
              ? '—'
              : t('tflow.coverageValue').replace('{line}', String(coverage.line)).replace('{min}', String(minPct ?? '—'))}
          </span>
        </span>
        <span className={css.stripItem}>
          <span className={css.stripLabel}>{t('tflow.verdictStatic')}</span>
          <span className={clsx(
            css.stripValue,
            statics === undefined ? css.stripMuted
              : (statics.passed === true || statics.errors === 0) ? css.stripOk : css.stripBad,
          )}>
            {statics === undefined
              ? '—'
              : statics.errors === undefined ? (statics.passed === true ? t('tflow.state.passed') : statics.passed === false ? t('tflow.state.failed') : '—')
                : t('tflow.staticValue').replace('{n}', String(statics.errors))}
          </span>
        </span>
        <span className={css.stripItem}>
          <span className={css.stripLabel}>{t('tflow.verdictReport')}</span>
          <span className={clsx(css.stripValue, css.stripMuted)}>{reportAt ?? '—'}</span>
        </span>
        {status?.gateMode !== undefined && (
          <span className={css.gateChip} title={t('tflow.gateMode')}>{`${t('tflow.gateMode')} · ${status.gateMode}`}</span>
        )}
        {/* 批次十二 2.3 — the strip's 配置 button: the same 工作流 config page
            the 工作流图 tab's 配置 button opens. */}
        <button
          type="button"
          className={css.configBtn}
          data-testid="baf-test-flow-config"
          onClick={openWorkflowConfig}
        >
          {t('action.config')}
        </button>
        <button
          type="button"
          className={css.refreshBtn}
          data-testid="baf-test-flow-refresh"
          disabled={loading}
          onClick={() => { void load() }}
        >
          {t('action.refresh')}
        </button>
      </div>

      <div className={css.body}>
        {error !== undefined && <div className={css.errorBar} role="alert">{`${t('tflow.loadFailed')}${error}`}</div>}
        {noCwd
          ? (
            <div className={css.hint} data-testid="baf-test-flow-nocwd">{t('tflow.noCwd')}</div>
          )
          : (
            <div className={css.split}>
              {/* 批次十一 5: the step rail — one state-colored node per step,
                  metric at a glance; click picks the detail pane's step. Each
                  node also carries its own 运行 button (批次十二 2.1). */}
              <ol className={css.rail} aria-label={t('tflow.aria')}>
                {TEST_FLOW_STEPS.map((entry, index) => (
                  <StepNode
                    key={entry.id}
                    id={entry.id}
                    index={index}
                    command={entry.command}
                    state={outcomes[entry.id].state}
                    metric={entry.id === 'format' ? undefined : outcomes[entry.id].metric}
                    stateLabel={t(STATE_TEXT[outcomes[entry.id].state])}
                    nameLabel={t(NODE_LABEL[entry.id])}
                    enLabel={t(NODE_EN[entry.id])}
                    toolChip={`${entry.tool} · ${t(entry.required ? 'tflow.required' : 'tflow.optional')}`}
                    selected={entry.id === selected}
                    running={running === entry.id}
                    runLabel={t('tflow.run')}
                    onPick={() => { setPicked(entry.id) }}
                    onRun={() => { void run(entry.id) }}
                  />
                ))}
              </ol>
              {/* The detail pane — everything the clicked step can say. */}
              <div className={css.detail} data-testid="baf-test-flow-detail" data-step={selected}>
                <div className={clsx(css.detailHead, outcome.state === 'passed' ? css.passed : outcome.state === 'failed' ? css.failed : css.idle)}>
                  <span className={css.detailName}>
                    {t(NODE_LABEL[selected])}
                    <span className={css.nodeEn}>{t(NODE_EN[selected])}</span>
                  </span>
                  <span className={clsx(css.stateBadge, css[outcome.state])}>
                    {t(STATE_TEXT[outcome.state])}
                  </span>
                </div>
                <div className={css.kvGrid}>
                  <KvRow label={t('tflow.labelTool')}>{step?.tool}</KvRow>
                  <KvRow label={t('tflow.labelType')}>{t(step?.required === true ? 'tflow.required' : 'tflow.optional')}</KvRow>
                  <KvRow label={t('tflow.labelCommand')}>
                    <span className={css.mono}>{step?.command}</span>
                  </KvRow>
                </div>
                {/* 批次十二 2.5 — the format step's configurable path: the run
                    button applies clang-format -i to exactly this path. */}
                {selected === 'format' && (
                  <div className={css.fmtRow} data-testid="baf-test-flow-format-path">
                    <span className={css.kvKey}>{t('tflow.fmtPathLabel')}</span>
                    <input
                      type="text"
                      className={css.fmtInput}
                      value={formatPath}
                      aria-label={t('tflow.fmtPathLabel')}
                      onChange={(event) => { changeFormatPath(event.target.value) }}
                    />
                  </div>
                )}
                <div className={css.sectionLabel}>{t('tflow.labelPurpose')}</div>
                <p className={css.purpose}>{t(NODE_PURPOSE[selected])}</p>
                {/* 批次十二 2.6 — this step's 配置文件 chips: click previews the
                    file in a modal (open in the right sidebar from there). */}
                {step !== undefined && step.configFiles.length > 0 && (
                  <>
                    <div className={css.sectionLabel}>{t('tflow.cfgFiles')}</div>
                    <div className={css.cfgChips} data-testid="baf-test-flow-cfg-chips">
                      {step.configFiles.map(file => (
                        <button
                          key={file}
                          type="button"
                          className={css.cfgChip}
                          data-testid={`baf-test-flow-cfg-${file.replace(/[^a-z0-9]+/gi, '-')}`}
                          title={file}
                          onClick={() => { void openPreview(file) }}
                        >
                          {file}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className={clsx(css.sectionLabel, css.resultHead)}>
                  {t('tflow.labelResult')}
                </div>
                <div className={clsx(css.resultCard, outcome.state === 'failed' ? css.resultBad : undefined)}>
                  {results.map(line => (
                    <div key={line.text} className={clsx(css.resultLine, css[line.tone])}>{line.text}</div>
                  ))}
                  {selected === 'report' && status?.reportHtmlExists === true && status.reportHtmlRel !== undefined && (
                    <button
                      type="button"
                      className={css.openBtn}
                      data-testid="baf-test-flow-open-report"
                      title={status.reportHtmlRel}
                      onClick={() => { openArtifact(status.reportHtmlRel as string) }}
                    >
                      {t('tflow.openReport')}
                    </button>
                  )}
                </div>
                {/* 批次十二 2.1 — this stage's manual-run outcome (real exit
                    code + output tail; never a fabricated verdict). */}
                {runResult !== undefined && (
                  <div
                    className={clsx(
                      css.runBlock,
                      runResult.status === 'ready' && runResult.exitCode === 0 ? css.ok
                        : runResult.status === 'ready' ? css.bad : undefined,
                    )}
                    data-testid={`baf-test-flow-run-result-${selected}`}
                  >
                    <div className={css.runHead}>
                      <span className={runResult.status === 'ready' && runResult.exitCode === 0 ? css.passed : css.failed}>
                        {runResult.status === 'no-cwd'
                          ? t('tflow.runNoCwd')
                          : runResult.status === 'tool-missing'
                            ? t('tflow.runToolMissing')
                            : runResult.exitCode === 0 ? t('tflow.runDone') : t('tflow.runFailed').replace('{code}', String(runResult.exitCode ?? '—'))}
                      </span>
                      {runResult.durationMs !== undefined && (
                        <span className={css.runCmd}>{`${(runResult.durationMs / 1000).toFixed(1)}s`}</span>
                      )}
                    </div>
                    {runResult.command !== undefined && <div className={css.runCmd}>{runResult.command}</div>}
                    {runResult.output !== undefined && runResult.output !== '' && (
                      <pre className={css.runOut}>{runResult.output}</pre>
                    )}
                  </div>
                )}
                <div className={css.pickHint}>{t('tflow.pickHint')}</div>
              </div>
            </div>
          )}
      </div>

      {/* 批次十二 2.6 — the config-file preview modal: full text + 打开文件
          (right sidebar) + 关闭. Escape closes. */}
      {preview !== null && (
        <div
          className={css.modalBackdrop}
          data-testid="baf-test-flow-preview"
          onClick={(event) => { if (event.target === event.currentTarget) setPreview(null) }}
        >
          <div className={css.modal} role="dialog" aria-modal="true" aria-label={t('tflow.cfgPreview')}>
            <div className={css.modalHead}>
              <span className={css.modalTitle}>{t('tflow.cfgPreview')}</span>
              <span className={css.modalPath} title={preview.result?.path ?? preview.path}>{preview.result?.path ?? preview.path}</span>
              <button
                type="button"
                className={css.modalClose}
                data-testid="baf-test-flow-preview-close"
                onClick={() => { setPreview(null) }}
              >
                {t('tflow.cfgClose')}
              </button>
            </div>
            <pre className={css.modalBody} data-testid="baf-test-flow-preview-body">
              {preview.result === undefined
                ? t('tflow.cfgLoading')
                : preview.result.status === 'ready' ? preview.result.content
                  : preview.result.status === 'missing' ? t('tflow.cfgMissing')
                    : `${t('tflow.loadFailed')}${preview.result.reason ?? ''}`}
            </pre>
            <div className={css.modalFoot}>
              <button
                type="button"
                className={css.openBtn}
                data-testid="baf-test-flow-preview-open"
                onClick={() => { openArtifact(preview.path) }}
              >
                {t('tflow.cfgOpen')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
