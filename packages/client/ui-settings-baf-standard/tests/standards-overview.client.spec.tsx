// @vitest-environment jsdom
/**
 * BAF 工程规范 overview row (问题 6 批, 2026-10-06): the read-only contract —
 * cards quote baseline paths, empty states point at /baf-scaffold, the rules
 * viewer expands/collapses, and nothing in the row can mutate state.
 */
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { StandardsOverview } from '../src/client/StandardsOverview.tsx'
import type { StandardsOverviewState } from '../src/client/standards-store.ts'
import type { BafStandardSummaryResult } from '../src/types.ts'

function t(key: string): string {
  return key
}

/** Global seat hooks the row never reads (PropsRuntime pulls them in via
 * GlobalStandardProps merging — see route-section.client.spec.tsx's kit). */
const unusedHook = (() => { throw new Error('unused') }) as never
const globals = {
  useResource: unusedHook,
  useSessions: unusedHook,
  useSessionPendingInteraction: unusedHook,
  useWorkspaces: unusedHook,
  usePanelInfo: unusedHook,
  useSessionStatus: unusedHook,
  useSessionRetainInfo: unusedHook,
  close: vi.fn(),
}

const READY_SUMMARY: BafStandardSummaryResult = {
  status: 'ready',
  cwd: 'D:/ws/demo',
  baselinePath: 'D:/ws/demo/.baf/baseline.yml',
  baselineId: 'spec-baseline',
  compatibility: { min: '0.0.0', max: '999.0.0' },
  standardSourceRef: '.baf/standards/default-rules.md',
  standardAvailability: 'ready',
  cards: [
    {
      id: 'workflow',
      fields: [
        { field: 'workflow.default', value: 'go', state: 'ok' },
        { field: 'workflow.requireOpenSpec', value: 'true', state: 'ok' },
      ],
    },
    {
      id: 'standard',
      fields: [
        { field: 'standard.mattPocockRulesRef', value: '<enterprise-tbd>', state: 'tbd' },
        { field: 'standard.availability', value: 'policy_missing', state: 'ok' },
      ],
    },
  ],
}

/** Bind a real snapshot store into the generic selector hook shape the row reads. */
function useStore<T>(store: SnapshotStore<T>): <S>(sel: (s: T) => S) => S {
  return sel => useSyncExternalStore(
    store.subscribe,
    () => sel(store.getSnapshot()),
  )
}

/** The row kit: a fixed snapshot behind the hook + the face's verbs as spies. */
function kitFor(state: StandardsOverviewState) {
  const reload = vi.fn(async () => {})
  const loadRules = vi.fn(async () => {})
  const toggleRules = vi.fn()
  const store = createSnapshotStore<StandardsOverviewState>(state)
  return {
    kit: {
      ...globals,
      useStandards: useStore(store),
      reload,
      loadRules,
      toggleRules,
      t: t as never,
    },
    reload, loadRules, toggleRules,
  }
}

afterEach(() => {
  cleanup()
})

