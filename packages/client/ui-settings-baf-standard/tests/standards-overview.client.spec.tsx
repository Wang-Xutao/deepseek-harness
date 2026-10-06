// @vitest-environment jsdom
/**
 * 【变更】2026-10-07 (九点批 问题 8): the BAF 工程规范 overview's 8-domain
 * digest + provenance chain — one row per rule area (localized title, one-line
 * jurisdiction, anchored sourceRef), expanding slices the domain's rules out
 * of the loaded rules document; the 从何而来 chain renders four steps plus
 * the living-document note.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'

afterEach(cleanup)
import { useSyncExternalStore } from 'react'
import { StandardsOverview, sliceAreaContent } from '../src/client/StandardsOverview.tsx'
import type {
  StandardsOverviewFace, StandardsOverviewState,
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

describe('sliceAreaContent (anchor slicing, 九点批 问题 8)', () => {
  it('slices from the anchored heading (Chinese tail tolerated) to the next ## heading', () => {
    const section = sliceAreaContent(RULES, 'coding-style')
    expect(section).toContain('## coding-style 编码风格')
    expect(section).toContain('风格规则行')
    // The NEXT domain's rules never bleed into this slice.
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

  it('matches the anchor as a whole heading word, never as a prefix of another', () => {
    const doc = '## logging-general 别的域\n- x\n\n## logging 日志\n- y\n'
    expect(sliceAreaContent(doc, 'logging')).toContain('- y')
    expect(sliceAreaContent(doc, 'logging')).not.toContain('别的域')
  })
})

describe('StandardsOverview · 8-domain digest + provenance chain', () => {
  it('renders one row per rule area in catalog order, title + jurisdiction + anchor', () => {
    const { props } = harness(readyState())
    render(<StandardsOverview {...props} />)
    const areas = screen.getByTestId('baf-standard-areas')
    const rows = within(areas).getAllByTestId(/^baf-standard-area-((?!toggle)(?!body)(?!missing).+)$/)
    expect(rows.map(row => row.getAttribute('data-testid'))).toEqual(
      AREA_IDS.map(id => `baf-standard-area-${id}`),
    )
    // Localized title (t = identity), the anchored pointer, and the section
    // header copy all ride each row / the block.
    expect(within(rows[0]!).getByText('area.project-charter')).toBeTruthy()
    expect(within(rows[0]!).getByText('areaDesc.project-charter')).toBeTruthy()
    expect(rows[7]!.textContent).toContain('.baf/standards/default-rules.md#testing-discipline')
    expect(areas.textContent).toContain('areasTitle')
    expect(areas.textContent).toContain('areasHint')
  })

  it('expands a domain into its sliced rules; collapsing hides them again', () => {
    const { props } = harness(readyState())
    render(<StandardsOverview {...props} />)
    expect(screen.queryByTestId('baf-standard-area-body-coding-style')).toBeNull()
    fireEvent.click(screen.getByTestId('baf-standard-area-toggle-coding-style'))
    const body = screen.getByTestId('baf-standard-area-body-coding-style')
    expect(body.textContent).toContain('风格规则行')
    expect(body.textContent).not.toContain('章程规则行')
    fireEvent.click(screen.getByTestId('baf-standard-area-toggle-coding-style'))
    expect(screen.queryByTestId('baf-standard-area-body-coding-style')).toBeNull()
  })

  it('shows the pointer-only fallback when the rules document is not readable', () => {
    const { props } = harness(readyState({ rules: undefined }))
    render(<StandardsOverview {...props} />)
    fireEvent.click(screen.getByTestId('baf-standard-area-toggle-logging'))
    const missing = screen.getByTestId('baf-standard-area-missing-logging')
    expect(missing.textContent).toContain('areaNoContent')
    // The title and the anchor pointer still render — the domain is visible
    // even when its content is not.
    expect(screen.getByTestId('baf-standard-area-logging').textContent).toContain('.baf/standards/default-rules.md#logging')
  })

  it('renders the four-step provenance chain plus the living-document note', () => {
    const { props } = harness(readyState())
    render(<StandardsOverview {...props} />)
    const from = screen.getByTestId('baf-standard-from')
    expect(from.textContent).toContain('fromTitle')
    for (const step of ['1', '2', '3', '4']) {
      expect(within(from).getByText(new RegExp(`^fromStep${step}`))).toBeTruthy()
    }
    expect(from.textContent).toContain('fromLiving')
    // The chain rides BETWEEN the digest and the full-document viewer.
    const areas = screen.getByTestId('baf-standard-areas')
    const viewer = screen.getByTestId('baf-standard-rules')
    expect(areas.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(from.compareDocumentPosition(viewer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders no digest and no chain unless the summary is ready', () => {
    const { props } = harness({
      status: 'no-baseline',
      summary: { status: 'no-baseline' },
      rules: undefined,
      rulesExpanded: false,
      areasExpanded: {},
    })
    render(<StandardsOverview {...props} />)
    expect(screen.queryByTestId('baf-standard-areas')).toBeNull()
    expect(screen.queryByTestId('baf-standard-from')).toBeNull()
  })
})
