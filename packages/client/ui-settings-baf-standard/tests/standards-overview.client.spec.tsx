// @vitest-environment jsdom
/**
 * BAF 工程规范 settings panels — stage-grouped enterprise rules and domain slicing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

afterEach(cleanup)
import { useSyncExternalStore } from 'react'
import {
  StandardsEnterpriseOverview, StandardsProjectOverview, StandardsQualityOverview, sliceAreaContent,
} from '../src/client/StandardsOverview.tsx'
import {
  StandardsController, type StandardsOverviewFace, type StandardsOverviewState,
} from '../src/client/standards-store.ts'
import type { BafStandardSummaryResult } from '../src/types.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

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

/** A ready summary carrying all 8 areas with anchored sourceRefs. */
function readySummary(): BafStandardSummaryResult {
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
  }
}

function harness(initial: StandardsOverviewState) {
  const store = createSnapshotStore<StandardsOverviewState>(initial)
  const face: StandardsOverviewFace = {
    hooks: { standards: store },
    reload: vi.fn(),
    loadRules: vi.fn(),
    toggleRules: vi.fn(),
    toggleArea: (id: string) => {
      store.update((state) => {
        state.areasExpanded[id] = !state.areasExpanded[id]
      })
    },
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
    ...overrides,
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

describe('StandardsProjectOverview · baseline archive header card', () => {
  it('leads the grid with the git-managed baseline id / compatibility / path (4.3)', () => {
    const { props } = harness(readyState())
    render(<StandardsProjectOverview {...props} />)
    const card = screen.getByTestId('baf-standard-card-baseline')
    expect(card.textContent).toContain('b1')
    expect(card.textContent).toContain('0.0.0 ~ 9.9.9')
    expect(card.textContent).toContain('/ws/.baf/baseline.yml')
    expect(card.textContent).toContain('cardTitleBaseline')
    // The archive card precedes the always-present scaffold card in document order.
    const scaffoldCard = screen.getByTestId('baf-standard-card-scaffold')
    expect(card.compareDocumentPosition(scaffoldCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders no archive card before the summary is ready', () => {
    const { props } = harness({
      status: 'no-baseline',
      summary: { status: 'no-baseline' },
      rules: undefined,
      rulesExpanded: false,
      areasExpanded: {},
    })
    render(<StandardsProjectOverview {...props} />)
    expect(screen.queryByTestId('baf-standard-card-baseline')).toBeNull()
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
    const { props } = harness({
      status: 'no-baseline',
      summary: { status: 'no-baseline' },
      rules: undefined,
      rulesExpanded: false,
      areasExpanded: {},
    })
    render(<StandardsEnterpriseOverview {...props} />)
    // The product-constant structure is always there…
    expect(screen.getByTestId('baf-standard-areas')).toBeDefined()
    expect(screen.getByTestId('baf-standard-stage-stage.intake')).toBeDefined()
    expect(screen.getByTestId('baf-standard-area-project-charter')).toBeDefined()
    // …the guidance banner explains what is missing…
    expect(screen.getByTestId('baf-standard-empty').textContent).toContain('statusNoBaseline')
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
    const { props } = harness({
      status: 'no-baseline',
      summary: { status: 'no-baseline' },
      rules: undefined,
      rulesExpanded: false,
      areasExpanded: {},
    })
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
