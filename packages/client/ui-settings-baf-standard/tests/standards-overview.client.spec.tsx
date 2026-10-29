// @vitest-environment jsdom
/**
 * BAF 工程规范 settings panels — 【变更】2026-10-18 (项目工程 1.1–1.3): the
 * clickable project path / config file readouts, the editable AI 禁改路径
 * card, and the controller's save / desktop-gesture / directory-picker faces.
 * 【变更】2026-10-19 (六问题批 4.1): the path rows are the tab-top readonly
 * config items (the VALUE is the click target — no copy/open buttons), the
 * no-baseline state gains the 生成配置文件 button, and the 状态脚本 (NodeHooks)
 * card rides the ready branch; 4.3 drops the 企业规范 head + banner.
 * 【变更】2026-10-20 (批次六 5): the rules-digest / area-slicing specs RETIRE
 * with the machinery — the 企业规范 tab renders the REAL bafplugin-migrated
 * standards as a workflow flow chart (canvas → per-node doc list → in-card
 * document viewer through `enterpriseDoc`), plus the client/host catalog
 * parity guard.
 * 【变更】2026-10-21 (质量监控重构 + 指令集): the 单元测试/质量门禁/工具链文档
 * cards RETIRE — 质量监控 is now 环境 (probed tool versions + verdict +
 * 一键安装) / 配置 (workspace config values + 测试报告 modal) / 规范
 * (categorized UT docs); the new 指令集 tab mirrors baf-workflow's HELP_TABLES
 * on the same flow-chart anatomy (desc/stars parity-guarded).
 * 【变更】2026-10-22 (批次十三 3/4): the 配置/质量资产/规范 cards RETIRE into
 * ONE 测试流 canvas — 8 numbered nodes carrying their 配置 values / 资产
 * files / 规范 docs as chips at the flow position, plus per-stage 启用 +
 * 失败中止 switches (server-side dependency cascade); the 环境 card gains
 * the 「AI 协助安装」 escape hatch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

afterEach(cleanup)
import { useSyncExternalStore } from 'react'
import {
  StandardsCommandsOverview, StandardsEnterpriseOverview, StandardsProjectOverview,
  StandardsQualityOverview, toRelativeEntry,
} from '../src/client/StandardsOverview.tsx'
import { ENTERPRISE_DOC_ROWS, QUALITY_DOC_ROWS } from '../src/client/enterprise-docs-catalog.ts'
import {
  BAF_COMMANDS, BAF_GLOBAL_COMMANDS,
} from '../src/client/baf-commands-catalog.ts'
// Host source of truth for the parity guard (vitest runs in node — node:fs OK).
import { ENTERPRISE_DOCS, QUALITY_DOCS } from '@deepseek-ai/dsh-baf-standard/src/enterprise-docs.ts'
import { HELP_TABLES } from '@deepseek-ai/dsh-baf-workflow/src/commands.ts'
import {
  StandardsController, type StandardsOverviewFace, type StandardsOverviewState,
} from '../src/client/standards-store.ts'
import type { BafStandardSummaryResult } from '../src/types.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

/** jsdom has no ResizeObserver; InlineEditor fits its textarea through one. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

const AREA_IDS = [
  'project-charter', 'coding-style', 'interfaces', 'error-handling',
  'logging', 'documentation', 'branch-commit', 'testing-discipline',
] as const

const unusedHook = (() => { throw new Error('unused') }) as never
const kit = {
  useResource: unusedHook,
  useSessions: unusedHook,
  useSessionPendingInteraction: unusedHook,
  useWorkspaces: unusedHook,
  usePanelInfo: unusedHook,
  useSessionStatus: unusedHook,
  useSessionRetainInfo: unusedHook,
  close: vi.fn(),
}

function t(key: string): string {
  return key
}

/** One macrotask — the 状态脚本 add flow awaits an existence RPC (批次三 4.4). */
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

/** A ready summary carrying all 8 areas with anchored sourceRefs. */
function readySummary(overrides: Partial<BafStandardSummaryResult> = {}): BafStandardSummaryResult {
  return {
    status: 'ready',
    cwd: '/ws',
    baselinePath: '/ws/.baf/baseline.yml',
    baselineId: 'b1',
    compatibility: { min: '0.0.0', max: '9.9.9' },
    standardSourceRef: '.baf/standards/default-rules.md',
    standardAvailability: 'ready',
    standardAreas: AREA_IDS.map(id => ({
      id,
      titleKey: `baf.standard.area.${id}`,
      sourceRef: `.baf/standards/default-rules.md#${id}`,
    })),
    cards: [],
    ...overrides,
  }
}

function harness(initial: StandardsOverviewState, faceOverrides: Partial<StandardsOverviewFace> = {}) {
  const store = createSnapshotStore<StandardsOverviewState>(initial)
  const face: StandardsOverviewFace = {
    hooks: { standards: store },
    reload: vi.fn(),
    refreshIfClean: vi.fn(),
    openEnterpriseDoc: vi.fn(),
    closeEnterpriseDoc: vi.fn(),
    updateProtectedDraft: (paths: readonly string[]) => {
      store.update((state) => {
        state.protectedDraft = [...paths]
        state.protectedNotice = undefined
      })
    },
    saveProtectedPaths: vi.fn(),
    clearProtectedNotice: vi.fn(),
    revealPath: vi.fn(),
    openPath: vi.fn(),
    pickDirectory: vi.fn().mockResolvedValue(null),
    // 【变更】2026-10-20 (批次三 4.4): the add-time existence check; the default
    // answers true (fail-open) so existing add flows keep working unchanged.
    statWorkspacePath: vi.fn().mockResolvedValue(true),
    updateHooksDraft: (hooks) => {
      store.update((state) => {
        state.hooksDraft = Object.fromEntries(Object.entries(hooks).map(([node, lists]) => [
          node,
          {
            ...(lists.enter === undefined ? {} : { enter: [...lists.enter] }),
            ...(lists.exit === undefined ? {} : { exit: [...lists.exit] }),
          },
        ]))
        state.hooksNotice = undefined
      })
    },
    saveNodeHooks: vi.fn(),
    clearHooksNotice: vi.fn(),
    generateBaseline: vi.fn(),
    // 【变更】2026-10-21 (质量监控重构 1.3/1.4): the quality faces the tab's
    // mount effects fire and the cards route through.
    probeQualityEnvironment: vi.fn(),
    installQualityToolchain: vi.fn(),
    loadQualityConfiguration: vi.fn(),
    openQualityReport: vi.fn(),
    closeQualityReport: vi.fn(),
    // 【变更】2026-10-22 (批次十二 3): the 资产 card's faces.
    loadQualityAssets: vi.fn(),
    openQualityAsset: vi.fn(),
    closeQualityAsset: vi.fn(),
    // 【变更】2026-10-22 (批次十三 3/4): the 测试流 canvas's faces.
    loadQualityFlowConfig: vi.fn(),
    toggleQualityFlowStage: vi.fn(),
    toggleQualityFlowAll: vi.fn(),
    aiHelpQualityInstall: vi.fn(),
    ...faceOverrides,
  }
  const { hooks: _hooks, ...actions } = face
  const useStandards = <T,>(selector: (state: StandardsOverviewState) => T): T => useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
  )
  const props = {
    ...kit,
    ...actions,
    t: t as never,
    useStandards,
    // master's remote/session/workspace access hooks became required props;
    // these specs exercise routing/standards faces, so open access stubs.
    useRemoteAccess: () => true,
    useSessionAccess: () => true,
    useWorkspaceAccess: () => true,
  }
  return { store, face, props }
}

function readyState(overrides: Partial<StandardsOverviewState> = {}): StandardsOverviewState {
  return {
    status: 'ready',
    summary: readySummary(),
    summaryError: undefined,
    enterpriseDocId: undefined,
    enterpriseDoc: undefined,
    localeActive: 'zh',
    protectedDraft: [],
    protectedSaving: false,
    protectedNotice: undefined,
    hooksDraft: {},
    hooksSaving: false,
    hooksNotice: undefined,
    generating: false,
    generateNotice: undefined,
    qualityEnv: undefined,
    qualityEnvLoading: false,
    qualityEnvNotice: undefined,
    qualityInstallRunning: false,
    qualityInstallSteps: undefined,
    qualityInstallNotice: undefined,
    qualityConfig: undefined,
    qualityReportSeq: 0,
    qualityReport: undefined,
    qualityAssets: undefined,
    qualityAssetSeq: 0,
    qualityAsset: undefined,
    qualityFlow: undefined,
    qualityFlowSaving: false,
    qualityFlowNotice: undefined,
    ...overrides,
  }
}

/** A non-ready state literal the panel tests keep re-using. */
function notReadyState(status: StandardsOverviewState['status'], summary: BafStandardSummaryResult): StandardsOverviewState {
  return {
    status,
    summary,
    summaryError: undefined,
    enterpriseDocId: undefined,
    enterpriseDoc: undefined,
    localeActive: 'zh',
    protectedDraft: undefined,
    protectedSaving: false,
    protectedNotice: undefined,
    hooksDraft: undefined,
    hooksSaving: false,
    hooksNotice: undefined,
    generating: false,
    generateNotice: undefined,
    qualityEnv: undefined,
    qualityEnvLoading: false,
    qualityEnvNotice: undefined,
    qualityInstallRunning: false,
    qualityInstallSteps: undefined,
    qualityInstallNotice: undefined,
    qualityConfig: undefined,
    qualityReportSeq: 0,
    qualityReport: undefined,
    qualityAssets: undefined,
    qualityAssetSeq: 0,
    qualityAsset: undefined,
    qualityFlow: undefined,
    qualityFlowSaving: false,
    qualityFlowNotice: undefined,
  }
}

describe('StandardsProjectOverview · ready branch layout (批次三 4.2)', () => {
  it('renders ONLY the 受保护路径 + 状态脚本 cards — the archive / scaffold cards are gone', () => {
    const { props } = harness(readyState())
    render(<StandardsProjectOverview {...props} />)
    // 【变更】2026-10-20 (批次三 4.2): the multi-column grid left with the
    // baseline archive, scaffold, and per-package projection cards; the
    // ready branch is one full-width card per item (path rows on top).
    expect(screen.queryByTestId('baf-standard-card-baseline')).toBeNull()
    expect(screen.queryByTestId('baf-standard-card-scaffold')).toBeNull()
    expect(screen.getByTestId('baf-standard-protected-card')).toBeDefined()
    expect(screen.getByTestId('baf-standard-hooks-card')).toBeDefined()
    // 【变更】2026-10-26 (批次二十八 2): the two cards own a card head now —
    // a glyph, the title AND a one-line description (the card names itself
    // instead of reading as three bare labels).
    expect(screen.getByTestId('baf-standard-protected-card').textContent).toContain('protectedTitle')
    expect(screen.getByTestId('baf-standard-protected-card').textContent).toContain('protectedDesc')
    expect(screen.getByTestId('baf-standard-hooks-card').textContent).toContain('hooksTitle')
    expect(screen.getByTestId('baf-standard-hooks-card').textContent).toContain('hooksDesc')
  })

  it('renders no archive card before the summary is ready', () => {
    const { props } = harness(notReadyState('no-baseline', { status: 'no-baseline' }))
    render(<StandardsProjectOverview {...props} />)
    expect(screen.queryByTestId('baf-standard-card-baseline')).toBeNull()
  })

  // 【变更】2026-10-18 (exe smoke follow-up): the server returns cwd/baselinePath
  // in the no-baseline branch too — a first-run workspace (no .baf/baseline.yml
  // yet) still shows where it lives; with no path fields at all, no card.
  it('shows the path rows in the no-baseline branch (first-run workspace)', () => {
    const { props } = harness(notReadyState('no-baseline', {
      status: 'no-baseline',
      cwd: 'D:/demo/fresh',
      baselinePath: 'D:/demo/fresh/.baf/baseline.yml',
    }))
    render(<StandardsProjectOverview {...props} />)
    const path = screen.getByTestId('baf-standard-project-path')
    expect(path.textContent).toContain('D:/demo/fresh')
    const file = screen.getByTestId('baf-standard-config-file')
    expect(file.textContent).toContain('baseline.yml')
    expect(file.textContent).not.toContain('D:/demo/fresh')
  })

  // 【变更】2026-10-19 (六问题批 4.1): the path rows are READONLY config items
  // in the 轨迹图 row style — the VALUE itself is the only button (no copy /
  // open mini-buttons). 【变更】2026-10-22 (批次十五 2): the file-vs-dir click
  // contract — project path (dir) reveals; config file (FILE) opens the
  // PREVIEW MODAL (its 打开 button fires the default-app open).
  it('shows the readonly project path (reveal) and config file name (preview modal) — value is the button', () => {
    const revealPath = vi.fn()
    const openPath = vi.fn()
    const openQualityAsset = vi.fn()
    // The preset ready payload lets the modal render its 打开/打开文件夹 pair
    // (openQualityAsset is a stub — it never writes the store).
    const { props } = harness(readyState({
      qualityAsset: { status: 'ready', path: '/ws/.baf/baseline.yml', content: 'guard: {}' },
    }), { revealPath, openPath, openQualityAsset })
    render(<StandardsProjectOverview {...props} />)
    const projectRow = screen.getByTestId('baf-standard-project-path')
    expect(projectRow.textContent).toContain('/ws')
    // Exactly one interactive element — the value itself; no copy/open buttons.
    expect(projectRow.querySelectorAll('button')).toHaveLength(1)
    const projectButton = projectRow.querySelector('button')
    expect(projectButton?.getAttribute('title')).toBe('/ws')
    fireEvent.click(projectButton as HTMLElement)
    expect(revealPath).toHaveBeenCalledWith('/ws')
    const fileRow = screen.getByTestId('baf-standard-config-file')
    // The visible text is the FILE NAME; the hover title carries the full path.
    expect(fileRow.textContent).toContain('baseline.yml')
    expect(fileRow.textContent).not.toContain('/ws/.baf/baseline.yml')
    expect(fileRow.querySelectorAll('button')).toHaveLength(1)
    const fileButton = fileRow.querySelector('button')
    expect(fileButton?.getAttribute('title')).toBe('/ws/.baf/baseline.yml')
    // 批次十五 2 — the click PREVIEWS (rel form), the default-app open moved
    // into the modal's 打开 button.
    fireEvent.click(fileButton as HTMLElement)
    expect(openQualityAsset).toHaveBeenCalledWith('.baf/baseline.yml')
    expect(openPath).not.toHaveBeenCalled()
    expect(screen.getByTestId('baf-quality-asset-modal')).toBeDefined()
    // The modal's pair answers both gestures on the absolute path.
    fireEvent.click(screen.getByTestId('baf-quality-asset-open-file'))
    expect(openPath).toHaveBeenCalledWith('/ws/.baf/baseline.yml')
    fireEvent.click(screen.getByTestId('baf-quality-asset-reveal-file'))
    expect(revealPath).toHaveBeenCalledWith('/ws/.baf/baseline.yml')
  })

  it('omits the path readouts when the summary carries no paths', () => {
    const { cwd: _cwd, baselinePath: _baselinePath, ...bare } = readySummary()
    const { props } = harness(readyState({ summary: bare }))
    render(<StandardsProjectOverview {...props} />)
    expect(screen.queryByTestId('baf-standard-project-path')).toBeNull()
    expect(screen.queryByTestId('baf-standard-config-file')).toBeNull()
  })
})

