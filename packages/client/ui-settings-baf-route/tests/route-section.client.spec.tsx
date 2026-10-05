// @vitest-environment jsdom
/**
 * 多模型路由 M3 批次B — the settings row controller + component.
 *
 * 【变更】2026-10-05 (auto 批): the role cards carry model + PROVIDER + effort
 * pickers (provider alone, model kept; effort from the selected model's
 * reasoning ladder), out-of-catalog models show a 未在目录 chip, duplicate
 * catalog names disambiguate with a provider suffix, the preset packs render
 * as clickable keyword TAGS grouped by role (引用 adds one word to the user's
 * own rules), the user's rules are tags with inline edit/delete, 预演 reads
 * the unsaved DRAFT and can simulate the M4 verify-retry floor, and the flow
 * canvas renders full-view compact.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'

afterEach(cleanup)
import { useSyncExternalStore } from 'react'
import type { RouteTierConfig } from '@deepseek-ai/dsh-baf-core'
import type { RouteTier } from '../src/types.ts'
import { apply } from '../src/client/index.ts'
import { ModelRoutingRow } from '../src/client/ModelRoutingRow.tsx'
import {
  RouteSectionController, type RouteSectionFace, type RouteSectionState,
} from '../src/client/route-store.ts'
import { KEYWORD_PRESET_IDS } from '../src/client/presets.ts'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { Context as ClientContext } from '@deepseek-ai/cordis'

// The Host materializes every phase node before sending `get` (the settings
// flow diagram renders all nine nodes) — the fixture mirrors that wire shape.
const CONFIG: RouteTierConfig = {
  schema: 1,
  enabled: true,
  tiers: {
    high: { provider: 'p', model: 'big', reasoningEffort: 'high' },
    mid: { provider: 'p', model: 'mid' },
    low: { provider: 'q', model: 'cheap' },
  },
  phaseTier: {
    design: 'high', plan: 'high', clarify: 'mid', verify: 'mid', implement: 'low',
    intake: 'low', open: 'low', archive: 'low', drift: 'low',
  },
  keywords: [{ words: '架构|refactor', tier: 'high' }],
  escalateOnly: true,
}

/** What the Host's `defaults()` Remote hands a fresh draft (presets included, 2.4). */
const PHASE_DEFAULTS: Record<string, RouteTier> = {
  design: 'high', plan: 'high', clarify: 'mid', verify: 'mid',
  implement: 'low', intake: 'low', open: 'low', archive: 'low', drift: 'low',
}

const BUILTIN_PRESETS: readonly { id: string; tier: RouteTier; words: string }[] = [
  { id: 'complexEngineering', tier: 'high', words: '架构|重构|refactor' },
  { id: 'criticalRelease', tier: 'high', words: '上线|发布|breaking' },
  { id: 'qualityAssurance', tier: 'mid', words: '单元测试|review|debug' },
  { id: 'routineEdits', tier: 'low', words: '文案|README|typo' },
]

function t(key: string): string {
  return key
}

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

/** A minimal `remote.bafRouteConfig` + `remote.session` context for the controller. */
function fakeCtx(overrides: {
  get?: () => Promise<{ ok: true; value: RouteTierConfig | null }>
  save?: (config: RouteTierConfig) => Promise<{ ok: true; value: { ok: boolean; error?: string } }>
  preview?: (
    summary: string,
    draft?: RouteTierConfig,
    options?: { verifyRetry?: boolean },
  ) => Promise<{ ok: true; value: { tier: RouteTier | null; matched?: string; escalated?: boolean } }>
  defaults?: () => Promise<{ ok: true; value: { phaseTier: Record<string, RouteTier>; presets: typeof BUILTIN_PRESETS } }>
  catalog?: () => Promise<{ ok: true; value: { default: { provider: string; model: string } } }>
} = {}) {
  const ctx = {
    remote: {
      bafRouteConfig: {
        get: overrides.get ?? (async () => ({ ok: true, value: CONFIG }) as const),
        save: overrides.save ?? (async () => ({ ok: true, value: { ok: true } }) as const),
        reset: async () => ({ ok: true, value: undefined }) as const,
        preview: overrides.preview ?? (async () => ({ ok: true, value: { tier: null } }) as const),
        defaults: overrides.defaults
          ?? (async () => ({ ok: true, value: { phaseTier: PHASE_DEFAULTS, presets: BUILTIN_PRESETS } }) as const),
      },
      session: {
        modelCatalog: overrides.catalog
          ?? (async () => ({
            ok: true,
            value: { default: { provider: 'p', model: 'm' }, routableProviders: [], groups: [], failures: [] },
          }) as const),
      },
      $on: () => () => undefined,
    },
  }
  return ctx as unknown as ClientContext
}

