// @vitest-environment jsdom
/**
 * BAF 工程规范 settings panels — stage-grouped enterprise rules and domain
 * slicing, plus 【变更】2026-10-18 (项目工程 1.1–1.3): the clickable project
 * path / config file readouts, the editable AI 禁改路径 card, and the
 * controller's save / desktop-gesture / directory-picker faces.
 * 【变更】2026-10-19 (六问题批 4.1): the path rows are the tab-top readonly
 * config items (the VALUE is the click target — no copy/open buttons), the
 * no-baseline state gains the 生成配置文件 button, and the 状态脚本 (NodeHooks)
 * card rides the ready branch; 4.3 drops the 企业规范 head + banner.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

afterEach(cleanup)
import { useSyncExternalStore } from 'react'
import {
  StandardsEnterpriseOverview, StandardsProjectOverview, StandardsQualityOverview, sliceAreaContent,
  toRelativeEntry,
} from '../src/client/StandardsOverview.tsx'
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

/** A rules document whose headings carry the Chinese tail the scaffold emits. */
const RULES = `# BAF 工程规范（产品默认）

本文件是 BAF 自带的默认工程规则。

## project-charter 项目章程

- 章程规则行。

## coding-style 编码风格

- 风格规则行。

## testing-discipline 测试纪律

- 回归测试先行。
`

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
    loadRules: vi.fn(),
    toggleRules: vi.fn(),
    toggleArea: (id: string) => {
      store.update((state) => {
        state.areasExpanded[id] = !state.areasExpanded[id]
      })
    },
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
    rules: { status: 'ready', path: '/ws/.baf/standards/default-rules.md', content: RULES },
    rulesExpanded: false,
    areasExpanded: {},
    protectedDraft: [],
    protectedSaving: false,
    protectedNotice: undefined,
    hooksDraft: {},
    hooksSaving: false,
    hooksNotice: undefined,
    generating: false,
    generateNotice: undefined,
    ...overrides,
  }
}

/** A non-ready state literal the panel tests keep re-using. */
function notReadyState(status: StandardsOverviewState['status'], summary: BafStandardSummaryResult): StandardsOverviewState {
  return {
    status,
    summary,
    rules: undefined,
    rulesExpanded: false,
    areasExpanded: {},
    protectedDraft: undefined,
    protectedSaving: false,
    protectedNotice: undefined,
    hooksDraft: undefined,
    hooksSaving: false,
    hooksNotice: undefined,
    generating: false,
    generateNotice: undefined,
  }
}

describe('sliceAreaContent (anchor slicing)', () => {
  it('slices from the anchored heading (Chinese tail tolerated) to the next ## heading', () => {
    const section = sliceAreaContent(RULES, 'coding-style')
    expect(section).toContain('## coding-style 编码风格')
    expect(section).toContain('风格规则行')
    expect(section).not.toContain('章程规则行')
    expect(section).not.toContain('testing-discipline')
  })

  it('runs the LAST section to end-of-document and matches a bare anchor heading', () => {
    expect(sliceAreaContent(RULES, 'testing-discipline')).toContain('回归测试先行')
    expect(sliceAreaContent('## docs\n- line', 'docs')).toContain('## docs')
  })

  it('answers undefined when the document has no such heading', () => {
    expect(sliceAreaContent(RULES, 'nope')).toBeUndefined()
    expect(sliceAreaContent('', 'logging')).toBeUndefined()
  })
})

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
    // 4.3: the card is 受保护路径 now, without its long description line;
    // 4.4: the 状态脚本 card drops its .baf/baseline.yml 说明 too.
    expect(screen.getByTestId('baf-standard-protected-card').textContent).toContain('protectedTitle')
    expect(screen.getByTestId('baf-standard-protected-card').textContent).not.toContain('protectedDesc')
    expect(screen.getByTestId('baf-standard-hooks-card').textContent).not.toContain('hooksDesc')
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
  // open mini-buttons). Project path click reveals the folder; config-file
  // click opens the file with its default application.
  it('shows the readonly project path (reveal) and config file name (default app) — value is the button', () => {
    const revealPath = vi.fn()
    const openPath = vi.fn()
    const { props } = harness(readyState(), { revealPath, openPath })
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
    fireEvent.click(fileButton as HTMLElement)
    expect(openPath).toHaveBeenCalledWith('/ws/.baf/baseline.yml')
  })

  it('omits the path readouts when the summary carries no paths', () => {
    const { cwd: _cwd, baselinePath: _baselinePath, ...bare } = readySummary()
    const { props } = harness(readyState({ summary: bare }))
    render(<StandardsProjectOverview {...props} />)
    expect(screen.queryByTestId('baf-standard-project-path')).toBeNull()
    expect(screen.queryByTestId('baf-standard-config-file')).toBeNull()
  })
})