describe('StandardsOverview (规范总览·只读)', () => {
  it('renders the six data cards + the static scaffold card with baseline paths', () => {
    // Full six-card fixture: the component maps every host card id.
    const summary: BafStandardSummaryResult = {
      ...READY_SUMMARY,
      cards: ['workflow', 'route', 'openspec', 'standard', 'quality', 'guard'].map(id => ({
        id: id as never,
        fields: [{ field: `${id}.sample`, value: 'v', state: 'ok' as const }],
      })),
    }
    const { kit } = kitFor({ status: 'ready', summary, rules: undefined, rulesExpanded: false })
    render(<StandardsOverview {...kit} />)
    expect(screen.getByTestId('baf-standard-overview')).toBeTruthy()
    expect(screen.getByTestId('baf-standard-meta').textContent).toContain('spec-baseline')
    for (const id of ['workflow', 'route', 'openspec', 'standard', 'quality', 'guard', 'scaffold']) {
      expect(screen.getByTestId(`baf-standard-card-${id}`)).toBeTruthy()
    }
  })

  it('quotes field rows with the 企业待定 chip and localized availability', () => {
    const { kit } = kitFor({ status: 'ready', summary: READY_SUMMARY, rules: undefined, rulesExpanded: false })
    render(<StandardsOverview {...kit} />)
    const requireOpenSpec = screen.getByTestId('baf-standard-field-workflow.requireOpenSpec')
    expect(requireOpenSpec.textContent).toContain('workflow.requireOpenSpec')
    expect(requireOpenSpec.textContent).toContain('true')
    const ref = screen.getByTestId('baf-standard-field-standard.mattPocockRulesRef')
    expect(ref.textContent).toContain('<enterprise-tbd>')
    expect(ref.textContent).toContain('stateTbd')
    // The availability VALUE is localized, never the raw enum.
    const availability = screen.getByTestId('baf-standard-field-standard.availability')
    expect(availability.textContent).toContain('stateAvailabilityMissing')
  })

  it('points the empty states at /baf-scaffold', () => {
    const { kit } = kitFor({ status: 'no-workspace', summary: undefined, rules: undefined, rulesExpanded: false })
    const { unmount } = render(<StandardsOverview {...kit} />)
    expect(screen.getByText('statusNoWorkspace')).toBeTruthy()
    unmount()

    const bare = kitFor({ status: 'no-baseline', summary: undefined, rules: undefined, rulesExpanded: false })
    render(<StandardsOverview {...bare.kit} />)
    expect(screen.getByText('statusNoBaseline')).toBeTruthy()
    expect(screen.queryByTestId('baf-standard-card-scaffold')).toBeNull()
  })

  it('expands the rules viewer on toggle and shows the document content', () => {
    const state: StandardsOverviewState = {
      status: 'ready',
      summary: READY_SUMMARY,
      rules: {
        status: 'ready',
        path: 'D:/ws/demo/.baf/standards/default-rules.md',
        content: '# BAF 工程规范\n\n## testing-discipline 测试纪律\n',
      },
      rulesExpanded: true,
    }
    const { kit, toggleRules } = kitFor(state)
    render(<StandardsOverview {...kit} />)
    const body = screen.getByTestId('baf-standard-rules-body')
    expect(body.textContent).toContain('testing-discipline')
    fireEvent.click(screen.getByTestId('baf-standard-rules-toggle'))
    expect(toggleRules).toHaveBeenCalledTimes(1)
  })

  it('renders the enterprise-TBD guidance when the rules doc is unavailable', () => {
    const state: StandardsOverviewState = {
      status: 'ready',
      summary: { ...READY_SUMMARY, standardAvailability: 'policy_missing' },
      rules: { status: 'unavailable', reason: 'policy_missing' },
      rulesExpanded: true,
    }
    const { kit } = kitFor(state)
    render(<StandardsOverview {...kit} />)
    expect(screen.getByTestId('baf-standard-rules-unavailable').textContent).toContain('rulesUnavailablePolicy')
    expect(screen.queryByTestId('baf-standard-rules-body')).toBeNull()
  })

  it('refresh re-reads the summary (and the document when open)', async () => {
    const open = kitFor({
      status: 'ready', summary: READY_SUMMARY,
      rules: { status: 'ready', path: 'p', content: 'c' }, rulesExpanded: true,
    })
    render(<StandardsOverview {...open.kit} />)
    fireEvent.click(screen.getByTestId('baf-standard-refresh'))
    expect(open.reload).toHaveBeenCalledTimes(1)
    expect(open.loadRules).toHaveBeenCalledTimes(1)
    cleanup()

    const closed = kitFor({ status: 'ready', summary: READY_SUMMARY, rules: undefined, rulesExpanded: false })
    render(<StandardsOverview {...closed.kit} />)
    fireEvent.click(screen.getByTestId('baf-standard-refresh'))
    expect(closed.reload).toHaveBeenCalledTimes(1)
    expect(closed.loadRules).not.toHaveBeenCalled()
  })
})