/** Bind a real snapshot store into the selector hook shape the component reads. */
function useStore<T>(store: SnapshotStore<T>): <S>(sel: (s: T) => S) => S {
  return sel => useSyncExternalStore(
    store.subscribe,
    () => sel(store.getSnapshot()),
  )
}

function harness(state: RouteSectionState) {
  const store = createSnapshotStore<RouteSectionState>(state)
  const face: RouteSectionFace = {
    hooks: { routeSection: store },
    setEnabled: vi.fn(),
    setTierModel: vi.fn(),
    setTierProvider: vi.fn(),
    setTierEffort: vi.fn(),
    setPhaseTier: vi.fn(),
    addKeyword: vi.fn(),
    removeKeyword: vi.fn(),
    updateKeyword: vi.fn(),
    setEscalateOnly: vi.fn(),
    save: vi.fn(),
    reset: vi.fn(),
    runPreview: vi.fn(),
  }
  const { hooks, ...actions } = face
  const props = {
    ...kit,
    ...actions,
    t: t as never,
    useRouteSection: useStore(hooks.routeSection),
  }
  return { store, face, props }
}

const READY: RouteSectionState = {
  status: 'ready',
  draft: CONFIG,
  dirty: false,
  saving: false,
  error: undefined,
  preview: undefined,
  // auto 批: pickers offer every catalog model by NAME (with its reasoning
  // ladder for the effort menu); the auto pseudo group never reaches them.
  catalog: {
    models: [
      {
        id: 'big', name: 'Big Brain', provider: 'p', label: 'Big Brain',
        reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'max', name: 'Max' }], defaultEffort: 'high' },
      },
      { id: 'mid', name: 'Middle', provider: 'p', label: 'Middle' },
      { id: 'cheap', name: 'Cheap', provider: 'q', label: 'Cheap' },
    ],
  },
  presets: BUILTIN_PRESETS,
}