describe('StandardsEnterpriseOverview · stage-grouped rules', () => {
  it('does not render baseline meta row or provenance dump blocks', () => {
    const { props } = harness(readyState())
    render(<StandardsEnterpriseOverview {...props} />)
    expect(screen.queryByTestId('baf-standard-meta')).toBeNull()
    expect(screen.queryByTestId('baf-standard-from')).toBeNull()
  })

  it('groups rule domains under workflow stage sections', () => {
    const { props } = harness(readyState())
    render(<StandardsEnterpriseOverview {...props} />)
    expect(screen.getByTestId('baf-standard-stage-stage.intake')).toBeDefined()
    expect(screen.getByTestId('baf-standard-area-project-charter')).toBeDefined()
    expect(screen.getByTestId('baf-standard-area-documentation')).toBeDefined()
    expect(screen.getByText('fromLiving')).toBeDefined()
  })

  it('expands a domain into its sliced rules; collapsing hides them again', () => {
    const { props } = harness(readyState())
    render(<StandardsEnterpriseOverview {...props} />)
    expect(screen.queryByTestId('baf-standard-area-body-coding-style')).toBeNull()
    fireEvent.click(screen.getByTestId('baf-standard-area-toggle-coding-style'))
    const body = screen.getByTestId('baf-standard-area-body-coding-style')
    expect(body.textContent).toContain('风格规则行')
    fireEvent.click(screen.getByTestId('baf-standard-area-toggle-coding-style'))
    expect(screen.queryByTestId('baf-standard-area-body-coding-style')).toBeNull()
  })

  it('degrades per area: unavailable doc points at the baseline, a ready doc without the section says so', () => {
    // 【变更】2026-10-13 (问题 4 批): the doc being UNAVAILABLE (no baseline to
    // locate it) renders the /baf-scaffold pointer; a readable doc that simply
    // lacks the section keeps the areaNoContent line.
    const unavailable = harness(readyState({
      rules: { status: 'unavailable', reason: 'no-workspace' },
    }))
    render(<StandardsEnterpriseOverview {...unavailable.props} />)
    fireEvent.click(screen.getByTestId('baf-standard-area-toggle-logging'))
    expect(screen.getByTestId('baf-standard-area-needs-logging').textContent).toContain('areaNeedsBaseline')
    cleanup()
    const readyNoLogging = harness(readyState())
    render(<StandardsEnterpriseOverview {...readyNoLogging.props} />)
    fireEvent.click(screen.getByTestId('baf-standard-area-toggle-logging'))
    expect(screen.getByTestId('baf-standard-area-missing-logging').textContent).toContain('areaNoContent')
  })

  it('renders the static 8-domain structure before ready — only the CONTENT needs the baseline (2026-10-13 问题 4 批)', () => {
    const { props } = harness(notReadyState('no-baseline', { status: 'no-baseline' }))
    render(<StandardsEnterpriseOverview {...props} />)
    // The product-constant structure is always there…
    expect(screen.getByTestId('baf-standard-areas')).toBeDefined()
    expect(screen.getByTestId('baf-standard-stage-stage.intake')).toBeDefined()
    expect(screen.getByTestId('baf-standard-area-project-charter')).toBeDefined()
    // 【变更】2026-10-19 (六问题批 4.3): the top-level no-baseline banner is
    // gone with the panel head — the per-area degradation carries the story.
    expect(screen.queryByTestId('baf-standard-empty')).toBeNull()
    // …and expanding an area fetches the doc and degrades to the pointer copy.
    fireEvent.click(screen.getByTestId('baf-standard-area-toggle-logging'))
    expect(props.loadRules).toHaveBeenCalled()
  })
})