describe('StandardsEnterpriseOverview · real-standards flow chart (批次六 5)', () => {
  it('renders the route-parity canvas — 8 nodes, zh key + en name one line, arrowhead edges, accent chip tags', () => {
    const { props } = harness(readyState())
    render(<StandardsEnterpriseOverview {...props} />)
    const nodes = [...document.querySelectorAll('[data-testid^="baf-enterprise-node-"]')]
    expect(nodes.map(node => node.getAttribute('data-testid'))).toEqual([
      'baf-enterprise-node-intake',
      'baf-enterprise-node-open',
      'baf-enterprise-node-clarify',
      'baf-enterprise-node-design',
      'baf-enterprise-node-plan',
      'baf-enterprise-node-implement',
      'baf-enterprise-node-verify',
      'baf-enterprise-node-archive',
    ])
    // One name line per card: the locale-keyed zh label with the en name
    // riding inline (the t stub answers keys, so both key and name assert).
    const intake = screen.getByTestId('baf-enterprise-node-intake')
    expect(intake.textContent).toContain('hooksNodeIntake')
    expect(intake.textContent).toContain('Intake')
    // The SVG chain edges carry arrowheads (route-canvas parity).
    expect(document.querySelectorAll('svg path[marker-end]').length).toBeGreaterThan(0)
    // The accent line carries the applying standards' SHORT tags (zh locale).
    expect(screen.getByTestId('baf-enterprise-node-design').textContent).toContain('编码 · SRI · Python · 高风险')
    expect(screen.getByTestId('baf-enterprise-node-implement').textContent).toContain('编码 · SRI · Python · 静态 · UT')
  })

  it('defaults the detail column to the first node WITH standards and swaps it on click; archive is honestly bare', () => {
    const { props } = harness(readyState())
    render(<StandardsEnterpriseOverview {...props} />)
    expect(screen.getByTestId('baf-enterprise-docs-detail').getAttribute('data-node')).toBe('intake')
    expect(screen.getByTestId('baf-enterprise-doc-overview')).toBeDefined()
    // The bare node (no standards anywhere) renders the idle accent + the
    // none-apply line instead of an empty list.
    fireEvent.click(screen.getByTestId('baf-enterprise-node-archive'))
    expect(screen.getByTestId('baf-enterprise-docs-detail').getAttribute('data-node')).toBe('archive')
    expect(screen.getByTestId('baf-enterprise-node-archive').textContent).toContain('enterpriseNodeNone')
    expect(screen.getByTestId('baf-enterprise-node-none-archive').textContent).toContain('enterpriseNodeNone')
    cleanup()
    // The implement node lists its standards in catalog order.
    const again = harness(readyState())
    render(<StandardsEnterpriseOverview {...again.props} />)
    fireEvent.click(screen.getByTestId('baf-enterprise-node-implement'))
    const rows = [...document.querySelectorAll('[data-testid^="baf-enterprise-doc-"]')]
    expect(rows.map(row => row.getAttribute('data-testid'))).toEqual([
      'baf-enterprise-doc-code',
      'baf-enterprise-doc-sri',
      'baf-enterprise-doc-python',
      'baf-enterprise-doc-static',
      'baf-enterprise-doc-ut',
    ])
  })

  it('routes doc clicks through the face and renders every viewer payload state', () => {
    const openEnterpriseDoc = vi.fn()
    const { props } = harness(readyState(), { openEnterpriseDoc })
    render(<StandardsEnterpriseOverview {...props} />)
    // branch applies at plan — select that node first, then click its row.
    fireEvent.click(screen.getByTestId('baf-enterprise-node-plan'))
    fireEvent.click(screen.getByTestId('baf-enterprise-doc-branch'))
    expect(openEnterpriseDoc).toHaveBeenCalledWith('branch')
    // No id in state → no viewer at all.
    expect(screen.queryByTestId('baf-enterprise-doc-viewer')).toBeNull()
    cleanup()

    // Fetch in flight → the loading viewer.
    const loading = harness(readyState({ enterpriseDocId: 'code' }))
    render(<StandardsEnterpriseOverview {...loading.props} />)
    expect(screen.getByTestId('baf-enterprise-doc-viewer').textContent).toContain('enterpriseDocLoading')
    cleanup()

    // Ready → the document body + the open row highlighted. 【变更】2026-10-22
    // (批次十五 2): the viewer is PREVIEW-ONLY — no 打开文件 button exists.
    const ready = harness(readyState({
      enterpriseDocId: 'code',
      enterpriseDoc: {
        status: 'ready', id: 'code', titleZh: 'SORA C 语言编码规范', titleEn: 'C coding standards',
        path: 'D:/assets/skills/sora-c-code-standards/SKILL.md', content: '# SORA C 语言编码规范\n\n- 规则行。',
      },
    }))
    render(<StandardsEnterpriseOverview {...ready.props} />)
    expect(screen.getByTestId('baf-enterprise-doc-body').textContent).toContain('规则行')
    // 【变更】2026-10-22 (批次十一 4): the body RENDERS markdown — a heading
    // becomes an element, so the raw '# ' marker never reaches the text.
    const body = screen.getByTestId('baf-enterprise-doc-body')
    expect(body.textContent).not.toContain('# SORA')
    expect(body.querySelector('h1')?.textContent).toContain('SORA C 语言编码规范')
    // code applies at design — select that node so its row is listed.
    fireEvent.click(screen.getByTestId('baf-enterprise-node-design'))
    expect(screen.getByTestId('baf-enterprise-doc-code').getAttribute('aria-pressed')).toBe('true')
    // 批次十五 2 — read-only 企业规范: NO open/reveal gesture anywhere.
    expect(screen.queryByTestId('baf-enterprise-doc-open-file')).toBeNull()
    cleanup()

    // Unknown id and unreadable doc → their own error lines.
    const unknown = harness(readyState({ enterpriseDocId: 'ghost', enterpriseDoc: { status: 'unknown' } }))
    render(<StandardsEnterpriseOverview {...unknown.props} />)
    expect(screen.getByTestId('baf-enterprise-doc-viewer').textContent).toContain('enterpriseDocUnknown')
    cleanup()
    const closeEnterpriseDoc = vi.fn()
    const unreadable = harness(readyState({
      enterpriseDocId: 'ut',
      enterpriseDoc: { status: 'unreadable', reason: 'ENOENT: gone' },
    }), { closeEnterpriseDoc })
    render(<StandardsEnterpriseOverview {...unreadable.props} />)
    expect(screen.getByTestId('baf-enterprise-doc-viewer').textContent).toContain('ENOENT: gone')
    // 批次八 3.2: no close button — the scrim click routes through the close face.
    fireEvent.click(screen.getByTestId('baf-enterprise-doc-scrim'))
    expect(closeEnterpriseDoc).toHaveBeenCalledTimes(1)
  })

  it('picks the accent chip tags by the tracked locale (zh shorts vs en shorts)', () => {
    const zh = harness(readyState())
    render(<StandardsEnterpriseOverview {...zh.props} />)
    expect(screen.getByTestId('baf-enterprise-node-design').textContent).toContain('编码 · SRI · Python · 高风险')
    cleanup()
    const en = harness(readyState({ localeActive: 'en' }))
    render(<StandardsEnterpriseOverview {...en.props} />)
    expect(screen.getByTestId('baf-enterprise-node-design').textContent).toContain('Coding · SRI · Python · High-risk')
    expect(screen.getByTestId('baf-enterprise-node-design').textContent).not.toContain('编码')
  })
})

describe('enterprise-docs catalog parity (批次六 5)', () => {
  it('mirrors the host ENTERPRISE_DOCS catalog — ids in order, titles, and node sets', () => {
    expect(ENTERPRISE_DOC_ROWS.map(row => row.id)).toEqual(ENTERPRISE_DOCS.map(entry => entry.id))
    for (const row of ENTERPRISE_DOC_ROWS) {
      const entry = ENTERPRISE_DOCS.find(candidate => candidate.id === row.id)
      if (entry === undefined) throw new Error(`client row without a host entry: ${row.id}`)
      expect(row.titleZh, row.id).toBe(entry.titleZh)
      expect(row.titleEn, row.id).toBe(entry.titleEn)
      expect([...row.nodes].sort(), row.id).toEqual([...entry.nodes].sort())
    }
    // Every node the mirror marks is a main-chain node the canvas renders.
    for (const row of ENTERPRISE_DOC_ROWS) {
      for (const node of row.nodes) {
        expect(['intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive'], `${row.id}:${node}`)
          .toContain(node)
      }
    }
  })

  it('mirrors the host QUALITY_DOCS catalog — ids in order, titles, groups (批次七 2.5)', () => {
    expect(QUALITY_DOC_ROWS.map(row => row.id)).toEqual(QUALITY_DOCS.map(entry => entry.id))
    for (const row of QUALITY_DOC_ROWS) {
      const entry = QUALITY_DOCS.find(candidate => candidate.id === row.id)
      if (entry === undefined) throw new Error(`client row without a host entry: ${row.id}`)
      expect(row.titleZh, row.id).toBe(entry.titleZh)
      expect(row.titleEn, row.id).toBe(entry.titleEn)
      expect(row.group, row.id).toBe(entry.group)
    }
    // The toolchain's standards SKILLs re-use ENTERPRISE ids — a quality id
    // must never collide (each id resolves in exactly one catalog).
    const enterpriseIds = new Set(ENTERPRISE_DOC_ROWS.map(row => row.id))
    for (const row of QUALITY_DOC_ROWS) {
      expect(enterpriseIds.has(row.id), row.id).toBe(false)
    }
  })
})

describe('StandardsController · enterpriseDoc viewer (批次六 5)', () => {
  /** Minimal client ctx: summary + the enterpriseDoc namespace (locale service
   * absent → the try/catch leaves the 'zh' default standing). */
  function controller(enterpriseDoc: (id: string) => Promise<unknown>) {
    const remote = {
      bafStandardConfig: {
        summary: vi.fn(() => Promise.resolve({ ok: true, value: { status: 'no-baseline', cwd: '/ws' } })),
        enterpriseDoc: vi.fn(enterpriseDoc),
      },
    }
    const c = new StandardsController({ remote } as never)
    return { c, remote }
  }
  const tick = () => new Promise(r => setTimeout(r, 0))

  it('opens a document — id first, payload when the RPC answers; re-click is a no-op; close clears', async () => {
    const { c, remote } = controller((id: string) => Promise.resolve({
      ok: true,
      value: {
        status: 'ready', id, titleZh: 'SORA C 语言编码规范', titleEn: 'C coding standards',
        path: '/p/SKILL.md', content: '# SORA C 语言编码规范',
      },
    }))
    await tick()
    await c.openEnterpriseDoc('code')
    expect(remote.bafStandardConfig.enterpriseDoc).toHaveBeenCalledWith('code')
    const state = c.face().hooks.standards.getSnapshot()
    expect(state.enterpriseDocId).toBe('code')
    expect(state.enterpriseDoc).toMatchObject({ status: 'ready', id: 'code' })
    // Same id again → no second fetch.
    await c.openEnterpriseDoc('code')
    expect(remote.bafStandardConfig.enterpriseDoc).toHaveBeenCalledTimes(1)
    c.closeEnterpriseDoc()
    const closed = c.face().hooks.standards.getSnapshot()
    expect(closed.enterpriseDocId).toBeUndefined()
    expect(closed.enterpriseDoc).toBeUndefined()
  })

  it('drops a stale answer superseded by a newer click, and settles transport failures as unreadable', async () => {
    let release: ((value: unknown) => void) | undefined
    const { c } = controller((id: string) => (id === 'slow'
      ? new Promise((resolve) => { release = resolve })
      : Promise.resolve({ ok: true, value: { status: 'unknown' } })))
    await tick()
    void c.openEnterpriseDoc('slow')
    await tick()
    await c.openEnterpriseDoc('ut')
    // The slow answer lands AFTER ut answered — it must not overwrite.
    release?.({ ok: true, value: { status: 'ready', id: 'slow', content: 'late' } })
    await tick()
    expect(c.face().hooks.standards.getSnapshot().enterpriseDoc).toMatchObject({ status: 'unknown' })
    // A rejected transport settles as unreadable with the message.
    const thrown = controller(() => Promise.reject(new Error('rpc down')))
    await tick()
    await thrown.c.openEnterpriseDoc('code')
    expect(thrown.c.face().hooks.standards.getSnapshot().enterpriseDoc)
      .toMatchObject({ status: 'unreadable', reason: 'rpc down' })
  })
})