describe('RouteSectionController', () => {
  it('loads the saved config and marks edits dirty without mutating the saved baseline', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    expect(store.getSnapshot().draft).toEqual(CONFIG)
    expect(store.getSnapshot().dirty).toBe(false)

    controller.setTierModel('high', { model: 'bigger' })
    expect(store.getSnapshot().dirty).toBe(true)
    expect(store.getSnapshot().draft?.tiers.high.model).toBe('bigger')
    expect(store.getSnapshot().draft?.tiers.high.provider).toBe('p')
  })

  it('setTierProvider re-points the provider alone (model and effort kept)', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.setTierProvider('high', 'q')
    expect(store.getSnapshot().draft?.tiers.high).toEqual({
      provider: 'q', model: 'big', reasoningEffort: 'high',
    })
    expect(store.getSnapshot().dirty).toBe(true)
  })

  it('setTierEffort sets and clears the tier effort', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.setTierEffort('mid', 'max')
    expect(store.getSnapshot().draft?.tiers.mid).toEqual({ provider: 'p', model: 'mid', reasoningEffort: 'max' })
    controller.setTierEffort('mid', undefined)
    expect(store.getSnapshot().draft?.tiers.mid).toEqual({ provider: 'p', model: 'mid' })
  })

  it('updateKeyword replaces one rule in place', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.updateKeyword(0, { words: '重构|refactor', tier: 'mid' })
    expect(store.getSnapshot().draft?.keywords).toEqual([{ words: '重构|refactor', tier: 'mid' }])
  })

  it('seeds a fresh disabled draft from the model catalog default when no config exists', async () => {
    const controller = new RouteSectionController(fakeCtx({
      get: async () => ({ ok: true, value: null }) as const,
    }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    const draft = store.getSnapshot().draft
    expect(draft?.enabled).toBe(false)
    expect(draft?.tiers.high).toEqual({ provider: 'p', model: 'm' })
    // The phase rows seed from the Host's built-in default map, not a copy.
    expect(draft?.phaseTier?.design).toBe('high')
    expect(draft?.keywords).toEqual([])
  })

  it('captures the builtin preset packs the Host hands with the defaults (2.4)', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    expect(store.getSnapshot().presets).toEqual(BUILTIN_PRESETS)
  })

  it('save() persists the draft and folds the host verdict into error/dirty', async () => {
    const save = vi.fn(async (_config: RouteTierConfig): Promise<{ ok: true; value: { ok: boolean; error?: string } }> =>
      ({ ok: true, value: { ok: false, error: 'bad tiers' } }))
    const controller = new RouteSectionController(fakeCtx({ save }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    await controller.save()
    expect(save).toHaveBeenCalledWith(CONFIG)
    expect(store.getSnapshot().error).toBe('bad tiers')
    expect(store.getSnapshot().dirty).toBe(true)

    save.mockResolvedValue({ ok: true, value: { ok: true } } as const)
    await controller.save()
    expect(store.getSnapshot().error).toBeUndefined()
    expect(store.getSnapshot().dirty).toBe(false)
  })

  it('reset() returns to a fresh draft', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    await controller.reset()
    expect(store.getSnapshot().draft?.enabled).toBe(false)
    expect(store.getSnapshot().dirty).toBe(false)
  })

  it('distills the catalog: auto group dropped, reasoning carried, dup names suffixed', async () => {
    const controller = new RouteSectionController(fakeCtx({
      catalog: async () => ({
        ok: true,
        value: {
          default: { provider: 'p', model: 'm' },
          routableProviders: [],
          groups: [
            {
              id: 'baf-route', name: '多模型路由',
              models: [{ id: 'auto', name: 'Auto' }],
            },
            {
              id: 'p', name: 'P',
              models: [
                { id: 'm1', name: 'Same', reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' } },
                { id: 'm2', name: 'Same' },
              ],
            },
            { id: 'q', name: 'Q', models: [{ id: 'cheap', name: 'C' }] },
          ],
          failures: [],
        },
      }) as const,
    }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    expect(store.getSnapshot().catalog).toEqual({
      models: [
        {
          id: 'm1', name: 'Same', provider: 'p', label: 'Same · p',
          reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' },
        },
        { id: 'm2', name: 'Same', provider: 'p', label: 'Same · p' },
        { id: 'cheap', name: 'C', provider: 'q', label: 'C' },
      ],
    })
  })

  it('materializes phase nodes the saved file omits from the host default map', async () => {
    const controller = new RouteSectionController(fakeCtx({
      // A hand-edited / legacy file that pins only two nodes.
      get: async () => ({
        ok: true,
        value: { ...CONFIG, phaseTier: { design: 'high' } },
      }) as const,
    }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    // The user's override survives; every other node fills from defaults().
    const phaseTier = store.getSnapshot().draft?.phaseTier
    expect(phaseTier?.design).toBe('high')
    expect(phaseTier?.verify).toBe('mid')
    expect(phaseTier?.implement).toBe('low')
    expect(phaseTier?.drift).toBe('low')
  })

  it('runPreview() sends the unsaved DRAFT and the verifyRetry switch (未保存改动即时预演)', async () => {
    const preview = vi.fn(async () => ({ ok: true, value: { tier: 'high', matched: '架构' } }) as const)
    const controller = new RouteSectionController(fakeCtx({ preview }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.setTierModel('high', { model: 'bigger' })
    await controller.runPreview('梳理整体架构')
    expect(preview).toHaveBeenLastCalledWith('梳理整体架构', store.getSnapshot().draft, undefined)
    await controller.runPreview('梳理整体架构', { verifyRetry: true })
    expect(preview).toHaveBeenLastCalledWith('梳理整体架构', store.getSnapshot().draft, { verifyRetry: true })
    expect(store.getSnapshot().preview).toEqual({ tier: 'high', matched: '架构' })
  })

  it('reports a failed load as status failed', async () => {
    const controller = new RouteSectionController(fakeCtx({
      get: async () => ({ ok: false, error: { code: 'internal', message: 'down' } }) as never,
    }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('failed') })
  })
})

describe('ModelRoutingRow', () => {
  it('renders three role cards whose pickers show catalog model NAMES, not ids', () => {
    const { props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    expect(screen.getByRole('switch', { name: 'master' })).toBeTruthy()
    // One model picker per tier card; the anchor reads the model's display name.
    expect(within(screen.getByTestId('route-tier-high')).getByRole('button', { name: 'Big Brain' })).toBeTruthy()
    expect(within(screen.getByTestId('route-tier-mid')).getByRole('button', { name: 'Middle' })).toBeTruthy()
    expect(within(screen.getByTestId('route-tier-low')).getByRole('button', { name: 'Cheap' })).toBeTruthy()
    // Provider rides its own picker (configurable independently, point 1).
    expect(within(screen.getByTestId('route-tier-high')).getByRole('button', { name: /provider/ })).toBeTruthy()
    // No free-text provider/model comboboxes remain — picking is menu-only.
    expect(within(screen.getByTestId('route-tier-high')).queryByRole('combobox')).toBeNull()
    // The keyword rule shows as a TAG now (editable), not a disabled input.
    expect(screen.queryByDisplayValue('架构|refactor')).toBeNull()
    expect(screen.getByTestId('route-keyword-tag').textContent).toContain('架构|refactor')
  })

  it('offers every catalog model in the picker; a pick sets provider AND model', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    fireEvent.click(within(screen.getByTestId('route-tier-high')).getByRole('button', { name: 'Big Brain' }))
    // The generic dropdown lists all three catalog models by name.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cheap' }))
    // Selecting derives the provider from the catalog group the model lives in.
    expect(face.setTierModel).toHaveBeenCalledWith('high', { provider: 'q', model: 'cheap' })
  })

  it('re-points the provider alone from the provider menu (point 1)', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    const card = screen.getByTestId('route-tier-high')
    fireEvent.click(within(card).getByRole('button', { name: /provider/ }))
    // Providers offered: every catalog provider, plus the configured one.
    fireEvent.click(screen.getByRole('menuitem', { name: 'q' }))
    expect(face.setTierProvider).toHaveBeenCalledWith('high', 'q')
  })

  it('edits the tier effort from the selected model\'s ladder; 默认 clears it', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    const card = screen.getByTestId('route-tier-high')
    // The fixture high tier runs big (reasoning ladder High/Max) at effort high.
    fireEvent.click(within(card).getByRole('button', { name: /effortLabel/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Max' }))
    expect(face.setTierEffort).toHaveBeenCalledWith('high', 'max')
    // 默认 maps to undefined (follow the model default).
    fireEvent.click(within(card).getByRole('button', { name: /effortLabel/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'effortDefault' }))
    expect(face.setTierEffort).toHaveBeenCalledWith('high', undefined)
  })

  it('hides the effort menu when the selected model has no reasoning ladder', () => {
    const { props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    // mid runs Middle (no reasoning in the fixture) — no effort picker.
    expect(within(screen.getByTestId('route-tier-mid')).queryByRole('button', { name: /effortLabel/ })).toBeNull()
  })

  it('shows a 未在目录 chip and the raw model id when the model left the catalog', () => {
    const { props } = harness({
      ...READY,
      draft: { ...CONFIG, tiers: { ...CONFIG.tiers, low: { provider: 'q', model: 'ghost' } } },
    })
    render(<ModelRoutingRow {...props} />)
    const card = screen.getByTestId('route-tier-low')
    expect(within(card).getByRole('button', { name: 'ghost' })).toBeTruthy()
    expect(within(card).getByTestId('route-not-in-catalog').textContent).toContain('notInCatalog')
    // A catalog model shows no chip.
    expect(within(screen.getByTestId('route-tier-high')).queryByTestId('route-not-in-catalog')).toBeNull()
  })

  it('disambiguates duplicate catalog names with a provider suffix (点选仍按各自 id/provider 落值)', () => {
    const { face, props } = harness({
      ...READY,
      catalog: {
        models: [
          { id: 'm1', name: 'Same', provider: 'p', label: 'Same · p' },
          { id: 'm2', name: 'Same', provider: 'q', label: 'Same · q' },
          { id: 'big', name: 'Big Brain', provider: 'p', label: 'Big Brain' },
        ],
      },
    })
    render(<ModelRoutingRow {...props} />)
    fireEvent.click(within(screen.getByTestId('route-tier-high')).getByRole('button', { name: 'Big Brain' }))
    expect(screen.getByRole('menuitem', { name: 'Same · p' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Same · q' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Same · q' }))
    expect(face.setTierModel).toHaveBeenCalledWith('high', { provider: 'q', model: 'm2' })
  })

  it('puts save/reset at the top, above the tier cards (2.1)', () => {
    const { props } = harness({ ...READY, dirty: true })
    render(<ModelRoutingRow {...props} />)
    const actions = screen.getByTestId('route-actions')
    expect(actions.textContent).toContain('save')
    expect(actions.textContent).toContain('reset')
    expect(actions.textContent).toContain('dirty')
    const saveButton = within(actions).getByRole('button', { name: 'save' })
    const card = screen.getByTestId('route-tier-high')
    // The toolbar precedes the first tier card in document order.
    expect(saveButton.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws the phase→tier flow compactly and fully visible, nodes in workflow order', () => {
    const { props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    // Workflow execution order — intake first, archive last, drift as the
    // loop-back tail — not the declaration order of the tier vocabulary.
    const nodes = screen.getAllByTestId('route-phase-row')
    const names = nodes.map(node => node.textContent ?? '')
    expect(names[0]).toContain('phaseIntake')
    expect(names[2]).toContain('phaseClarify')
    expect(names[3]).toContain('phaseDesign')
    expect(names[5]).toContain('phaseImplement')
    expect(names[7]).toContain('phaseArchive')
    expect(names[8] ?? '').toContain('phaseDrift')
    // Each node answers「谁在服务」: the mapped tier's model rides the node.
    expect(names[0]).toContain('cheap')
    expect(names[3] ?? '').toContain('big')
    expect(names[6] ?? '').toContain('mid')
    // Session-tab-style canvas: bezier edges with an arrowhead marker, and
    // the full chain visible without an inner scroll viewport.
    const flow = screen.getByTestId('route-flow')
    expect(flow.querySelectorAll('path').length).toBeGreaterThanOrEqual(9)
    expect(flow.querySelector('marker') !== null).toBe(true)
    const canvas = flow.parentElement
    expect(canvas instanceof HTMLElement && canvas.style.maxHeight !== '').toBe(false)
    expect(canvas?.className).not.toContain('flowScroll')
  })

  it('cycles a node\'s tier on click (worker→reviewer→commander→worker)', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    const nodes = screen.getAllByTestId('route-phase-row')
    // implement maps to low in the fixture; one click lifts it to mid.
    fireEvent.click(nodes[5]!)
    expect(face.setPhaseTier).toHaveBeenCalledWith('implement', 'mid')
    // design is high; cycling wraps back to low.
    fireEvent.click(nodes[3]!)
    expect(face.setPhaseTier).toHaveBeenCalledWith('design', 'low')
  })

  it('shows the builtin packs as role-grouped keyword tags, every word fully visible', () => {
    const { props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    const tags = screen.getAllByTestId('route-preset-tag')
    // Every word of every pack renders as its own tag (3 per fixture pack).
    expect(tags).toHaveLength(12)
    expect(tags.map(tag => tag.textContent)).toContain('架构')
    expect(tags.map(tag => tag.textContent)).toContain('README')
    // Role-grouped: the first tier group hosts the two high packs.
    const tierGroups = screen.getAllByTestId('route-preset-tier')
    expect(tierGroups[0]?.textContent).toContain('presetComplexEngineering')
    expect(tierGroups[0]?.textContent).toContain('presetCriticalRelease')
    expect(tierGroups[0]?.textContent).toContain('tierHigh')
  })

  it('clicking a preset tag 引用 it into the user\'s rules once (deduped)', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    // The fixture draft already owns 架构|refactor at high — the 架构 tag is a
    // dup and must not fire; 重构 is new and lands as a single-word rule.
    fireEvent.click(screen.getAllByTestId('route-preset-tag').find(tag => tag.textContent === '架构')!)
    expect(face.addKeyword).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByTestId('route-preset-tag').find(tag => tag.textContent === '重构')!)
    expect(face.addKeyword).toHaveBeenCalledWith({ words: '重构', tier: 'high' })
  })

  it('user keyword tags edit inline and delete', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    const tag = screen.getByTestId('route-keyword-tag')
    // Delete straight from the tag.
    fireEvent.click(within(tag).getByTestId('route-keyword-remove'))
    expect(face.removeKeyword).toHaveBeenCalledWith(0)
    // Edit pops an inline row; save commits through updateKeyword.
    fireEvent.click(within(screen.getByTestId('route-keyword-tag')).getByTestId('route-keyword-edit-btn'))
    const input = screen.getByTestId('route-keyword-edit-input')
    fireEvent.change(input, { target: { value: '重构|refactor' } })
    fireEvent.click(screen.getByTestId('route-keyword-save'))
    expect(face.updateKeyword).toHaveBeenCalledWith(0, { words: '重构|refactor', tier: 'high' })
  })

  it('forwards the master switch to the face', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    fireEvent.click(screen.getByRole('switch', { name: 'master' }))
    expect(face.setEnabled).toHaveBeenCalledWith(false)
  })

  it('shows the preview verdict, escalated flag, and passes the verify switch', () => {
    const { props } = harness({
      ...READY,
      dirty: true,
      error: 'bad tiers',
      preview: { tier: 'mid', matched: 'readme', escalated: true },
    })
    render(<ModelRoutingRow {...props} />)
    expect(screen.getByTestId('route-preview').textContent).toContain('readme')
    expect(screen.getByTestId('route-preview').textContent).toContain('previewEscalated')
    expect(screen.getByTestId('route-error').textContent).toContain('bad tiers')
    fireEvent.change(screen.getByTestId('route-preview-input'), { target: { value: '重构模块' } })
    fireEvent.click(screen.getByTestId('route-preview-run'))
    expect(props.runPreview).toHaveBeenCalledWith('重构模块', { verifyRetry: false })
    // Flip the verify simulation and run again.
    fireEvent.click(screen.getByTestId('route-preview-verify'))
    fireEvent.click(screen.getByTestId('route-preview-run'))
    expect(props.runPreview).toHaveBeenLastCalledWith('重构模块', { verifyRetry: true })
  })

  it('still lists every preset id the locale knows (display-name coverage)', () => {
    // The Host owns the packs; the client only carries their ids for naming.
    expect(KEYWORD_PRESET_IDS).toEqual(['complexEngineering', 'criticalRelease', 'qualityAssurance', 'routineEdits'])
  })
})

describe('apply (settings section registration)', () => {
  it('registers 多模型路由 as its own settings section, not a 工作流 row', () => {
    const injected: string[] = []
    const registered: Array<Record<string, unknown>> = []
    const ctx = {
      ...fakeCtx(),
      effect: (fn: () => void) => { fn(); return () => undefined },
      locale: {
        register: vi.fn(),
        bind: () => (key: string) => key,
      },
      slots: {
        inject: (name: string, install: () => void) => { injected.push(name); install() },
        register: (options: Record<string, unknown>) => { registered.push(options) },
      },
    }
    apply(ctx as unknown as ClientContext)

    expect(injected).toEqual(['settings.section'])
    const section = registered.find(options => options.name === 'settings.section')
    expect(section).toMatchObject({ id: 'model-routing', order: 21 })
    expect((section?.label as () => string)()).toBe('nav')
  })
})