describe('StandardsController · loadRules settle (2026-10-13 问题 4 批)', () => {
  /** Minimal client ctx: only the bafStandardConfig namespace the controller touches. */
  function controller(summary: () => Promise<unknown>, rulesDoc: () => Promise<unknown>) {
    const remote = {
      bafStandardConfig: { summary: vi.fn(summary), rulesDoc: vi.fn(rulesDoc) },
    }
    const c = new StandardsController({ remote } as never)
    return { c, remote }
  }
  const tick = () => new Promise(r => setTimeout(r, 0))

  it('settles the viewer to unavailable WITHOUT an RPC once the summary lands no-baseline', async () => {
    const { c, remote } = controller(
      () => Promise.resolve({ ok: true, value: { status: 'no-baseline', cwd: '/ws' } }),
      () => Promise.resolve({ ok: true, value: { status: 'ready', content: RULES } }),
    )
    await tick()
    await c.loadRules()
    // The old early-return left rules undefined here — every area body then
    // spun at statusLoading forever. The settle degrades both viewers instead.
    expect(c.face().hooks.standards.getSnapshot().rules).toEqual({ status: 'unavailable', reason: 'no-baseline' })
    expect(remote.bafStandardConfig.rulesDoc).not.toHaveBeenCalled()
  })

  it('still fetches while the summary is loading (summary undefined falls through)', async () => {
    const { c, remote } = controller(
      () => new Promise(() => {}),
      () => Promise.resolve({ ok: true, value: { status: 'ready', path: '/ws/.baf/standards/default-rules.md', content: RULES } }),
    )
    await tick()
    await c.loadRules()
    expect(remote.bafStandardConfig.rulesDoc).toHaveBeenCalledTimes(1)
    expect(c.face().hooks.standards.getSnapshot().rules).toEqual({
      status: 'ready', path: '/ws/.baf/standards/default-rules.md', content: RULES,
    })
  })
})