describe('StandardsQualityOverview · 测试流画布重构 (2026-10-22 批次十三)', () => {
  /** The 8 canonical stage ids, in flow order. */
  const STAGE_IDS = ['build', 'test', 'instrument', 'report', 'gate', 'lint', 'analyze', 'format'] as const

  /** The all-on stage map (the server-side default). */
  function allOnStages() {
    return Object.fromEntries(STAGE_IDS.map(id => [id, { enabled: true, haltOnError: true }]))
  }

  /** A ready state whose 环境 probe answered fully supported (all 4 required
   * tools ok), whose 配置 readout quotes the workspace file, whose 资产 list
   * carries real existence, and whose 测试流 map is the all-on default. */
  function qualityReadyState(overrides: Partial<StandardsOverviewState> = {}): StandardsOverviewState {
    return readyState({
      qualityEnv: {
        status: 'ready',
        cwd: '/ws',
        supported: true,
        assetsInstalled: true,
        tools: [
          { key: 'gcc', state: 'ok', version: '13.2.0', required: true },
          { key: 'ruby', state: 'ok', version: '3.2.2', required: true },
          { key: 'ceedling', state: 'ok', version: '1.0.1', required: true },
          { key: 'gcovr', state: 'ok', version: '7.2', required: true },
          { key: 'cpplint', state: 'missing', required: false },
          { key: 'cppcheck', state: 'unknown', required: false },
        ],
      },
      qualityConfig: {
        status: 'ready',
        source: 'workspace',
        testDir: 'test/**',
        buildDir: 'build',
        reportDir: 'build/coverage',
        thresholdLine: 0.8,
        gateMode: 'shadow',
        reportHtmlRel: 'build/coverage/coverage_report.html',
        reportHtmlExists: true,
      },
      qualityAssets: {
        status: 'ready',
        cwd: '/ws',
        assets: [
          { rel: 'project.yml', roleKey: 'assetProject', exists: true },
          { rel: '.baf/quality/ceedling-config.json', roleKey: 'assetGateConfig', exists: true },
          { rel: '.baf/quality/ceedling-README.md', roleKey: 'assetUtReadme', exists: true },
          { rel: 'CPPLINT.cfg', roleKey: 'assetCpplint', exists: false },
          { rel: '.baf/quality/static-analysis-README.md', roleKey: 'assetStaticReadme', exists: true },
          { rel: 'cppcheck-suppressions.xml', roleKey: 'assetSuppressions', exists: false },
          { rel: '.clang-format', roleKey: 'assetClangFormat', exists: false },
        ],
      },
      qualityFlow: { status: 'ready', cwd: '/ws', stages: allOnStages() },
      ...overrides,
    })
  }

  it('fires the full quality mount round — env probe + config + assets + flow map (批次十三 4)', () => {
    const probeQualityEnvironment = vi.fn()
    const loadQualityConfiguration = vi.fn()
    const loadQualityAssets = vi.fn()
    const loadQualityFlowConfig = vi.fn()
    const { props } = harness(readyState(), {
      probeQualityEnvironment, loadQualityConfiguration, loadQualityAssets, loadQualityFlowConfig,
    })
    render(<StandardsQualityOverview {...props} />)
    expect(probeQualityEnvironment).toHaveBeenCalledTimes(1)
    expect(loadQualityConfiguration).toHaveBeenCalledTimes(1)
    expect(loadQualityAssets).toHaveBeenCalledTimes(1)
    expect(loadQualityFlowConfig).toHaveBeenCalledTimes(1)
  })

  it('renders the 环境 card — verdict banner, REAL per-tool versions, assets on; the old cards are gone (1.1/1.3/1.6)', () => {
    const { props } = harness(qualityReadyState())
    render(<StandardsQualityOverview {...props} />)
    // 1.1/1.6: the old 单元测试 card and the baf-quality · 质量门禁 stack card
    // are deleted — nothing renders under their testids.
    expect(screen.queryByTestId('baf-ut-card')).toBeNull()
    expect(screen.queryByTestId('baf-standard-card-quality')).toBeNull()
    const card = screen.getByTestId('baf-quality-env-card')
    expect(card.textContent).toContain('qolEnvTitle')
    expect(screen.getByTestId('baf-quality-env-verdict').textContent).toContain('qolEnvSupported')
    // The tool table quotes the versions the probes ACTUALLY answered.
    const table = screen.getByTestId('baf-quality-env-table')
    expect(table.textContent).toContain('13.2.0')
    expect(table.textContent).toContain('1.0.1')
    const gcc = screen.getByTestId('baf-quality-env-tool-gcc')
    expect(gcc.textContent).toContain('GCC')
    expect(gcc.textContent).toContain('qolEnvRequired')
    expect(gcc.textContent).toContain('qolEnvOk')
    // Optional members gate nothing: a missing cpplint and an unknown cppcheck
    // keep the verdict green with their own chips.
    const cpplint = screen.getByTestId('baf-quality-env-tool-cpplint')
    expect(cpplint.textContent).toContain('qolEnvOptional')
    expect(cpplint.textContent).toContain('qolEnvMissing')
    expect(screen.getByTestId('baf-quality-env-tool-cppcheck').textContent).toContain('qolEnvUnknown')
    // 【变更】2026-10-22 (批次十四 3): the 质量资产 row is GONE — the 配置文件
    // column (after 用途) lists each tool's config files instead; a missing
    // file dims with 未写入, a tool with no config file reads —.
    expect(card.textContent).not.toContain('qolEnvAssetsOn')
    expect(gcc.textContent).toContain('project.yml')
    expect(screen.getByTestId('baf-quality-env-tool-ceedling').textContent)
      .toContain('.baf/quality/ceedling-config.json')
    expect(screen.getByTestId('baf-quality-env-tool-ruby').textContent).toContain('qolEnvCfgNone')
    expect(screen.getByTestId('baf-quality-env-cfg-cpplint-CPPLINT-cfg').textContent).toContain('qolEnvCfgMissing')
    // Click a chip → the shared preview modal opens (打开 rides the header
    // once the file reads).
    fireEvent.click(screen.getByTestId('baf-quality-env-cfg-gcc-project-yml'))
    expect(screen.getByTestId('baf-quality-asset-modal')).toBeTruthy()
    // Supported + assets installed → no install button at all.
    expect(screen.queryByTestId('baf-quality-env-install')).toBeNull()
  })

  it('shows the danger verdict naming the missing members and runs 一键安装 (1.3)', () => {
    const installQualityToolchain = vi.fn()
    const env = qualityReadyState().qualityEnv
    const broken = qualityReadyState({
      qualityEnv: env === undefined ? undefined : {
        ...env,
        supported: false,
        assetsInstalled: false,
        tools: env.tools.map(tool => tool.key === 'gcc'
          ? { key: tool.key, state: 'missing' as const, required: tool.required }
          : tool),
      },
    })
    const { props } = harness(broken, { installQualityToolchain })
    render(<StandardsQualityOverview {...props} />)
    expect(screen.getByTestId('baf-quality-env-verdict').textContent)
      .toContain('qolEnvUnsupported：GCC')
    expect(screen.getByTestId('baf-quality-env-tool-gcc').textContent).toContain('—')
    fireEvent.click(screen.getByTestId('baf-quality-env-install'))
    expect(installQualityToolchain).toHaveBeenCalledTimes(1)
    // The per-step install report renders with ✓/✗ marks once a run settles
    // — the new 复检 verify step included (批次十三 3).
    cleanup()
    const reported = harness(qualityReadyState({
      qualityEnv: env === undefined ? undefined : { ...env, supported: false, assetsInstalled: false },
      qualityInstallSteps: [
        { id: 'assets', ok: true, detail: '已写入 4 个资产文件（备份 0）' },
        { id: 'gem:ceedling', ok: false, detail: '未执行：先安装 Ruby' },
        { id: 'verify', ok: false, detail: '复检仍缺：ceedling（可用下方「AI 协助安装」）' },
      ],
    }))
    render(<StandardsQualityOverview {...reported.props} />)
    const steps = screen.getByTestId('baf-quality-env-steps')
    expect(screen.getByTestId('baf-quality-env-step-assets').textContent).toContain('已写入 4 个资产文件')
    expect(screen.getByTestId('baf-quality-env-step-gem:ceedling').textContent).toContain('未执行：先安装 Ruby')
    expect(steps.textContent).toContain('✓')
    expect(steps.textContent).toContain('✗')
  })

  it('offers 「AI 协助安装」 once the environment is still broken and routes the click (批次十三 3)', () => {
    const aiHelpQualityInstall = vi.fn()
    const env = qualityReadyState().qualityEnv
    const { props } = harness(qualityReadyState({
      qualityEnv: env === undefined ? undefined : { ...env, supported: false, assetsInstalled: false },
      qualityInstallSteps: [
        { id: 'assets', ok: true, detail: '已写入 4 个资产文件（备份 0）' },
        { id: 'pip:gcovr', ok: false, detail: 'exit 1' },
      ],
    }), { aiHelpQualityInstall })
    render(<StandardsQualityOverview {...props} />)
    fireEvent.click(screen.getByTestId('baf-quality-env-ai-help'))
    expect(aiHelpQualityInstall).toHaveBeenCalledTimes(1)
    // All green → the hatch hides (with the install button).
    cleanup()
    const ok = harness(qualityReadyState())
    render(<StandardsQualityOverview {...ok.props} />)
    expect(screen.queryByTestId('baf-quality-env-ai-help')).toBeNull()
  })

  it('renders the 8-node 测试流 canvas — the 配置/资产/规范 cards are gone (批次十三 4)', () => {
    const { props } = harness(qualityReadyState())
    render(<StandardsQualityOverview {...props} />)
    expect(screen.queryByTestId('baf-quality-config-card')).toBeNull()
    expect(screen.queryByTestId('baf-quality-assets-card')).toBeNull()
    expect(screen.queryByTestId('baf-quality-docs-card')).toBeNull()
    const card = screen.getByTestId('baf-quality-flow-card')
    expect(card.textContent).toContain('qflowTitle')
    // 【变更】2026-10-22 (批次十五 3): the 八步链条 intro description retires —
    // the canvas starts at the 00 前置 node directly.
    expect(card.textContent).not.toContain('qflowIntro')
    // The 前置 "00" node sits FIRST on the rail (批次十五 3) — the node testids
    // only enumerate the 8 numbered stages, the prereq has its own id.
    expect(card.textContent).toContain('qflowPrereqLabel')
    const nodes = [...document.querySelectorAll('[data-testid^="baf-quality-flow-node-"]')]
    expect(nodes.map(node => node.getAttribute('data-testid'))).toEqual(
      STAGE_IDS.map(id => `baf-quality-flow-node-${id}`),
    )
    const build = screen.getByTestId('baf-quality-flow-node-build')
    expect(build.textContent).toContain('01')
    expect(build.textContent).toContain('qflowNodeBuild')
    expect(build.textContent).toContain('gcc')
    expect(build.textContent).toContain('baf-quality test')
    expect(build.getAttribute('data-enabled')).toBe('true')
  })

  it('places the 配置 values at their flow positions — build/test/report/gate chips (批次十三 4)', () => {
    const { props } = harness(qualityReadyState())
    render(<StandardsQualityOverview {...props} />)
    expect(screen.getByTestId('baf-quality-flow-node-build').textContent).toContain('qflowBuildDir build')
    expect(screen.getByTestId('baf-quality-flow-node-test').textContent).toContain('qflowTestDir test/**')
    expect(screen.getByTestId('baf-quality-flow-node-report').textContent).toContain('qflowReportDir build/coverage')
    const gate = screen.getByTestId('baf-quality-flow-node-gate').textContent
    expect(gate).toContain('qflowThreshold ≥ 80%')
    expect(gate).toContain('qflowGateMode shadow')
  })

  it('rides 资产 chips with real existence — missing files say so; a click opens the preview modal (批次十三 4)', () => {
    const openQualityAsset = vi.fn()
    const { props } = harness(qualityReadyState(), { openQualityAsset })
    render(<StandardsQualityOverview {...props} />)
    // project.yml rides three nodes (build/test/instrument) — the testid is
    // node-scoped, so each occurrence stays addressable.
    const present = screen.getByTestId('baf-quality-flow-build-asset-project-yml')
    expect(present.textContent).toBe('project.yml')
    expect(screen.getAllByTitle('project.yml').length).toBeGreaterThanOrEqual(3)
    // CPPLINT.cfg is not on disk → the chip dimms and appends 未安装.
    const missing = screen.getByTestId('baf-quality-flow-lint-asset-CPPLINT-cfg')
    expect(missing.textContent).toContain('qolAssetMissing')
    fireEvent.click(present)
    expect(openQualityAsset).toHaveBeenCalledWith('project.yml')
    // In flight → the loading line; ready → the pre carries the file verbatim.
    expect(screen.getByTestId('baf-quality-asset-modal').textContent).toContain('qolAssetLoading')
    cleanup()

    const openPath = vi.fn()
    const revealPath = vi.fn()
    const closeQualityAsset = vi.fn()
    const ready = harness(qualityReadyState({
      qualityAsset: { status: 'ready', path: '/ws/project.yml', content: ':project: demo' },
    }), { openPath, revealPath, closeQualityAsset })
    render(<StandardsQualityOverview {...ready.props} />)
    fireEvent.click(screen.getByTestId('baf-quality-flow-build-asset-project-yml'))
    expect(screen.getByTestId('baf-quality-asset-content').textContent).toContain(':project: demo')
    // 批次十五 2 — the top-right pair: 打开 + 打开文件夹.
    fireEvent.click(screen.getByTestId('baf-quality-asset-open-file'))
    expect(openPath).toHaveBeenCalledWith('/ws/project.yml')
    fireEvent.click(screen.getByTestId('baf-quality-asset-reveal-file'))
    expect(revealPath).toHaveBeenCalledWith('/ws/project.yml')
    fireEvent.click(screen.getByTestId('baf-quality-asset-scrim'))
    expect(closeQualityAsset).toHaveBeenCalledTimes(1)
  })

  it('previews the 测试报告 from the report node — loading → sandboxed iframe → scrim close (批次十三 4)', () => {
    const openQualityReport = vi.fn()
    const { props } = harness(qualityReadyState(), { openQualityReport })
    render(<StandardsQualityOverview {...props} />)
    fireEvent.click(screen.getByTestId('baf-quality-flow-report'))
    expect(openQualityReport).toHaveBeenCalledTimes(1)
    // In flight (report undefined) → the loading line; no iframe yet.
    expect(screen.getByTestId('baf-quality-report-modal').textContent).toContain('qolReportLoading')
    expect(screen.queryByTestId('baf-quality-report-frame')).toBeNull()
    cleanup()

    // Ready → the sandboxed iframe carries the report markup verbatim. The
    // modal is LOCAL open state — the chip click opens it with the answer
    // already in the store.
    const openPath = vi.fn()
    const revealPath = vi.fn()
    const closeQualityReport = vi.fn()
    const ready = harness(qualityReadyState({
      qualityReport: {
        status: 'ready',
        path: '/ws/build/coverage/coverage_report.html',
        content: '<html><body><h1>Line Coverage</h1>84%</body></html>',
      },
    }), { openPath, revealPath, closeQualityReport })
    render(<StandardsQualityOverview {...ready.props} />)
    fireEvent.click(screen.getByTestId('baf-quality-flow-report'))
    const frame = screen.getByTestId('baf-quality-report-frame') as HTMLIFrameElement
    expect(frame.getAttribute('srcDoc')).toContain('Line Coverage')
    expect(frame.getAttribute('sandbox')).toBe('')
    // 批次十五 2 — the top-right pair: 打开 + 打开文件夹.
    fireEvent.click(screen.getByTestId('baf-quality-report-open-file'))
    expect(openPath).toHaveBeenCalledWith('/ws/build/coverage/coverage_report.html')
    fireEvent.click(screen.getByTestId('baf-quality-report-reveal-file'))
    expect(revealPath).toHaveBeenCalledWith('/ws/build/coverage/coverage_report.html')
    fireEvent.click(screen.getByTestId('baf-quality-report-scrim'))
    expect(closeQualityReport).toHaveBeenCalledTimes(1)
    cleanup()

    // Missing report file → the chip disables itself and quotes 未生成.
    const config = qualityReadyState().qualityConfig
    const gone = harness(qualityReadyState({
      qualityConfig: config === undefined ? undefined : { ...config, reportHtmlExists: false },
    }))
    render(<StandardsQualityOverview {...gone.props} />)
    const chip = screen.getByTestId('baf-quality-flow-report') as HTMLButtonElement
    expect(chip.disabled).toBe(true)
    expect(chip.textContent).toContain('qolCfgReportMissing')
  })

  it('routes 规范 chips through the shared viewer — per-node docs and the 前置 environment band (批次十三 4)', () => {
    const openEnterpriseDoc = vi.fn()
    const { props } = harness(qualityReadyState(), { openEnterpriseDoc })
    render(<StandardsQualityOverview {...props} />)
    // The 前置 band carries the two environment-setup docs + the hint.
    const prereq = screen.getByTestId('baf-quality-flow-prereq')
    expect(prereq.textContent).toContain('qflowPrereqLabel')
    expect(prereq.textContent).toContain('qflowPrereqHint')
    fireEvent.click(screen.getByTestId('baf-quality-flow-doc-env-ut'))
    expect(openEnterpriseDoc).toHaveBeenCalledWith('env-ut')
    // Per-node: build → cfg-project, test → ut/utlist/cfg-config/uttpl,
    // lint → static/cfg-cpplint, analyze → cfg-cppcheck, format → code.
    const test = screen.getByTestId('baf-quality-flow-node-test')
    expect(test.textContent).toContain('qflowChipStd')
    fireEvent.click(screen.getByTestId('baf-quality-flow-doc-cfg-project'))
    expect(openEnterpriseDoc).toHaveBeenCalledWith('cfg-project')
    fireEvent.click(screen.getByTestId('baf-quality-flow-doc-ut'))
    expect(openEnterpriseDoc).toHaveBeenCalledWith('ut')
    fireEvent.click(screen.getByTestId('baf-quality-flow-doc-uttpl'))
    expect(openEnterpriseDoc).toHaveBeenCalledWith('uttpl')
    fireEvent.click(screen.getByTestId('baf-quality-flow-doc-code'))
    expect(openEnterpriseDoc).toHaveBeenCalledWith('code')
    // The canvas has no separate doc groups anymore.
    expect(document.querySelectorAll('[data-testid^="baf-quality-group-"]').length).toBe(0)
  })

  it('fires the two per-stage switches through the store face — 启用 / 失败中止 (批次十三 4)', () => {
    const toggleQualityFlowStage = vi.fn()
    const { props } = harness(qualityReadyState(), { toggleQualityFlowStage })
    render(<StandardsQualityOverview {...props} />)
    fireEvent.click(screen.getByRole('switch', { name: 'qflowSwitchEnabled qflowNodeLint' }))
    expect(toggleQualityFlowStage).toHaveBeenCalledWith('lint', 'enabled', false)
    fireEvent.click(screen.getByRole('switch', { name: 'qflowSwitchHalt qflowNodeBuild' }))
    expect(toggleQualityFlowStage).toHaveBeenCalledWith('build', 'haltOnError', false)
  })

  it('greys out a disabled stage — data-enabled=false, its 失败中止 switch locks, the note renders (批次十三 4)', () => {
    const { props } = harness(qualityReadyState({
      qualityFlow: {
        status: 'ready',
        cwd: '/ws',
        stages: { ...allOnStages(), test: { enabled: false, haltOnError: true } },
      },
    }))
    render(<StandardsQualityOverview {...props} />)
    const node = screen.getByTestId('baf-quality-flow-node-test')
    expect(node.getAttribute('data-enabled')).toBe('false')
    expect(node.textContent).toContain('qflowDisabled')
    const halt = screen.getByRole('switch', { name: 'qflowSwitchHalt qflowNodeTest' }) as HTMLButtonElement
    expect(halt.disabled).toBe(true)
    // An enabled stage's 失败中止 switch stays interactive.
    const active = screen.getByRole('switch', { name: 'qflowSwitchHalt qflowNodeLint' }) as HTMLButtonElement
    expect(active.disabled).toBe(false)
  })

  it('renders the 00 前置 MASTER switch and routes its flip through the face (批次十七 3.3)', () => {
    const { props } = harness(qualityReadyState())
    render(<StandardsQualityOverview {...props} />)
    // All-on default → the master reads checked; its pill sits on the 00 card.
    const master = screen.getByRole('switch', { name: 'qflowSwitchAll · qflowTitle' }) as HTMLButtonElement
    expect(master.closest('[data-testid="baf-quality-flow-prereq"]')).not.toBeNull()
    expect(master.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(master)
    expect(props.toggleQualityFlowAll).toHaveBeenCalledWith(false)
    cleanup()
    // Any stage off → the master reads unchecked; flipping it back on routes true.
    const stages = allOnStages()
    stages.lint = { enabled: false, haltOnError: true }
    const partial = harness(qualityReadyState({ qualityFlow: { status: 'ready', cwd: '/ws', stages } }))
    render(<StandardsQualityOverview {...partial.props} />)
    const masterOff = screen.getByRole('switch', { name: 'qflowSwitchAll · qflowTitle' }) as HTMLButtonElement
    expect(masterOff.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(masterOff)
    expect(partial.props.toggleQualityFlowAll).toHaveBeenCalledWith(true)
  })

  it('renders the canvas guidance states — loading, no-workspace, and the toggle failure notice (批次十三 4)', () => {
    const { props } = harness(qualityReadyState({ qualityFlow: undefined }))
    render(<StandardsQualityOverview {...props} />)
    expect(screen.getByTestId('baf-quality-flow-card').textContent).toContain('qflowLoading')
    expect(document.querySelectorAll('[data-testid^="baf-quality-flow-node-"]').length).toBe(0)
    cleanup()

    const noWs = harness(qualityReadyState({ qualityFlow: { status: 'no-workspace' } }))
    render(<StandardsQualityOverview {...noWs.props} />)
    expect(screen.getByTestId('baf-quality-flow-card').textContent).toContain('qflowNoWorkspace')
    cleanup()

    const failed = harness(qualityReadyState({ qualityFlowNotice: 'rpc down' }))
    render(<StandardsQualityOverview {...failed.props} />)
    expect(screen.getByTestId('baf-quality-flow-notice').textContent).toContain('qflowSaveFailed')
    expect(screen.getByTestId('baf-quality-flow-notice').textContent).toContain('rpc down')
  })

  it('renders the guidance states when no workspace is bound', () => {
    const { props } = harness(notReadyState('no-workspace', { status: 'no-workspace' }))
    render(<StandardsQualityOverview {...props} />)
    expect(screen.getByTestId('baf-standard-empty').textContent).toContain('statusNoWorkspace')
    // The cards still render — each answers its own no-workspace copy.
    expect(screen.getByTestId('baf-quality-env-verdict').textContent).toContain('qolEnvProbing')
    expect(screen.getByTestId('baf-quality-flow-card').textContent).toContain('qflowLoading')
  })
})

describe('StandardsController · 测试流开关 rounds (2026-10-22 批次十三 4)', () => {
  const tick = () => new Promise(r => setTimeout(r, 0))

  /** A controller whose flow remotes answer the two given payloads. Passing a
   * function makes the answer lazy (a rejected promise is created at call
   * time, never left floating unhandled). */
  function flowController(flowAnswer: unknown, toggleAnswer: unknown) {
    const settle = (answer: unknown): Promise<unknown> => Promise.resolve(
      typeof answer === 'function' ? (answer as () => unknown)() : answer,
    )
    const remote = {
      bafStandardConfig: {
        summary: vi.fn(() => Promise.resolve({ ok: true, value: { status: 'no-baseline', cwd: '/ws' } })),
        qualityTestFlowConfig: vi.fn(() => settle(flowAnswer)),
        saveQualityTestFlowToggle: vi.fn((_req: unknown) => settle(toggleAnswer)),
      },
    }
    const c = new StandardsController({ remote } as never)
    return { c, remote }
  }

  const ALL_ON = Object.fromEntries(
    ['build', 'test', 'instrument', 'report', 'gate', 'lint', 'analyze', 'format']
      .map(id => [id, { enabled: true, haltOnError: true }]),
  )

  it('loads the stage map; no-workspace lands as the map; rejection settles as the notice', async () => {
    const { c, remote } = flowController(
      { ok: true, value: { status: 'ready', cwd: '/ws', stages: ALL_ON } },
      { ok: true, value: { status: 'ready', stages: ALL_ON } },
    )
    await tick()
    await c.loadQualityFlowConfig()
    expect(remote.bafStandardConfig.qualityTestFlowConfig).toHaveBeenCalledTimes(1)
    expect(c.face().hooks.standards.getSnapshot().qualityFlow)
      .toMatchObject({ status: 'ready', stages: { lint: { enabled: true, haltOnError: true } } })
    // no-workspace lands as the map too — the canvas renders guidance from it.
    const noWs = flowController({ ok: true, value: { status: 'no-workspace' } }, undefined)
    await tick()
    await noWs.c.loadQualityFlowConfig()
    expect(noWs.c.face().hooks.standards.getSnapshot().qualityFlow).toMatchObject({ status: 'no-workspace' })
    // A rejected transport settles into the notice, never a hang.
    const dead = flowController(() => Promise.reject(new Error('rpc down')), undefined)
    await tick()
    await dead.c.loadQualityFlowConfig()
    expect(dead.c.face().hooks.standards.getSnapshot().qualityFlowNotice).toBe('rpc down')
  })

  it('flips ONE switch optimistically, then replaces the whole map with the server cascade answer', async () => {
    // The server cascade for test=false: instrument/report/gate auto-disable.
    const cascaded = {
      ...ALL_ON,
      test: { enabled: false, haltOnError: true },
      instrument: { enabled: false, haltOnError: true },
      report: { enabled: false, haltOnError: true },
      gate: { enabled: false, haltOnError: true },
    }
    const { c, remote } = flowController(
      { ok: true, value: { status: 'ready', cwd: '/ws', stages: ALL_ON } },
      { ok: true, value: { status: 'ready', stages: cascaded } },
    )
    await tick()
    await c.loadQualityFlowConfig()
    const round = c.toggleQualityFlowStage('test', 'enabled', false)
    // Optimistic mid-flight: ONLY the flipped field moves — the cascade stays
    // server-side, so instrument is still on until the answer lands.
    const mid = c.face().hooks.standards.getSnapshot()
    expect(mid.qualityFlowSaving).toBe(true)
    expect(mid.qualityFlow?.stages?.test).toEqual({ enabled: false, haltOnError: true })
    expect(mid.qualityFlow?.stages?.instrument).toEqual({ enabled: true, haltOnError: true })
    expect(remote.bafStandardConfig.saveQualityTestFlowToggle)
      .toHaveBeenCalledWith({ stage: 'test', field: 'enabled', value: false })
    await round
    const after = c.face().hooks.standards.getSnapshot()
    expect(after.qualityFlowSaving).toBe(false)
    expect(after.qualityFlow?.stages).toEqual(cascaded)
  })

  it('flips the MASTER switch — one round per independent root, the last ready map wins (批次十七 3.3)', async () => {
    const ALL_OFF = Object.fromEntries(
      ['build', 'test', 'instrument', 'report', 'gate', 'lint', 'analyze', 'format']
        .map(id => [id, { enabled: false, haltOnError: true }]),
    )
    const { c, remote } = flowController(
      { ok: true, value: { status: 'ready', cwd: '/ws', stages: ALL_ON } },
      { ok: true, value: { status: 'ready', stages: ALL_OFF } },
    )
    await tick()
    await c.loadQualityFlowConfig()
    const round = c.toggleQualityFlowAll(false)
    // Optimistic mid-flight: EVERY stage's enabled flips in one pass while the
    // haltOnError flags ride untouched.
    const mid = c.face().hooks.standards.getSnapshot()
    expect(mid.qualityFlowSaving).toBe(true)
    expect(mid.qualityFlow?.stages?.gate).toEqual({ enabled: false, haltOnError: true })
    await round
    // OFF sweeps the four independent roots — build's cascade closes the whole
    // coverage chain, lint/analyze/format are standalone.
    expect(remote.bafStandardConfig.saveQualityTestFlowToggle.mock.calls.map(call => call[0])).toEqual([
      { stage: 'build', field: 'enabled', value: false },
      { stage: 'lint', field: 'enabled', value: false },
      { stage: 'analyze', field: 'enabled', value: false },
      { stage: 'format', field: 'enabled', value: false },
    ])
    const after = c.face().hooks.standards.getSnapshot()
    expect(after.qualityFlowSaving).toBe(false)
    expect(after.qualityFlow?.stages).toEqual(ALL_OFF)
    // ON sweeps gate (its cascade reopens the coverage chain) + the three
    // standalone steps.
    remote.bafStandardConfig.saveQualityTestFlowToggle.mockClear()
    await c.toggleQualityFlowAll(true)
    expect(remote.bafStandardConfig.saveQualityTestFlowToggle.mock.calls.map(call => call[0])).toEqual([
      { stage: 'gate', field: 'enabled', value: true },
      { stage: 'lint', field: 'enabled', value: true },
      { stage: 'analyze', field: 'enabled', value: true },
      { stage: 'format', field: 'enabled', value: true },
    ])
  })

  it('settles a failed toggle into the notice line and never leaves saving stuck', async () => {
    const { c } = flowController(
      { ok: true, value: { status: 'ready', cwd: '/ws', stages: ALL_ON } },
      { ok: false, error: { message: 'write failed' } },
    )
    await tick()
    await c.loadQualityFlowConfig()
    await c.toggleQualityFlowStage('lint', 'haltOnError', false)
    const state = c.face().hooks.standards.getSnapshot()
    expect(state.qualityFlowSaving).toBe(false)
    expect(state.qualityFlowNotice).toBe('write failed')
  })
})

describe('baf-commands catalog parity (2026-10-21 指令集)', () => {
  it('mirrors baf-workflow HELP_TABLES — every command, desc + stars verbatim, nothing extra', () => {
    // Parse the four host tables' `/cmd  desc · ★★` lines.
    const host: Array<{ id: string; desc: string; stars: number }> = []
    for (const lines of [HELP_TABLES.core, HELP_TABLES.flow, HELP_TABLES.check, HELP_TABLES.update]) {
      for (const line of lines) {
        const match = /^(\/\S+)\s+(.*) · (★+)$/u.exec(line)
        if (match === null) throw new Error(`unparsable help line: ${line}`)
        const id = match[1]
        const desc = match[2]
        const stars = match[3]
        if (id === undefined || desc === undefined || stars === undefined) {
          throw new Error(`unparsable help line: ${line}`)
        }
        host.push({ id, desc, stars: stars.length })
      }
    }
    const mirror = [...BAF_COMMANDS, ...BAF_GLOBAL_COMMANDS]
    // Same size, no duplicate ids on either side.
    expect(mirror.length).toBe(host.length)
    expect(new Set(mirror.map(command => command.id)).size).toBe(mirror.length)
    expect(new Set(host.map(entry => entry.id)).size).toBe(host.length)
    for (const entry of host) {
      const row = mirror.find(command => command.id === entry.id)
      expect(row, entry.id).toBeDefined()
      expect(row?.desc, entry.id).toBe(entry.desc)
      expect(row?.stars, entry.id).toBe(entry.stars)
      expect(row?.effect.length, entry.id).toBeGreaterThan(0)
      // 【变更】2026-10-22 (批次十一 3): every entry now also states what
      // running it leaves behind (结果).
      expect(row?.result.length, entry.id).toBeGreaterThan(0)
    }
    // State-bound vs global split: every BAF_COMMANDS row names ≥1 main-chain
    // node; every global row names none.
    const CHAIN = ['intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive']
    for (const command of BAF_COMMANDS) {
      expect(command.nodes.length, command.id).toBeGreaterThan(0)
      for (const node of command.nodes) expect(CHAIN, `${command.id}:${node}`).toContain(node)
    }
    for (const command of BAF_GLOBAL_COMMANDS) expect(command.nodes, command.id).toEqual([])
  })
})

describe('StandardsCommandsOverview · 指令集 flow chart (2026-10-21 指令集)', () => {
  it('renders the 8-node canvas — command-count accents, inline en names, arrowhead edges', () => {
    const { props } = harness(readyState())
    render(<StandardsCommandsOverview {...props} />)
    const nodes = [...document.querySelectorAll('[data-testid^="baf-commands-node-"]')]
    expect(nodes.map(node => node.getAttribute('data-testid'))).toEqual([
      'baf-commands-node-intake',
      'baf-commands-node-open',
      'baf-commands-node-clarify',
      'baf-commands-node-design',
      'baf-commands-node-plan',
      'baf-commands-node-implement',
      'baf-commands-node-verify',
      'baf-commands-node-archive',
    ])
    // Route-canvas parity: the SVG chain edges carry arrowheads.
    expect(document.querySelectorAll('svg path[marker-end]').length).toBeGreaterThan(0)
    // One name line per card: the locale-keyed zh label with the en name inline.
    const intake = screen.getByTestId('baf-commands-node-intake')
    expect(intake.textContent).toContain('hooksNodeIntake')
    expect(intake.textContent).toContain('Intake')
    // The accent counts the commands bound to the node (intake: open + go).
    expect(intake.textContent).toContain(`2 ${'cmdAccentUnit'}`)
  })

  it('defaults the detail to the first node and swaps it on click; global band rides below', () => {
    const { props } = harness(readyState())
    render(<StandardsCommandsOverview {...props} />)
    expect(screen.getByTestId('baf-commands-detail').getAttribute('data-node')).toBe('intake')
    // The intake rows carry id + ★ + 作用 + 功能 (the full, non-compact row).
    const open = screen.getByTestId('baf-command-baf_workflow_open')
    expect(open.textContent).toContain('/baf-workflow-open')
    expect(open.textContent).toContain('启动变更：先分类')
    expect(open.textContent).toContain('★★★')
    expect(open.textContent).toContain('分类确认卡')
    expect(screen.getByTestId('baf-command-baf_go')).toBeDefined()
    // Clicking another node swaps the detail column.
    fireEvent.click(screen.getByTestId('baf-commands-node-verify'))
    expect(screen.getByTestId('baf-commands-detail').getAttribute('data-node')).toBe('verify')
    expect(screen.getByTestId('baf-command-baf_check_quality')).toBeDefined()
    expect(screen.getByTestId('baf-command-baf_check_guard')).toBeDefined()
    // 【变更】2026-10-22 (批次十一 3): the global band became its OWN BIG CARD
    // with FULL rows — 用途/效果/结果 all present, like the state rows.
    const band = screen.getByTestId('baf-commands-global')
    expect(band.textContent).toContain('cmdGlobalTitle')
    expect(band.textContent).toContain('cmdGlobalIntro')
    expect(screen.getByTestId('baf-command-baf_help').textContent).toContain('列出全部命令与用法')
    expect(screen.getByTestId('baf-command-baf_help').textContent).toContain('迷路时的第一站')
    expect(screen.getByTestId('baf-command-baf_help').textContent).toContain('指令速查表')
    expect(screen.getByTestId('baf-command-baf_update_rollback')).toBeDefined()
  })

  // 【变更】2026-10-22 (批次十一 3): two big cards (状态指令 / 全局指令), the
  // 作用/功能/结果 captions on every row, and NO legend.
  it('splits state and global commands into two cards with 作用/功能/结果 rows and no legend', () => {
    const { props } = harness(readyState())
    render(<StandardsCommandsOverview {...props} />)
    const stateCard = screen.getByTestId('baf-commands-card')
    // 【变更】2026-10-22 (批次十五 4): the 状态指令 title + intro retire — the
    // card starts directly at the flow canvas (the keys are gone from locales).
    expect(stateCard.textContent).not.toContain('cmdStateTitle')
    expect(stateCard.textContent).not.toContain('cmdStateIntro')
    // A state row answers all three captions.
    const open = screen.getByTestId('baf-command-baf_workflow_open')
    expect(open.textContent).toContain('cmdUseLabel')
    expect(open.textContent).toContain('cmdEffectLabel')
    expect(open.textContent).toContain('cmdResultLabel')
    expect(open.textContent).toContain('changeId')
    // The legend is gone on both surfaces.
    expect(screen.queryByText('cmdLegendState')).toBeNull()
    expect(screen.queryByText('cmdLegendGlobal')).toBeNull()
    expect(screen.queryByText('enterpriseLegendDocs')).toBeNull()
  })

  it('renders the chart with no baseline at all (a product constant)', () => {
    const { props } = harness(notReadyState('no-baseline', { status: 'no-baseline', cwd: '/ws' }))
    render(<StandardsCommandsOverview {...props} />)
    expect(screen.getByTestId('baf-commands-card')).toBeDefined()
    expect(screen.getByTestId('baf-commands-detail').getAttribute('data-node')).toBe('intake')
  })
})

describe('toRelativeEntry (绝对路径 → 工作区相对词条)', () => {
  it('folds a picked folder under the root, separators and drive case aside', () => {
    expect(toRelativeEntry('D:\\ws\\repo', 'D:\\ws\\repo\\docs')).toBe('docs')
    expect(toRelativeEntry('d:/ws/repo', 'D:\\ws\\repo\\a\\b\\')).toBe('a/b')
    expect(toRelativeEntry('/ws/repo', '/ws/repo/docs')).toBe('docs')
  })

  it('answers undefined for anything not expressible as a relative entry', () => {
    // Another drive, a sibling tree, or the root itself.
    expect(toRelativeEntry('D:\\ws\\repo', 'C:\\ws\\repo\\docs')).toBeUndefined()
    expect(toRelativeEntry('D:\\ws\\repo', 'D:\\ws\\other\\docs')).toBeUndefined()
    expect(toRelativeEntry('D:\\ws\\repo', 'D:\\ws\\repo')).toBeUndefined()
  })
})

describe('StandardsProjectOverview · ProtectedPathsCard (项目工程 1.3)', () => {
  /** A ready project state whose draft mirrors the persisted list. */
  function protectedState(
    stateOverrides: Partial<StandardsOverviewState> = {},
    summaryOverrides: Partial<BafStandardSummaryResult> = {},
  ) {
    return readyState({
      protectedDraft: ['docs'],
      ...stateOverrides,
      summary: readySummary({ guardProtectedPaths: ['docs'], ...summaryOverrides }),
    })
  }

  // 【变更】2026-10-20 (批次四 3.5): the row keeps ONLY the reveal-value button
  // + 编辑/删除 — the copy/open mini buttons are gone; the 防线 hook status
  // line is gone with the footer (批次四 3.3).
  it('lists the draft with the reveal value + edit / delete per row', () => {
    const revealPath = vi.fn()
    const { props } = harness(protectedState(undefined, { commitGuardHookInstalled: true }), { revealPath })
    render(<StandardsProjectOverview {...props} />)
    const row = screen.getByTestId('baf-standard-protected-row-0')
    expect(row.textContent).toContain('docs')
    // The path button reveals the joined absolute folder.
    fireEvent.click(row.querySelector('button') as HTMLElement)
    expect(revealPath).toHaveBeenCalledWith('/ws/docs')
    // Exactly the value button + 编辑/删除 — no copy/open, no hook line.
    expect(row.querySelectorAll('button')).toHaveLength(3)
    expect(row.textContent).not.toContain('copyLabel')
    expect(screen.queryByTestId('baf-standard-protected-hook')).toBeNull()
    // Clean draft → the save button stays disabled.
    expect((screen.getByTestId('baf-standard-protected-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('adds entries by button and Enter, refusing duplicates and empties', () => {
    const { props, store } = harness(protectedState())
    render(<StandardsProjectOverview {...props} />)
    const input = screen.getByLabelText('protectedAddPlaceholder')
    fireEvent.change(input, { target: { value: 'src/gen' } })
    fireEvent.click(screen.getByTestId('baf-standard-protected-add'))
    expect(store.getSnapshot().protectedDraft).toEqual(['docs', 'src/gen'])
    // The add input clears after a successful add.
    expect((input as HTMLInputElement).value).toBe('')
    fireEvent.change(input, { target: { value: 'docs' } })
    fireEvent.click(screen.getByTestId('baf-standard-protected-add'))
    expect(store.getSnapshot().protectedDraft).toEqual(['docs', 'src/gen'])
    expect(screen.getByTestId('baf-standard-protected-notice').textContent).toContain('protectedDuplicate')
    // Enter adds too; an empty entry is a no-op, not a row.
    fireEvent.change(input, { target: { value: 'build' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: '  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(store.getSnapshot().protectedDraft).toEqual(['docs', 'src/gen', 'build'])
    // Dirty draft enables the save button.
    expect((screen.getByTestId('baf-standard-protected-save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('folds a picked folder in (or reports an outside pick); cancel picks nothing', async () => {
    const pickDirectory = vi.fn()
      .mockResolvedValueOnce('/ws/picked')
      .mockResolvedValueOnce('D:\\elsewhere')
      .mockResolvedValueOnce(null)
    const { props, store } = harness(protectedState(), { pickDirectory })
    render(<StandardsProjectOverview {...props} />)
    fireEvent.click(screen.getByTestId('baf-standard-protected-pick'))
    await screen.findByTestId('baf-standard-protected-row-1')
    expect(store.getSnapshot().protectedDraft).toEqual(['docs', 'picked'])
    fireEvent.click(screen.getByTestId('baf-standard-protected-pick'))
    expect(await screen.findByTestId('baf-standard-protected-notice')).toBeTruthy()
    expect(screen.getByTestId('baf-standard-protected-notice').textContent).toContain('protectedPickOutside')
    fireEvent.click(screen.getByTestId('baf-standard-protected-pick'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(store.getSnapshot().protectedDraft).toEqual(['docs', 'picked'])
  })

  // 【变更】2026-10-20 (批次四 3.5): editing is a bare autoFocus input that
  // commits on Enter/blur and ALWAYS leaves edit state — invalid or duplicate
  // text reverts with its notice; Escape reverts silently.
  it('edits a row in place (Enter commits; invalid/duplicate revert; Escape reverts) and deletes rows', () => {
    const { props, store } = harness(protectedState({ protectedDraft: ['docs', 'legacy'] }, { guardProtectedPaths: ['docs', 'legacy'] }))
    render(<StandardsProjectOverview {...props} />)
    // Edit the second row.
    fireEvent.click(withinRow('baf-standard-protected-row-1', 'editLabel'))
    const editor = screen.getByLabelText('protectedEditLabel') as HTMLInputElement
    fireEvent.change(editor, { target: { value: 'legacy2' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(store.getSnapshot().protectedDraft).toEqual(['docs', 'legacy2'])
    // An empty finish reverts the row and says why.
    fireEvent.click(withinRow('baf-standard-protected-row-0', 'editLabel'))
    fireEvent.change(screen.getByLabelText('protectedEditLabel'), { target: { value: '  ' } })
    fireEvent.keyDown(screen.getByLabelText('protectedEditLabel'), { key: 'Enter' })
    expect(screen.getByTestId('baf-standard-protected-notice').textContent).toContain('protectedInvalidEntry')
    expect(store.getSnapshot().protectedDraft).toEqual(['docs', 'legacy2'])
    expect(screen.queryByLabelText('protectedEditLabel')).toBeNull()
    // Escape cancels without touching the draft.
    fireEvent.click(withinRow('baf-standard-protected-row-0', 'editLabel'))
    fireEvent.keyDown(screen.getByLabelText('protectedEditLabel'), { key: 'Escape' })
    expect(store.getSnapshot().protectedDraft).toEqual(['docs', 'legacy2'])
    expect(screen.queryByLabelText('protectedEditLabel')).toBeNull()
    // A duplicate finish reverts the row to its original text and says why.
    fireEvent.click(withinRow('baf-standard-protected-row-0', 'editLabel'))
    fireEvent.change(screen.getByLabelText('protectedEditLabel'), { target: { value: 'legacy2' } })
    fireEvent.blur(screen.getByLabelText('protectedEditLabel'))
    expect(screen.getByTestId('baf-standard-protected-notice').textContent).toContain('protectedDuplicate')
    expect(store.getSnapshot().protectedDraft).toEqual(['docs', 'legacy2'])
    // Delete removes the row.
    fireEvent.click(withinRow('baf-standard-protected-row-0', 'deleteLabel'))
    expect(store.getSnapshot().protectedDraft).toEqual(['legacy2'])
  })

  it('saves through the face, shows the saving label, and renders the empty state', () => {
    const saveProtectedPaths = vi.fn()
    const { props } = harness(protectedState({ protectedSaving: true }), { saveProtectedPaths })
    render(<StandardsProjectOverview {...props} />)
    const save = screen.getByTestId('baf-standard-protected-save') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(save.textContent).toContain('protectedSaving')
    cleanup()
    const empty = harness(protectedState({ protectedDraft: [] }, { guardProtectedPaths: [] }))
    render(<StandardsProjectOverview {...empty.props} />)
    expect(screen.getByTestId('baf-standard-protected-empty').textContent).toContain('protectedEmpty')
    expect((screen.getByTestId('baf-standard-protected-save') as HTMLButtonElement).disabled).toBe(true)
  })

  // 【变更】2026-10-20 (批次三 4.3): the footer is 保存 + 取消 — the cancel
  // drops a dirty draft back to the persisted list.
  it('drops a dirty draft back to the persisted list on 取消 (批次三 4.3)', () => {
    const { props, store } = harness(protectedState({ protectedDraft: ['docs', 'temp'] }))
    render(<StandardsProjectOverview {...props} />)
    const cancel = screen.getByTestId('baf-standard-protected-cancel') as HTMLButtonElement
    expect(cancel.disabled).toBe(false)
    fireEvent.click(cancel)
    expect(store.getSnapshot().protectedDraft).toEqual(['docs'])
    // Clean again → both footer buttons disable.
    expect((screen.getByTestId('baf-standard-protected-cancel') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('baf-standard-protected-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders marker notices localized and raw notices verbatim', () => {
    const localized = harness(protectedState({ protectedNotice: 'openFailed' }))
    render(<StandardsProjectOverview {...localized.props} />)
    expect(screen.getByTestId('baf-standard-protected-notice').textContent).toContain('noticeOpenFailed')
    cleanup()
    const raw = harness(protectedState({ protectedNotice: 'hook failed: boom' }))
    render(<StandardsProjectOverview {...raw.props} />)
    expect(screen.getByTestId('baf-standard-protected-notice').textContent).toContain('hook failed: boom')
  })
})

/** One mini button inside a protected row, addressed by its label text. */
function withinRow(testid: string, label: string): HTMLElement {
  const row = screen.getByTestId(testid)
  const button = [...row.querySelectorAll('button')].find(candidate => candidate.textContent === label)
  expect(button).toBeDefined()
  return button as HTMLElement
}

describe('StandardsController · 禁改路径 save + 桌面手势 + 文件夹选择', () => {
  /** Minimal client ctx: the two remotes plus an optional uiWorkspace slice. */
  function controllerCtx(remotes: {
    summary?: () => Promise<unknown>
    save?: (paths: readonly string[]) => Promise<unknown>
    openWorkspacePath?: (request: { path: string; action?: 'reveal' }) => Promise<{ ok: boolean }>
  }, workspaceSlice?: unknown) {
    const ctx = {
      remote: {
        bafStandardConfig: {
          summary: vi.fn(remotes.summary ?? (() => Promise.resolve({ ok: true, value: readySummary() }))),
          saveProtectedPaths: vi.fn(remotes.save ?? (() => Promise.resolve({ ok: true, value: { status: 'ready', paths: [] } }))),
        },
        session: {
          openWorkspacePath: vi.fn(remotes.openWorkspacePath ?? (() => Promise.resolve({ ok: true }))),
        },
      },
      get: vi.fn(() => workspaceSlice),
    }
    return { ctx, remote: ctx.remote }
  }

  const tick = () => new Promise(r => setTimeout(r, 0))
  const READY = readySummary({ guardProtectedPaths: ['docs', '<enterprise-tbd>'] })

  it('seeds the draft from a ready summary (placeholder filtered) and clears it otherwise', async () => {
    const { ctx } = controllerCtx({ summary: () => Promise.resolve({ ok: true, value: READY }) })
    const c = new StandardsController(ctx as never)
    await tick()
    expect(c.face().hooks.standards.getSnapshot().protectedDraft).toEqual(['docs'])
    const flip = controllerCtx({ summary: () => Promise.resolve({ ok: true, value: { status: 'no-baseline' } }) })
    const c2 = new StandardsController(flip.ctx as never)
    await tick()
    expect(c2.face().hooks.standards.getSnapshot().protectedDraft).toBeUndefined()
  })

  it('saves the draft, reloads, and surfaces a hook warning as the notice', async () => {
    let calls = 0
    const { ctx, remote } = controllerCtx({
      summary: () => {
        calls += 1
        return Promise.resolve({ ok: true, value: calls === 1 ? READY : readySummary({ guardProtectedPaths: ['docs', 'src/gen'] }) })
      },
      save: () => Promise.resolve({ ok: true, value: { status: 'ready', paths: ['docs', 'src/gen'], hookInstalled: false, message: 'hook refused' } }),
    })
    const c = new StandardsController(ctx as never)
    await tick()
    c.updateProtectedDraft(['docs', 'src/gen'])
    await c.saveProtectedPaths()
    expect(remote.bafStandardConfig.saveProtectedPaths).toHaveBeenCalledWith(['docs', 'src/gen'])
    const state = c.face().hooks.standards.getSnapshot()
    expect(state.protectedSaving).toBe(false)
    expect(state.protectedNotice).toBe('hook refused')
    expect(state.protectedDraft).toEqual(['docs', 'src/gen'])
  })

  it('settles every non-ready save answer and transport failure into the notice', async () => {
    const cases: readonly [unknown, string | undefined][] = [
      [{ ok: true, value: { status: 'ready', paths: ['x'], hookInstalled: true } }, undefined],
      [{ ok: true, value: { status: 'ready', paths: ['x'] } }, undefined],
      [{ ok: true, value: { status: 'invalid', message: '路径不能为空' } }, '路径不能为空'],
      [{ ok: true, value: { status: 'no-baseline' } }, 'no-baseline'],
      [{ ok: false, error: { message: 'arity mismatch' } }, 'arity mismatch'],
    ]
    for (const [answer, expected] of cases) {
      const { ctx } = controllerCtx({ save: () => Promise.resolve(answer) })
      const c = new StandardsController(ctx as never)
      await tick()
      c.updateProtectedDraft(['docs'])
      await c.saveProtectedPaths()
      expect(c.face().hooks.standards.getSnapshot().protectedNotice).toBe(expected)
    }
    const { ctx: thrown } = controllerCtx({ save: () => Promise.reject(new Error('rpc down')) })
    const c = new StandardsController(thrown as never)
    await tick()
    c.updateProtectedDraft(['docs'])
    await c.saveProtectedPaths()
    expect(c.face().hooks.standards.getSnapshot().protectedNotice).toBe('rpc down')
  })

  it('returns early when no draft exists (nothing loaded yet)', async () => {
    const { ctx, remote } = controllerCtx({ summary: () => new Promise(() => {}) })
    const c = new StandardsController(ctx as never)
    await c.saveProtectedPaths()
    expect(remote.bafStandardConfig.saveProtectedPaths).not.toHaveBeenCalled()
    expect(c.face().hooks.standards.getSnapshot().protectedSaving).toBe(false)
  })

  it('routes reveal vs open gestures and lands failures in the notice', async () => {
    const { ctx, remote } = controllerCtx({
      openWorkspacePath: () => Promise.resolve({ ok: false }),
    })
    const c = new StandardsController(ctx as never)
    await tick()
    await c.openPath('/ws/.baf/baseline.yml')
    expect(remote.session.openWorkspacePath).toHaveBeenLastCalledWith({ path: '/ws/.baf/baseline.yml' })
    expect(c.face().hooks.standards.getSnapshot().protectedNotice).toBe('openFailed')
    await c.revealPath('/ws')
    expect(remote.session.openWorkspacePath).toHaveBeenLastCalledWith({ path: '/ws', action: 'reveal' })
    expect(c.face().hooks.standards.getSnapshot().protectedNotice).toBe('revealFailed')
    c.clearProtectedNotice()
    expect(c.face().hooks.standards.getSnapshot().protectedNotice).toBeUndefined()
    const { ctx: thrown } = controllerCtx({
      openWorkspacePath: () => Promise.reject(new Error('no desktop')),
    })
    const c2 = new StandardsController(thrown as never)
    await tick()
    await c2.revealPath('/ws')
    expect(c2.face().hooks.standards.getSnapshot().protectedNotice).toBe('no desktop')
  })

  it('prefers the preload picker, then the uiWorkspace service, and null when neither works', async () => {
    const preload = { pick: vi.fn().mockResolvedValue('D:\\ws\\docs') }
    ;(globalThis as typeof globalThis & { __DSH_DIRECTORY_PICKER__?: unknown }).__DSH_DIRECTORY_PICKER__ = preload
    const { ctx } = controllerCtx({})
    const c = new StandardsController(ctx as never)
    await tick()
    expect(await c.pickDirectory()).toBe('D:\\ws\\docs')
    const failing = { pick: vi.fn().mockRejectedValue(new Error('closed')) }
    ;(globalThis as typeof globalThis & { __DSH_DIRECTORY_PICKER__?: unknown }).__DSH_DIRECTORY_PICKER__ = failing
    expect(await c.pickDirectory()).toBeNull()
    delete (globalThis as typeof globalThis & { __DSH_DIRECTORY_PICKER__?: unknown }).__DSH_DIRECTORY_PICKER__

    const service = { pickDirectory: vi.fn().mockResolvedValue('/ws/docs') }
    const withService = controllerCtx({}, service)
    const c2 = new StandardsController(withService.ctx as never)
    await tick()
    expect(await c2.pickDirectory()).toBe('/ws/docs')
    const throwing = { pickDirectory: vi.fn().mockRejectedValue(new Error('cancelled')) }
    const withThrowing = controllerCtx({}, throwing)
    const c3 = new StandardsController(withThrowing.ctx as never)
    await tick()
    expect(await c3.pickDirectory()).toBeNull()
    // A uiWorkspace without a picking face (or absent entirely) answers null.
    const bare = controllerCtx({}, { somethingElse: true })
    const c4 = new StandardsController(bare.ctx as never)
    await tick()
    expect(await c4.pickDirectory()).toBeNull()
    const none = controllerCtx({}, undefined)
    const c5 = new StandardsController(none.ctx as never)
    await tick()
    expect(await c5.pickDirectory()).toBeNull()
  })

  // 【变更】2026-10-20 (批次三 4.4): the add-time existence check — every
  // failure mode fails OPEN so a broken RPC never bricks the add flow.
  it('stats workspace entries and fails open on every transport problem', async () => {
    const { ctx } = controllerCtx({})
    ;(ctx.remote.bafStandardConfig as Record<string, unknown>).statWorkspacePath = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: { exists: true } })
      .mockResolvedValueOnce({ ok: true, value: { exists: false } })
      .mockResolvedValueOnce({ ok: false, error: { message: 'boom' } })
      .mockRejectedValueOnce(new Error('rpc down'))
    const c = new StandardsController(ctx as never)
    await tick()
    expect(await c.statWorkspacePath('scripts/build.sh')).toBe(true)
    expect(await c.statWorkspacePath('scripts/ghost.sh')).toBe(false)
    expect(await c.statWorkspacePath('scripts/any')).toBe(true)
    expect(await c.statWorkspacePath('scripts/any')).toBe(true)
    // A namespace without the method at all (older host) also fails open.
    const legacy = controllerCtx({})
    const c2 = new StandardsController(legacy.ctx as never)
    await tick()
    expect(await c2.statWorkspacePath('scripts/old.sh')).toBe(true)
  })
})

describe('StandardsProjectOverview · no-baseline 生成配置文件 (六问题批 4.1)', () => {
  /** The first-run state: cwd/baselinePath known, baseline missing. */
  function freshState(): StandardsOverviewState {
    return notReadyState('no-baseline', {
      status: 'no-baseline', cwd: 'D:/demo/fresh', baselinePath: 'D:/demo/fresh/.baf/baseline.yml',
    })
  }

  it('shows the error line and the generate button; the click runs the scaffold face', () => {
    const generateBaseline = vi.fn()
    const { props } = harness(freshState(), { generateBaseline })
    render(<StandardsProjectOverview {...props} />)
    expect(screen.getByTestId('baf-standard-generate').textContent).toContain('noBaselineError')
    fireEvent.click(screen.getByTestId('baf-standard-generate-button'))
    expect(generateBaseline).toHaveBeenCalledTimes(1)
  })

  it('labels the in-flight run and renders the failure notice verbatim', () => {
    const generating = harness(freshState())
    generating.store.update((state) => { state.generating = true })
    render(<StandardsProjectOverview {...generating.props} />)
    const button = screen.getByTestId('baf-standard-generate-button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.textContent).toContain('generatingBaseline')
    cleanup()
    const failed = harness(freshState())
    failed.store.update((state) => { state.generateNotice = 'git init 未成功' })
    render(<StandardsProjectOverview {...failed.props} />)
    expect(screen.getByTestId('baf-standard-generate-notice').textContent).toContain('git init 未成功')
  })

  it('renders no generate row once ready', () => {
    const { props } = harness(readyState())
    render(<StandardsProjectOverview {...props} />)
    expect(screen.queryByTestId('baf-standard-generate')).toBeNull()
  })
})

describe('StandardsProjectOverview · NodeHooksCard 状态脚本 (2026-10-19 流程图样式对齐)', () => {
  it('renders the 8-node route-style canvas in order, drift absent, save disabled while clean', () => {
    const { props } = harness(readyState())
    render(<StandardsProjectOverview {...props} />)
    const nodes = [...document.querySelectorAll('[data-testid^="baf-standard-hooks-node-"]')]
    expect(nodes.map(node => node.getAttribute('data-testid'))).toEqual([
      'baf-standard-hooks-node-intake',
      'baf-standard-hooks-node-open',
      'baf-standard-hooks-node-clarify',
      'baf-standard-hooks-node-design',
      'baf-standard-hooks-node-plan',
      'baf-standard-hooks-node-implement',
      'baf-standard-hooks-node-verify',
      'baf-standard-hooks-node-archive',
    ])
    // The engine never fires hooks on the drift parking lot — it must not be
    // configurable here either.
    expect(screen.queryByTestId('baf-standard-hooks-node-drift')).toBeNull()
    // Route-parity canvas: the SVG chain edges carry arrowheads.
    expect(document.querySelectorAll('svg path[marker-end]').length).toBeGreaterThan(0)
    // A clean draft selects the first node (接单) into the editor.
    expect(screen.getByTestId('baf-standard-hooks-editor').getAttribute('data-node')).toBe('intake')
    expect((screen.getByTestId('baf-standard-hooks-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('drafts add / edit / delete entries per kind and saves through the face', async () => {
    const saveNodeHooks = vi.fn()
    const { props, store } = harness(readyState(), { saveNodeHooks })
    render(<StandardsProjectOverview {...props} />)
    // Click the canvas card to select 实现 into the right-hand editor.
    fireEvent.click(screen.getByTestId('baf-standard-hooks-node-implement'))
    const editor = screen.getByTestId('baf-standard-hooks-editor')
    expect(editor.getAttribute('data-node')).toBe('implement')
    // Two kind rows per node (enter then exit), each with one add input —
    // plus the hidden shared file chooser rendered LAST (批次四 3.6).
    const inputs = editor.querySelectorAll('input')
    expect(inputs).toHaveLength(3)
    expect((inputs[2] as HTMLInputElement).type).toBe('file')
    // Add into the EXIT list (退出实现状态 must pass). 【变更】2026-10-20
    // (批次三 4.4): every add awaits the existence RPC before it lands.
    fireEvent.change(inputs[1] as HTMLElement, { target: { value: './scripts/build.sh' } })
    fireEvent.click(screen.getByTestId('baf-standard-hooks-add-implement-exit'))
    await tick()
    expect(store.getSnapshot().hooksDraft).toEqual({ implement: { exit: [{ path: 'scripts/build.sh', fatal: true }] } })
    // The canvas accent reflects the counts; the add input cleared and the
    // draft is dirty → save enabled.
    expect(screen.getByTestId('baf-standard-hooks-node-implement').textContent).toContain('hooksExitShort')
    expect((inputs[1] as HTMLInputElement).value).toBe('')
    const save = screen.getByTestId('baf-standard-hooks-save') as HTMLButtonElement
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    expect(saveNodeHooks).toHaveBeenCalledTimes(1)
    // A duplicate add is refused (synchronously, before the RPC) with the
    // shared duplicate notice, inline.
    fireEvent.change(inputs[1] as HTMLElement, { target: { value: 'scripts/build.sh' } })
    fireEvent.click(screen.getByTestId('baf-standard-hooks-add-implement-exit'))
    await tick()
    expect(store.getSnapshot().hooksDraft).toEqual({ implement: { exit: [{ path: 'scripts/build.sh', fatal: true }] } })
    expect(editor.textContent).toContain('protectedDuplicate')
    // Edit in place: the only entry row's 编辑 swaps in an InlineEditor.
    fireEvent.click(withinRow('baf-standard-hooks-editor', 'editLabel'))
    const inline = screen.getByLabelText('hooksEditLabel')
    fireEvent.change(inline, { target: { value: 'scripts/lint.ps1' } })
    fireEvent.keyDown(inline, { key: 'Enter' })
    expect(store.getSnapshot().hooksDraft).toEqual({ implement: { exit: [{ path: 'scripts/lint.ps1', fatal: true }] } })
    // Deleting the last entry of BOTH-empty lists drops the node entirely.
    fireEvent.click(withinRow('baf-standard-hooks-editor', 'deleteLabel'))
    expect(store.getSnapshot().hooksDraft).toEqual({})
  })

  it('keeps the node when the other kind still has entries', async () => {
    const { props, store } = harness(readyState())
    render(<StandardsProjectOverview {...props} />)
    fireEvent.click(screen.getByTestId('baf-standard-hooks-node-verify'))
    const editor = screen.getByTestId('baf-standard-hooks-editor')
    const inputs = editor.querySelectorAll('input')
    fireEvent.change(inputs[0] as HTMLElement, { target: { value: 'scripts/enter-verify.mjs' } })
    fireEvent.click(screen.getByTestId('baf-standard-hooks-add-verify-enter'))
    await tick()
    // Deleting it again: enter goes empty → the node leaves the draft.
    fireEvent.click(withinRow('baf-standard-hooks-editor', 'deleteLabel'))
    expect(store.getSnapshot().hooksDraft).toEqual({})
    // Re-add on BOTH kinds, delete one: the other kind's entry survives.
    fireEvent.change(inputs[0] as HTMLElement, { target: { value: 'e.mjs' } })
    fireEvent.click(screen.getByTestId('baf-standard-hooks-add-verify-enter'))
    await tick()
    fireEvent.change(editor.querySelectorAll('input')[1] as HTMLElement, { target: { value: 'x.sh' } })
    fireEvent.click(screen.getByTestId('baf-standard-hooks-add-verify-exit'))
    await tick()
    // Delete the EXIT entry (x.sh) specifically: 【变更】2026-10-20 (批次三
    // 4.4) the entry itself is a clickable BUTTON now — its row is the div
    // parenting it; the enter entry (e.mjs) must survive.
    const entryButton = [...editor.querySelectorAll('button')]
      .find(button => button.textContent === 'x.sh') as HTMLElement
    const exitRow = entryButton.parentElement
    const exitDelete = [...(exitRow?.querySelectorAll('button') ?? [])]
      .find(button => button.textContent === 'deleteLabel') as HTMLElement
    fireEvent.click(exitDelete)
    expect(store.getSnapshot().hooksDraft).toEqual({ verify: { enter: [{ path: 'e.mjs', fatal: true }] } })
  })

  it('labels the in-flight save and renders the notice line', () => {
    const saving = harness(readyState({ hooksSaving: true }))
    render(<StandardsProjectOverview {...saving.props} />)
    const save = screen.getByTestId('baf-standard-hooks-save') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(save.textContent).toContain('hooksSaving')
    cleanup()
    const noticed = harness(readyState({ hooksNotice: '未知的工作流节点：midway' }))
    render(<StandardsProjectOverview {...noticed.props} />)
    expect(screen.getByTestId('baf-standard-hooks-notice').textContent)
      .toContain('未知的工作流节点：midway')
  })

  // 【变更】2026-10-20 (批次三 4.4): the add-time existence check — a miss
  // never lands in the draft and says so inline.
  it('rejects an add whose path does not exist and keeps the draft clean', async () => {
    const statWorkspacePath = vi.fn().mockResolvedValueOnce(false)
    const { props, store } = harness(readyState(), { statWorkspacePath })
    render(<StandardsProjectOverview {...props} />)
    fireEvent.click(screen.getByTestId('baf-standard-hooks-node-implement'))
    const editor = screen.getByTestId('baf-standard-hooks-editor')
    fireEvent.change(editor.querySelectorAll('input')[1] as HTMLElement, { target: { value: 'scripts/ghost.sh' } })
    fireEvent.click(screen.getByTestId('baf-standard-hooks-add-implement-exit'))
    await tick()
    expect(statWorkspacePath).toHaveBeenCalledWith('scripts/ghost.sh')
    expect(store.getSnapshot().hooksDraft).toEqual({})
    expect(editor.textContent).toContain('hooksPathMissing')
    // The input keeps the typo for a quick fix; a clean draft keeps save off.
    expect((editor.querySelectorAll('input')[1] as HTMLInputElement).value).toBe('scripts/ghost.sh')
    expect((screen.getByTestId('baf-standard-hooks-save') as HTMLButtonElement).disabled).toBe(true)
  })

  // 【变更】2026-10-20 (批次四 3.6 → 批次五 1.3): the picker selects a script
  // FILE, PER ROW. Desktop (`pickFile`) opens the NATIVE dialog with the
  // workspace root as its default directory and folds the absolute answer
  // into the row whose 选择脚本文件 was clicked; plain web falls back to the
  // hidden <input type="file"> (jsdom cannot open the OS dialog — the probe
  // drives its change event), routed by pickKind to THAT row only — the other
  // row's input stays clean.
  it('pre-fills only the row whose 选择脚本文件 was clicked (批次五 1.3)', async () => {
    const bridge = { pathFor: vi.fn(), pickFile: vi.fn() }
    ;(globalThis as { __BAF_FILE_PICKER__?: typeof bridge }).__BAF_FILE_PICKER__ = bridge
    try {
      const { props } = harness(readyState())
      render(<StandardsProjectOverview {...props} />)
      fireEvent.click(screen.getByTestId('baf-standard-hooks-node-implement'))
      const editor = screen.getByTestId('baf-standard-hooks-editor')
      const inputs = editor.querySelectorAll('input')
      const enterInput = inputs[0] as HTMLInputElement
      const exitInput = inputs[1] as HTMLInputElement
      // The editor's LAST input is the shared hidden file chooser.
      const fileInput = inputs[inputs.length - 1] as HTMLInputElement
      expect(fileInput.type).toBe('file')
      const choose = (name: string): void => {
        const file = new File(['x'], name, { type: 'text/plain' })
        Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
        fireEvent.change(fileInput)
      }
      // Desktop native dialog: the fixture workspace root (/ws) rides as the
      // default directory; the absolute answer folds into the clicked row.
      bridge.pickFile.mockResolvedValueOnce('/ws/scripts/build.sh')
      fireEvent.click(screen.getByTestId('baf-standard-hooks-pick-implement-exit'))
      await tick()
      expect(bridge.pickFile).toHaveBeenCalledWith('/ws')
      expect(exitInput.value).toBe('scripts/build.sh')
      expect(enterInput.value).toBe('')
      // Cancel (null) prefills nothing.
      bridge.pickFile.mockResolvedValueOnce(null)
      fireEvent.click(screen.getByTestId('baf-standard-hooks-pick-implement-enter'))
      await tick()
      expect(enterInput.value).toBe('')
      // Plain web bridge (pathFor only, no pickFile): the hidden chooser
      // routes by pickKind — exit's button was last clicked.
      const webBridge = { pathFor: vi.fn() }
      ;(globalThis as { __BAF_FILE_PICKER__?: typeof webBridge }).__BAF_FILE_PICKER__ = webBridge
      fireEvent.click(screen.getByTestId('baf-standard-hooks-pick-implement-exit'))
      webBridge.pathFor.mockReturnValueOnce('/ws/scripts/lint.ps1')
      choose('lint.ps1')
      expect(exitInput.value).toBe('scripts/lint.ps1')
      expect(enterInput.value).toBe('')
      // Outside the workspace root: the prefill stays and the notice says why.
      webBridge.pathFor.mockReturnValueOnce('/elsewhere/clean.sh')
      choose('clean.sh')
      expect(editor.textContent).toContain('protectedPickOutside')
      expect(exitInput.value).toBe('scripts/lint.ps1')
      // No bridge at all: the bare file NAME prefills.
      delete (globalThis as { __BAF_FILE_PICKER__?: typeof webBridge }).__BAF_FILE_PICKER__
      choose('audit.mjs')
      expect(exitInput.value).toBe('audit.mjs')
      expect(enterInput.value).toBe('')
    } finally {
      delete (globalThis as { __BAF_FILE_PICKER__?: unknown }).__BAF_FILE_PICKER__
    }
  })

  it('previews an existing entry (批次十五 2) and cancels a dirty draft (批次三 4.4)', async () => {
    const openQualityAsset = vi.fn()
    const summary = readySummary({ nodeHooks: { implement: { exit: [{ path: 'scripts/build.sh', fatal: true }] } } })
    const { props, store } = harness(
      readyState({ summary, hooksDraft: { implement: { exit: [{ path: 'scripts/build.sh', fatal: true }] } } }),
      { openQualityAsset },
    )
    render(<StandardsProjectOverview {...props} />)
    // The populated draft selects 实现 into the editor; the entry itself is
    // the click target with the absolute path as its hover title. 【变更】
    // 2026-10-22 (批次十五 2): the click PREVIEWS the script (rel form) in the
    // tab's hoisted modal — no direct default-app open.
    const entry = [...screen.getByTestId('baf-standard-hooks-editor').querySelectorAll('button')]
      .find(button => button.textContent === 'scripts/build.sh') as HTMLElement
    expect(entry.getAttribute('title')).toBe('/ws/scripts/build.sh')
    fireEvent.click(entry)
    expect(openQualityAsset).toHaveBeenCalledWith('scripts/build.sh')
    expect(screen.getByTestId('baf-quality-asset-modal')).toBeDefined()
    // Dirty the draft, then 取消 drops it back to the persisted map.
    fireEvent.click(withinRow('baf-standard-hooks-editor', 'deleteLabel'))
    expect(store.getSnapshot().hooksDraft).toEqual({})
    const cancel = screen.getByTestId('baf-standard-hooks-cancel') as HTMLButtonElement
    expect(cancel.disabled).toBe(false)
    fireEvent.click(cancel)
    expect(store.getSnapshot().hooksDraft).toEqual({ implement: { exit: [{ path: 'scripts/build.sh', fatal: true }] } })
    // Clean again → both footer buttons disable.
    expect((screen.getByTestId('baf-standard-hooks-save') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('baf-standard-hooks-cancel') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('StandardsController · 状态脚本 save + 生成配置文件 (六问题批 4.1b)', () => {
  /** Minimal client ctx: the bafStandardConfig namespace the controller touches. */
  function hooksControllerCtx(remotes: {
    summary?: () => Promise<unknown>
    saveHooks?: (hooks: unknown) => Promise<unknown>
    generate?: () => Promise<unknown>
  }) {
    const remote = {
      bafStandardConfig: {
        summary: vi.fn(remotes.summary ?? (() => Promise.resolve({ ok: true, value: readySummary() }))),
        saveNodeHooks: vi.fn(remotes.saveHooks ?? (() => Promise.resolve({ ok: true, value: { status: 'ready', hooks: {} } }))),
        generateBaseline: vi.fn(remotes.generate ?? (() => Promise.resolve({ ok: true, value: { status: 'ready', createdCount: 4 } }))),
      },
    }
    const ctx = { remote, get: vi.fn(() => undefined) }
    return { ctx, remote }
  }
  const tick = () => new Promise(r => setTimeout(r, 0))

  it('seeds the hooks draft from a ready summary and clears it otherwise', async () => {
    const seeded = hooksControllerCtx({
      summary: () => Promise.resolve({
        ok: true,
        value: readySummary({ nodeHooks: { implement: { exit: [{ path: 'scripts/build.sh', fatal: true }] } } }),
      }),
    })
    const c = new StandardsController(seeded.ctx as never)
    await tick()
    expect(c.face().hooks.standards.getSnapshot().hooksDraft)
      .toEqual({ implement: { exit: [{ path: 'scripts/build.sh', fatal: true }] } })
    const flip = hooksControllerCtx({ summary: () => Promise.resolve({ ok: true, value: { status: 'no-baseline' } }) })
    const c2 = new StandardsController(flip.ctx as never)
    await tick()
    expect(c2.face().hooks.standards.getSnapshot().hooksDraft).toBeUndefined()
  })

  it('saves the wire map, reloads, and settles every failure into hooksNotice', async () => {
    const { ctx, remote } = hooksControllerCtx({
      summary: () => Promise.resolve({ ok: true, value: readySummary() }),
    })
    const c = new StandardsController(ctx as never)
    await tick()
    c.updateHooksDraft({ verify: { enter: [{ path: 'v.mjs', fatal: true }] } })
    await c.saveNodeHooks()
    expect(remote.bafStandardConfig.saveNodeHooks).toHaveBeenCalledWith({ verify: { enter: [{ path: 'v.mjs', fatal: true }] } })
    const state = c.face().hooks.standards.getSnapshot()
    expect(state.hooksSaving).toBe(false)
    expect(state.hooksNotice).toBeUndefined()
    // The ready path reloads so a saved map re-reads as itself.
    expect(remote.bafStandardConfig.summary.mock.calls.length).toBeGreaterThanOrEqual(2)

    for (const [answer, expected] of [
      [{ ok: true, value: { status: 'invalid', message: '路径不能为空' } }, '路径不能为空'],
      [{ ok: true, value: { status: 'no-baseline' } }, 'no-baseline'],
      [{ ok: false, error: { message: 'arity mismatch' } }, 'arity mismatch'],
    ] as const) {
      const failing = hooksControllerCtx({ saveHooks: () => Promise.resolve(answer) })
      const c2 = new StandardsController(failing.ctx as never)
      await tick()
      c2.updateHooksDraft({ open: { enter: [{ path: 'a.sh', fatal: true }] } })
      await c2.saveNodeHooks()
      expect(c2.face().hooks.standards.getSnapshot().hooksNotice).toBe(expected)
      c2.clearHooksNotice()
      expect(c2.face().hooks.standards.getSnapshot().hooksNotice).toBeUndefined()
    }
    const thrown = hooksControllerCtx({ saveHooks: () => Promise.reject(new Error('rpc down')) })
    const c3 = new StandardsController(thrown.ctx as never)
    await tick()
    c3.updateHooksDraft({ open: { enter: [{ path: 'a.sh', fatal: true }] } })
    await c3.saveNodeHooks()
    expect(c3.face().hooks.standards.getSnapshot().hooksNotice).toBe('rpc down')
    // No draft yet (summary still loading) → silent no-op.
    const bare = hooksControllerCtx({ summary: () => new Promise(() => {}) })
    const c4 = new StandardsController(bare.ctx as never)
    await c4.saveNodeHooks()
    expect(bare.remote.bafStandardConfig.saveNodeHooks).not.toHaveBeenCalled()
  })

  it('generateBaseline runs the scaffold, reloads, settles failures, and guards re-entry', async () => {
    const { ctx, remote } = hooksControllerCtx({
      summary: () => Promise.resolve({ ok: true, value: { status: 'no-baseline', cwd: '/ws' } }),
    })
    const c = new StandardsController(ctx as never)
    await tick()
    await c.generateBaseline()
    expect(remote.bafStandardConfig.generateBaseline).toHaveBeenCalledTimes(1)
    expect(c.face().hooks.standards.getSnapshot().generating).toBe(false)
    // ready → the controller reloaded so the tab flips without a refresh.
    expect(remote.bafStandardConfig.summary.mock.calls.length).toBeGreaterThanOrEqual(2)

    const failing = hooksControllerCtx({ generate: () => Promise.resolve({ ok: true, value: { status: 'error', message: 'boom' } }) })
    const c2 = new StandardsController(failing.ctx as never)
    await tick()
    await c2.generateBaseline()
    const state = c2.face().hooks.standards.getSnapshot()
    expect(state.generating).toBe(false)
    expect(state.generateNotice).toBe('boom')

    // While a run is in flight the busy guard swallows re-entry.
    const stuck = hooksControllerCtx({ generate: () => new Promise(() => {}) })
    const c3 = new StandardsController(stuck.ctx as never)
    await tick()
    void c3.generateBaseline()
    await tick()
    void c3.generateBaseline()
    expect(stuck.remote.bafStandardConfig.generateBaseline).toHaveBeenCalledTimes(1)
    expect(c3.face().hooks.standards.getSnapshot().generating).toBe(true)
  })
})

describe('StandardsController · refreshIfClean (六问题批 4.1 web 验证修复)', () => {
  /** The controller-ctx fixture shape from the 4.1b describe, re-inlined. */
  function ctxWith(summary: () => Promise<unknown>) {
    const remote = { bafStandardConfig: { summary: vi.fn(summary) } }
    return { ctx: { remote, get: vi.fn(() => undefined) }, remote }
  }
  const tick = () => new Promise(r => setTimeout(r, 0))

  it('re-reads the summary on mount-refresh so a switched workspace shows through', async () => {
    let answer: BafStandardSummaryResult = readySummary({ cwd: '/first' })
    const { ctx, remote } = ctxWith(() => Promise.resolve({ ok: true, value: answer }))
    const c = new StandardsController(ctx as never)
    await tick()
    expect(c.face().hooks.standards.getSnapshot().summary?.cwd).toBe('/first')
    // The user switches sessions; the next mount refresh must pick that up.
    answer = readySummary({ cwd: '/second' })
    c.refreshIfClean()
    await tick()
    expect(remote.bafStandardConfig.summary).toHaveBeenCalledTimes(2)
    expect(c.face().hooks.standards.getSnapshot().summary?.cwd).toBe('/second')
  })

  it('skips the mount-refresh while a draft is mid-edit', async () => {
    const { ctx, remote } = ctxWith(() => Promise.resolve({
      ok: true,
      value: readySummary({ nodeHooks: { implement: { exit: [{ path: 'scripts/build.sh', fatal: true }] } } }),
    }))
    const c = new StandardsController(ctx as never)
    await tick()
    c.updateHooksDraft({ implement: { exit: [{ path: 'scripts/build.sh', fatal: true }, { path: 'scripts/lint.ps1', fatal: true }] } })
    c.refreshIfClean()
    await tick()
    expect(remote.bafStandardConfig.summary).toHaveBeenCalledTimes(1)
    expect(c.face().hooks.standards.getSnapshot().hooksDraft)
      .toEqual({ implement: { exit: [{ path: 'scripts/build.sh', fatal: true }, { path: 'scripts/lint.ps1', fatal: true }] } })
  })

  it('preserves a draft that went dirty during a reload roundtrip', async () => {
    type Release = (value: { ok: true; value: BafStandardSummaryResult }) => void
    let release: Release | undefined
    const { ctx } = ctxWith(() => new Promise((resolve) => { release = resolve }))
    const c = new StandardsController(ctx as never)
    await tick()
    // The user starts editing while the (clean-started) refresh is in flight…
    c.updateHooksDraft({ verify: { enter: [{ path: 'e.mjs', fatal: true }] } })
    release?.({ ok: true, value: readySummary({ nodeHooks: {} }) })
    await tick()
    const state = c.face().hooks.standards.getSnapshot()
    expect(state.hooksDraft).toEqual({ verify: { enter: [{ path: 'e.mjs', fatal: true }] } })
    expect(state.summary?.status).toBe('ready')
  })
})

describe('StandardsOverview mount refresh (六问题批 4.1 web 验证修复)', () => {
  it('asks the controller to refresh on every tab mount', () => {
    const { props, face } = harness(readyState())
    render(<StandardsProjectOverview {...props} />)
    expect(face.refreshIfClean).toHaveBeenCalledTimes(1)
    cleanup()
    render(<StandardsProjectOverview {...props} />)
    expect(face.refreshIfClean).toHaveBeenCalledTimes(2)
  })
})

// 【变更】2026-10-29 (批次三十六 · 用户问题 1): the 项目工程 page answered the
// first visit with a one-frame error banner — the activation read failed while
// the workspace Remote was still coming up, and the panel's own read replaced
// the failure a moment later.
describe('StandardsController · summary read sequencing (批次三十六 · 用户问题 1)', () => {
  function ctxWith(summary: () => Promise<unknown>) {
    const remote = { bafStandardConfig: { summary: vi.fn(summary) } }
    return { ctx: { remote, get: vi.fn(() => undefined) }, remote }
  }
  const tick = () => new Promise(r => setTimeout(r, 0))

  it('does not answer the page with the activation read’s failure', async () => {
    const { ctx } = ctxWith(() => Promise.resolve({ ok: false, error: { message: 'waiting for service' } }))
    const c = new StandardsController(ctx as never)
    await tick()
    const state = c.face().hooks.standards.getSnapshot()
    expect(state.status).toBe('loading')
    expect(state.summary).toBeUndefined()
  })

  it('lets the panel’s own read decide the status', async () => {
    const { ctx } = ctxWith(() => Promise.resolve({ ok: false, error: { message: 'waiting for service' } }))
    const c = new StandardsController(ctx as never)
    await tick()
    c.refreshIfClean()
    await tick()
    expect(c.face().hooks.standards.getSnapshot().status).toBe('failed')
  })

  it('drops a stale answer so an older failure never flashes over the newer one', async () => {
    const resolvers: ((value: unknown) => void)[] = []
    const remote = {
      bafStandardConfig: {
        summary: vi.fn(() => new Promise((resolve) => { resolvers.push(resolve) })),
      },
    }
    const c = new StandardsController({ remote, get: vi.fn(() => undefined) } as never)
    // The activation read is still in flight; the panel's read starts now.
    c.refreshIfClean()
    expect(resolvers.length).toBe(2)
    // The newer read answers first; the older one answers last with a failure.
    resolvers[1]?.({ ok: true, value: readySummary({ cwd: '/new' }) })
    await tick()
    resolvers[0]?.({ ok: false, error: { message: 'stale failure' } })
    await tick()
    const state = c.face().hooks.standards.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.summary?.cwd).toBe('/new')
    expect(state.summaryError).toBeUndefined()
  })

  it('keeps the content and reports a failed read as a notice', async () => {
    let answer: unknown = { ok: true, value: readySummary({ cwd: '/first' }) }
    const { ctx } = ctxWith(() => Promise.resolve(answer))
    const c = new StandardsController(ctx as never)
    await tick()
    answer = { ok: false, error: { message: 'boom' } }
    await c.face().reload()
    await tick()
    const state = c.face().hooks.standards.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.summary?.cwd).toBe('/first')
    expect(state.summaryError).toBe('boom')
  })
})

// 【变更】2026-10-22 (批次十二 3, 客户决策): the 质量监控 tab's 资产 card —
// the explicit quality-pack file list with 预览 + 打开 per row. Replaces the
// old QualityFlowCard tests (the 执行流程 chart moved to the session tab).
import { QUALITY_ASSET_FILES } from '../src/index.ts'

describe('quality-assets catalog parity (批次十二 3)', () => {
  it('lists the 7 files applyEnterpriseStandards writes, each with a unique role key', () => {
    expect(QUALITY_ASSET_FILES.map(row => row.rel)).toEqual([
      'project.yml',
      '.baf/quality/ceedling-config.json',
      'CPPLINT.cfg',
      'cppcheck-suppressions.xml',
      '.clang-format',
      '.baf/quality/ceedling-README.md',
      '.baf/quality/static-analysis-README.md',
    ])
    expect(new Set(QUALITY_ASSET_FILES.map(row => row.roleKey)).size).toBe(QUALITY_ASSET_FILES.length)
  })
})