describe('StandardsQualityOverview · gate mechanism + baseline stack card', () => {
  it('always shows the product-fixed mechanism card — even without a baseline (2026-10-13 问题 4 批)', () => {
    const { props } = harness(notReadyState('no-baseline', { status: 'no-baseline' }))
    render(<StandardsQualityOverview {...props} />)
    expect(screen.getByTestId('baf-standard-quality-mechanism').textContent).toContain('qualityMechanismTitle')
    // The stack card (project parameters) stays baseline-gated.
    expect(screen.queryByTestId('baf-standard-card-quality')).toBeNull()
    expect(screen.getByTestId('baf-standard-empty').textContent).toContain('statusNoBaseline')
  })

  it('projects the stack card once the baseline is ready', () => {
    const { props } = harness(readyState())
    render(<StandardsQualityOverview {...props} />)
    expect(screen.getByTestId('baf-standard-quality-mechanism')).toBeDefined()
    // cards: [] in the fixture — the grid renders nothing without the card.
    expect(screen.queryByTestId('baf-standard-card-quality')).toBeNull()
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
    expect(store.getSnapshot().hooksDraft).toEqual({ implement: { exit: ['scripts/build.sh'] } })
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
    expect(store.getSnapshot().hooksDraft).toEqual({ implement: { exit: ['scripts/build.sh'] } })
    expect(editor.textContent).toContain('protectedDuplicate')
    // Edit in place: the only entry row's 编辑 swaps in an InlineEditor.
    fireEvent.click(withinRow('baf-standard-hooks-editor', 'editLabel'))
    const inline = screen.getByLabelText('hooksEditLabel')
    fireEvent.change(inline, { target: { value: 'scripts/lint.ps1' } })
    fireEvent.keyDown(inline, { key: 'Enter' })
    expect(store.getSnapshot().hooksDraft).toEqual({ implement: { exit: ['scripts/lint.ps1'] } })
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
    expect(store.getSnapshot().hooksDraft).toEqual({ verify: { enter: ['e.mjs'] } })
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

  it('opens an existing entry with the default app and cancels a dirty draft (批次三 4.4)', async () => {
    const openPath = vi.fn()
    const summary = readySummary({ nodeHooks: { implement: { exit: ['scripts/build.sh'] } } })
    const { props, store } = harness(
      readyState({ summary, hooksDraft: { implement: { exit: ['scripts/build.sh'] } } }),
      { openPath },
    )
    render(<StandardsProjectOverview {...props} />)
    // The populated draft selects 实现 into the editor; the entry itself is
    // the click target with the absolute path as its hover title.
    const entry = [...screen.getByTestId('baf-standard-hooks-editor').querySelectorAll('button')]
      .find(button => button.textContent === 'scripts/build.sh') as HTMLElement
    expect(entry.getAttribute('title')).toBe('/ws/scripts/build.sh')
    fireEvent.click(entry)
    expect(openPath).toHaveBeenCalledWith('/ws/scripts/build.sh')
    // Dirty the draft, then 取消 drops it back to the persisted map.
    fireEvent.click(withinRow('baf-standard-hooks-editor', 'deleteLabel'))
    expect(store.getSnapshot().hooksDraft).toEqual({})
    const cancel = screen.getByTestId('baf-standard-hooks-cancel') as HTMLButtonElement
    expect(cancel.disabled).toBe(false)
    fireEvent.click(cancel)
    expect(store.getSnapshot().hooksDraft).toEqual({ implement: { exit: ['scripts/build.sh'] } })
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
        value: readySummary({ nodeHooks: { implement: { exit: ['scripts/build.sh'] } } }),
      }),
    })
    const c = new StandardsController(seeded.ctx as never)
    await tick()
    expect(c.face().hooks.standards.getSnapshot().hooksDraft)
      .toEqual({ implement: { exit: ['scripts/build.sh'] } })
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
    c.updateHooksDraft({ verify: { enter: ['v.mjs'] } })
    await c.saveNodeHooks()
    expect(remote.bafStandardConfig.saveNodeHooks).toHaveBeenCalledWith({ verify: { enter: ['v.mjs'] } })
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
      c2.updateHooksDraft({ open: { enter: ['a.sh'] } })
      await c2.saveNodeHooks()
      expect(c2.face().hooks.standards.getSnapshot().hooksNotice).toBe(expected)
      c2.clearHooksNotice()
      expect(c2.face().hooks.standards.getSnapshot().hooksNotice).toBeUndefined()
    }
    const thrown = hooksControllerCtx({ saveHooks: () => Promise.reject(new Error('rpc down')) })
    const c3 = new StandardsController(thrown.ctx as never)
    await tick()
    c3.updateHooksDraft({ open: { enter: ['a.sh'] } })
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
      value: readySummary({ nodeHooks: { implement: { exit: ['scripts/build.sh'] } } }),
    }))
    const c = new StandardsController(ctx as never)
    await tick()
    c.updateHooksDraft({ implement: { exit: ['scripts/build.sh', 'scripts/lint.ps1'] } })
    c.refreshIfClean()
    await tick()
    expect(remote.bafStandardConfig.summary).toHaveBeenCalledTimes(1)
    expect(c.face().hooks.standards.getSnapshot().hooksDraft)
      .toEqual({ implement: { exit: ['scripts/build.sh', 'scripts/lint.ps1'] } })
  })

  it('preserves a draft that went dirty during a reload roundtrip', async () => {
    type Release = (value: { ok: true; value: BafStandardSummaryResult }) => void
    let release: Release | undefined
    const { ctx } = ctxWith(() => new Promise((resolve) => { release = resolve }))
    const c = new StandardsController(ctx as never)
    await tick()
    // The user starts editing while the (clean-started) refresh is in flight…
    c.updateHooksDraft({ verify: { enter: ['e.mjs'] } })
    release?.({ ok: true, value: readySummary({ nodeHooks: {} }) })
    await tick()
    const state = c.face().hooks.standards.getSnapshot()
    expect(state.hooksDraft).toEqual({ verify: { enter: ['e.mjs'] } })
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
