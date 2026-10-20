// @vitest-environment jsdom
/**
 * 多模型路由 M3 批次B — the settings row controller + component.
 *
 * 【变更】2026-10-05 (UI 三块批): the page is THREE titled blocks (模型分级 /
 * 工作流模型绑定 / 关键词规则); the three roles render as ROWS in one
 * column, each row one-line provider → model → effort (the model menu lists
 * only the chosen provider's models); the flow block is titled 工作流模型
 * 绑定 with the click-hint directly under the title and a canvas whose node
 * rects never intersect (the 1.2 overlap bug); the builtin presets render
 * INSIDE 关键词规则 as read-only 预设-badged tags (role-grouped, pack-labeled)
 * — the 引用 click is gone, they are already rules; 预演 hot-reloads: draft
 * edits re-run the dry-run on a debounce while text is present.
 * 【变更】2026-10-06 (问题 5 批): 恢复默认 parks LEFT and 取消 joins 保存 at
 * the right end (4.1); a provider switch re-points the model to that
 * provider's first offering and load normalizes the draft, so 未在目录 is gone
 * (4.3); the TAG itself is the switch — user tags and preset words park on
 * click, no per-tag switch button (4.5) — and every group splits its tags
 * into 中文 / 英文 segments.
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
  // Fixture keeps three grades so existing Reviewer assertions stay meaningful.
  tierMode: 'three',
  tiers: {
    high: { provider: 'p', model: 'big', reasoningEffort: 'high' },
    mid: { provider: 'p', model: 'mid' },
    low: { provider: 'q', model: 'cheap' },
  },
  phaseTier: {
    design: 'high', plan: 'high', clarify: 'mid', verify: 'mid', implement: 'low',
    intake: 'low', open: 'low', archive: 'low', drift: 'low',
  },
  keywords: [{ words: '架构|refactor', tier: 'high', category: '复杂任务' }],
  escalateOnly: true,
}

/** What the Host's `defaults()` Remote hands a fresh draft (presets included, 2.4). */
const PHASE_DEFAULTS: Record<string, RouteTier> = {
  design: 'high', plan: 'high', clarify: 'low', verify: 'low',
  implement: 'low', intake: 'low', open: 'low', archive: 'low', drift: 'low',
}

const BUILTIN_PRESETS: readonly { id: string; tier: RouteTier; words: string }[] = [
  { id: 'complexEngineering', tier: 'high', words: '架构|重构|refactor' },
  { id: 'criticalRelease', tier: 'high', words: '上线|发布|breaking' },
  { id: 'qualityAssurance', tier: 'mid', words: '单元测试|review|debug' },
  { id: 'routineEdits', tier: 'low', words: '文案|README|typo' },
]

/**
 * 问题 5 (4.3): a catalog with real provider groups — the controller needs it
 * to re-point models on provider switches and to normalize loaded drafts.
 */
const groupedCatalog = async () => ({
  ok: true as const,
  value: {
    default: { provider: 'p', model: 'big' },
    routableProviders: [],
    groups: [
      { id: 'p', name: 'P', models: [{ id: 'big', name: 'Big Brain' }, { id: 'mid', name: 'Middle' }] },
      { id: 'q', name: 'Q', models: [{ id: 'cheap', name: 'Cheap' }] },
    ],
    failures: [],
  },
})

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
  defaults?: () => Promise<{
    ok: true
    value: { phaseTier: Record<string, RouteTier>; presets: typeof BUILTIN_PRESETS; tierMode: 'two' | 'three' }
  }>
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
          ?? (async () => ({
            ok: true,
            value: { phaseTier: PHASE_DEFAULTS, presets: BUILTIN_PRESETS, tierMode: 'two' as const },
          }) as const),
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
    setKeywordEnabled: vi.fn(),
    setCategoryEnabled: vi.fn(),
    setPackEnabled: vi.fn(),
    setPresetWordEnabled: vi.fn(),
    setEscalateOnly: vi.fn(),
    setTierMode: vi.fn(),
    save: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    runPreview: vi.fn(),
  }
  const { hooks, ...actions } = face
  const props = {
    ...kit,
    ...actions,
    t: t as never,
    useRouteSection: useStore(hooks.routeSection),
    // master's remote/session/workspace access hooks became required props;
    // these specs exercise routing/standards faces, so open access stubs.
    useRemoteAccess: () => true,
    useSessionAccess: () => true,
    useWorkspaceAccess: () => true,
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

  it('setTierProvider re-points the model to the provider\'s first offering and clears the effort (问题 5/4.3)', async () => {
    const controller = new RouteSectionController(fakeCtx({ catalog: groupedCatalog }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.setTierProvider('high', 'q')
    // q's first offering is cheap; effort ladders are per-model, so the stale
    // high effort from big does not survive the re-point.
    expect(store.getSnapshot().draft?.tiers.high).toEqual({ provider: 'q', model: 'cheap' })
    expect(store.getSnapshot().dirty).toBe(true)
  })

  it('normalizes a loaded draft against the catalog — no dangling ids (问题 5/4.3)', async () => {
    const controller = new RouteSectionController(fakeCtx({
      catalog: groupedCatalog,
      get: async () => ({
        ok: true as const,
        value: {
          ...CONFIG,
          tiers: {
            high: { provider: 'p', model: 'big', reasoningEffort: 'high' },
            // mid's provider left the catalog — it re-points to the catalog's
            // FIRST model (p/big), effort dropped.
            mid: { provider: 'gone', model: 'x', reasoningEffort: 'max' },
            // low's provider stayed but its model left the menu — re-point to
            // q's first offering.
            low: { provider: 'q', model: 'ghost' },
          },
        },
      }) as const,
    }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    const tiers = store.getSnapshot().draft?.tiers
    expect(tiers?.mid).toEqual({ provider: 'p', model: 'big' })
    expect(tiers?.low).toEqual({ provider: 'q', model: 'cheap' })
  })

  it('cancel() discards the draft\'s unsaved edits, back to the saved file (问题 5/4.1)', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.setTierModel('high', { model: 'bigger' })
    controller.setKeywordEnabled(0, false)
    expect(store.getSnapshot().dirty).toBe(true)
    await controller.cancel()
    // The saved file replaces the edited draft wholesale.
    expect(store.getSnapshot().draft).toEqual(CONFIG)
    expect(store.getSnapshot().dirty).toBe(false)
    expect(store.getSnapshot().error).toBeUndefined()
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

  it('updateKeyword patches one rule in place, keeping fields the patch omits', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    // The inline edit row re-sends words+tier; the category survives the patch.
    controller.updateKeyword(0, { words: '重构|refactor', tier: 'mid' })
    expect(store.getSnapshot().draft?.keywords)
      .toEqual([{ words: '重构|refactor', tier: 'mid', category: '复杂任务' }])
  })

  it('setKeywordEnabled parks one rule at the tag level (问题 4 标签级开关)', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.setKeywordEnabled(0, false)
    expect(store.getSnapshot().draft?.keywords)
      .toEqual([{ words: '架构|refactor', tier: 'high', category: '复杂任务', enabled: false }])
    expect(store.getSnapshot().dirty).toBe(true)
    controller.setKeywordEnabled(0, true)
    expect(store.getSnapshot().draft?.keywords?.[0]?.enabled).toBe(true)
  })

  it('setCategoryEnabled flips every rule in a category in one click (问题 3 类级开关)', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.addKeyword({ words: 'typo', tier: 'low' })
    controller.setCategoryEnabled('复杂任务', false)
    const keywords = store.getSnapshot().draft?.keywords ?? []
    expect(keywords[0]?.enabled).toBe(false)
    // A rule OUTSIDE the category keeps its default (live).
    expect(keywords[1]?.enabled).toBeUndefined()
    controller.setCategoryEnabled('复杂任务', true)
    expect(store.getSnapshot().draft?.keywords?.[0]?.enabled).toBe(true)
  })

  it('setPackEnabled parks a preset pack in draft.packs (问题 3 类级一键开关)', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.setPackEnabled('complexEngineering', false)
    expect(store.getSnapshot().draft?.packs).toEqual({ complexEngineering: false })
    expect(store.getSnapshot().dirty).toBe(true)
    controller.setPackEnabled('complexEngineering', true)
    expect(store.getSnapshot().draft?.packs).toEqual({ complexEngineering: true })
  })

  it('setPresetWordEnabled parks one preset word under pack::word (问题 4 标签级开关)', async () => {
    const controller = new RouteSectionController(fakeCtx())
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.setPresetWordEnabled('complexEngineering', '架构', false)
    expect(store.getSnapshot().draft?.presetWords).toEqual({ 'complexEngineering::架构': false })
    // A second word joins the map without clobbering the first.
    controller.setPresetWordEnabled('routineEdits', 'typo', false)
    expect(store.getSnapshot().draft?.presetWords).toEqual({
      'complexEngineering::架构': false,
      'routineEdits::typo': false,
    })
  })

  it('seeds a fresh disabled draft from the model catalog default when no config exists', async () => {
    const controller = new RouteSectionController(fakeCtx({
      get: async () => ({ ok: true, value: null }) as const,
    }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    const draft = store.getSnapshot().draft
    expect(draft?.enabled).toBe(false)
    expect(draft?.tierMode).toBe('two')
    expect(draft?.tiers.high).toEqual({ provider: 'p', model: 'm' })
    // The phase rows seed from the Host's built-in default map, not a copy.
    expect(draft?.phaseTier?.design).toBe('high')
    expect(draft?.phaseTier?.verify).toBe('low')
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

  it('distills the catalog: auto group dropped, reasoning carried, only same-provider dup names suffixed', async () => {
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
            { id: 'q', name: 'Q', models: [{ id: 'cheap', name: 'C' }, { id: 'sameq', name: 'Same' }] },
          ],
          failures: [],
        },
      }) as const,
    }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    // 问题 1 (2026-10-06): the label is the fetched name itself — the menus
    // are provider-scoped, so a CROSS-provider duplicate stays bare; only a
    // duplicate name inside ONE provider disambiguates, via the id.
    expect(store.getSnapshot().catalog).toEqual({
      models: [
        {
          id: 'm1', name: 'Same', provider: 'p', label: 'Same · m1',
          reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' },
        },
        { id: 'm2', name: 'Same', provider: 'p', label: 'Same · m2' },
        { id: 'cheap', name: 'C', provider: 'q', label: 'C' },
        { id: 'sameq', name: 'Same', provider: 'q', label: 'Same' },
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
  it('lays the page out as four tabs — 模型分级 / 工作流模型绑定 / 关键词规则 / 高级 — with real pagination', () => {
    const { props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    expect(screen.getByTestId('route-tier-mode')).toBeTruthy()
    const tiersTab = screen.getByTestId('route-tab-tiers')
    const phaseTab = screen.getByTestId('route-tab-phase')
    const keywordsTab = screen.getByTestId('route-tab-keywords')
    const advancedTab = screen.getByTestId('route-tab-advanced')
    expect(tiersTab.compareDocumentPosition(phaseTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(phaseTab.compareDocumentPosition(keywordsTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(keywordsTab.compareDocumentPosition(advancedTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId('route-tier-high')).toBeTruthy()
    // 1.2: exactly one panel is un-hidden at a time (the flex display used to
    // override the hidden attribute — every panel showed at once).
    const panelOf = (id: string) => screen.getByTestId(`route-panel-${id}`)
    expect(panelOf('tiers').hasAttribute('hidden')).toBe(false)
    expect(panelOf('phase').hasAttribute('hidden')).toBe(true)
    fireEvent.click(phaseTab)
    expect(panelOf('tiers').hasAttribute('hidden')).toBe(true)
    expect(panelOf('phase').hasAttribute('hidden')).toBe(false)
    expect(screen.getByTestId('route-flow')).toBeTruthy()
    fireEvent.click(keywordsTab)
    expect(screen.getByTestId('route-keyword-tag')).toBeTruthy()
    expect(screen.queryByText('presetsTitle')).toBeNull()
  })

  it('renders the three roles as CARDS: role header prominent, then labelled pickers (问题 2)', () => {
    const { props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    expect(screen.getByRole('switch', { name: 'master' })).toBeTruthy()
    const high = screen.getByTestId('route-tier-high')
    const mid = screen.getByTestId('route-tier-mid')
    const low = screen.getByTestId('route-tier-low')
    // One column: the cards stack in role order high → mid → low.
    expect(high.compareDocumentPosition(mid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(mid.compareDocumentPosition(low) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // NO shared table header row — each card labels its own three fields.
    expect(screen.queryByTestId('route-tiers-head')).toBeNull()
    for (const card of [high, mid, low]) {
      expect(within(card).getByText('provider')).toBeTruthy()
      expect(within(card).getByText('model')).toBeTruthy()
      expect(within(card).getByText('effortLabel')).toBeTruthy()
    }
    // 主次分明: the role name + description sit ABOVE the pickers in the card.
    const name = within(high).getByText('tierHigh')
    const desc = within(high).getByText('tierHighDesc')
    const providerBtn = within(high).getByRole('button', { name: 'p' })
    expect(name.compareDocumentPosition(providerBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(desc.compareDocumentPosition(providerBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Within the card the pickers read left→right: provider, model, effort.
    const modelBtn = within(high).getByRole('button', { name: 'Big Brain' })
    const effortBtn = within(high).getByRole('button', { name: 'High' })
    expect(providerBtn.compareDocumentPosition(modelBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(modelBtn.compareDocumentPosition(effortBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The anchors show names, not ids; no free-text comboboxes remain.
    expect(within(mid).getByRole('button', { name: 'Middle' })).toBeTruthy()
    expect(within(low).getByRole('button', { name: 'Cheap' })).toBeTruthy()
    expect(within(high).queryByRole('combobox')).toBeNull()
  })

  it('the model menu lists only the chosen provider\'s models; a pick sets provider AND model (1.1)', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    // high runs provider p — its model menu offers only p's models.
    fireEvent.click(within(screen.getByTestId('route-tier-high')).getByRole('button', { name: 'Big Brain' }))
    expect(screen.getByRole('menuitem', { name: 'Middle' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Cheap' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Middle' }))
    expect(face.setTierModel).toHaveBeenCalledWith('high', { provider: 'p', model: 'mid' })
    // low runs provider q — Cheap is there, the p models are not.
    fireEvent.click(within(screen.getByTestId('route-tier-low')).getByRole('button', { name: 'Cheap' }))
    expect(screen.getByRole('menuitem', { name: 'Cheap' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Big Brain' })).toBeNull()
  })

  it('re-points the provider alone from the provider menu (point 1)', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    const row = screen.getByTestId('route-tier-high')
    fireEvent.click(within(row).getByRole('button', { name: 'p' }))
    // Providers offered: every catalog provider, plus the configured one.
    fireEvent.click(screen.getByRole('menuitem', { name: 'q' }))
    expect(face.setTierProvider).toHaveBeenCalledWith('high', 'q')
  })

  it('edits the tier effort from the selected model\'s ladder; 默认 clears it', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    const row = screen.getByTestId('route-tier-high')
    // The fixture high tier runs big (reasoning ladder High/Max) at effort high.
    fireEvent.click(within(row).getByRole('button', { name: 'High' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Max' }))
    expect(face.setTierEffort).toHaveBeenCalledWith('high', 'max')
    // 默认 maps to undefined (follow the model default).
    fireEvent.click(within(row).getByRole('button', { name: 'High' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'effortDefault' }))
    expect(face.setTierEffort).toHaveBeenCalledWith('high', undefined)
  })

  it('renders a disabled placeholder in the effort column when the model has no ladder', () => {
    const { props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    // mid runs Middle (no reasoning in the fixture) — the column stays put
    // with a disabled — placeholder instead of collapsing.
    const placeholder = within(screen.getByTestId('route-tier-mid')).getByRole('button', { name: '—' })
    expect((placeholder as HTMLButtonElement).disabled).toBe(true)
  })

  it('never shows a 未在目录 chip — the anchor falls back to the raw id (问题 5/4.3)', () => {
    const { props } = harness({
      ...READY,
      draft: { ...CONFIG, tiers: { ...CONFIG.tiers, low: { provider: 'q', model: 'ghost' } } },
    })
    render(<ModelRoutingRow {...props} />)
    // The chip block is gone from the page entirely; a model outside the
    // provider's menu can only arrive through a state injected verbatim, and
    // even then the anchor shows the raw id with no verdict attached.
    expect(screen.queryByTestId('route-not-in-catalog')).toBeNull()
    expect(screen.queryByText('notInCatalog')).toBeNull()
    expect(within(screen.getByTestId('route-tier-low')).getByRole('button', { name: 'ghost' })).toBeTruthy()
  })

  it('provider-scoped menus keep names bare; the pick still resolves id+provider (问题 1)', () => {
    const { face, props } = harness({
      ...READY,
      catalog: {
        models: [
          { id: 'm1', name: 'Same', provider: 'p', label: 'Same' },
          { id: 'm2', name: 'Same', provider: 'q', label: 'Same' },
          { id: 'big', name: 'Big Brain', provider: 'p', label: 'Big Brain' },
        ],
      },
    })
    render(<ModelRoutingRow {...props} />)
    // low runs provider q (its model cheap is absent from this catalog, so the
    // anchor reads the raw id) — the filtered menu shows ONLY q's Same, its
    // label the bare fetched name (the menu scope already says the provider),
    // never the p namesake; the pick carries q/m2.
    fireEvent.click(within(screen.getByTestId('route-tier-low')).getByRole('button', { name: 'cheap' }))
    expect(screen.getByRole('menuitem', { name: 'Same' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Same · p' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Same' }))
    expect(face.setTierModel).toHaveBeenCalledWith('low', { provider: 'q', model: 'm2' })
  })

  it('parks the 挡位 dropdown at the action row LEFT end and 恢复默认 inside the 高级 tab (1.1/1.3)', () => {
    const { props, face } = harness({ ...READY, dirty: true })
    render(<ModelRoutingRow {...props} />)
    const actions = screen.getByTestId('route-actions')
    // 【变更】2026-10-13 (下拉样式批): the 挡位 control is the same Menu-primitive
    // selector pill 通用设置·语言 uses — an anchor BUTTON opening a menu, not a
    // native <select>.
    const modeButton = within(actions).getByTestId('route-tier-mode')
    expect(modeButton.getAttribute('aria-haspopup')).toBe('menu')
    const cancelButton = within(actions).getByTestId('route-cancel')
    const saveButton = within(actions).getByTestId('route-save')
    // The 挡位 pill leads the row (恢复默认's old seat); 取消 sits beside 保存.
    expect(modeButton.compareDocumentPosition(cancelButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(cancelButton.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect((cancelButton as HTMLButtonElement).disabled).toBe(false)
    // The anchor names the active mode; the menu offers just 两档 / 三档.
    expect(modeButton.textContent).toContain('tierModeThree')
    fireEvent.click(modeButton)
    expect(screen.getAllByRole('menuitem').map(o => o.textContent)).toEqual(['tierModeTwo', 'tierModeThree'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'tierModeTwo' }))
    expect(face.setTierMode).toHaveBeenCalledWith('two')
    // 恢复默认 moved OUT of the action row into the 高级 tab panel.
    expect(within(actions).queryByTestId('route-reset')).toBeNull()
    fireEvent.click(screen.getByTestId('route-tab-advanced'))
    const resetButton = screen.getByTestId('route-reset') as HTMLButtonElement
    expect(resetButton.disabled).toBe(false)
    fireEvent.click(resetButton)
    expect(face.reset).toHaveBeenCalledTimes(1)
    // The toolbar still precedes the first tier row in document order.
    expect(saveButton.compareDocumentPosition(screen.getByTestId('route-tier-high'))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('disables 取消 until the draft is dirty (问题 5/4.1)', () => {
    const { props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    const cancelButton = within(screen.getByTestId('route-actions')).getByTestId('route-cancel')
    expect((cancelButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('draws the workflow binding flow compactly with NO overlapping nodes (1.2)', () => {
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
    // 1.2 回归: no two node rects intersect (the drift column once sat 24px
    // INTO the main column). Read the inline geometry the canvas positions.
    const rects = nodes.map((node) => {
      const style = (node as HTMLElement).style
      return {
        x: Number(style.left.replace('px', '')),
        y: Number(style.top.replace('px', '')),
        w: Number(style.width.replace('px', '')),
        h: Number(style.height.replace('px', '')),
      }
    })
    for (let a = 0; a < rects.length; a += 1) {
      for (let b = a + 1; b < rects.length; b += 1) {
        const r1 = rects[a]!
        const r2 = rects[b]!
        const overlaps = r1.x < r2.x + r2.w && r2.x < r1.x + r1.w
          && r1.y < r2.y + r2.h && r2.y < r1.y + r1.h
        expect(overlaps).toBe(false)
      }
    }
    // Session-tab-style canvas: bezier edges with an arrowhead marker, and
    // the full chain visible without an inner scroll viewport.
    const flow = screen.getByTestId('route-flow')
    expect(flow.querySelectorAll('path').length).toBeGreaterThanOrEqual(9)
    expect(flow.querySelector('marker') !== null).toBe(true)
    const canvas = flow.parentElement
    expect(canvas instanceof HTMLElement && canvas.style.maxHeight !== '').toBe(false)
    expect(canvas?.className).not.toContain('flowScroll')
  })

  it('shows the flow click-hint above the canvas on the 工作流模型绑定 tab (1.2)', () => {
    const { props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    fireEvent.click(screen.getByTestId('route-tab-phase'))
    const hint = screen.getByText('flowHint')
    const flow = screen.getByTestId('route-flow')
    expect(hint.compareDocumentPosition(flow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('cycles a node\'s tier on click (worker→reviewer→commander→worker)', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    fireEvent.click(screen.getByTestId('route-tab-phase'))
    const nodes = screen.getAllByTestId('route-phase-row')
    // implement maps to low in the fixture; one click lifts it to mid.
    fireEvent.click(nodes[5]!)
    expect(face.setPhaseTier).toHaveBeenCalledWith('implement', 'mid')
    // design is high; cycling wraps back to low.
    fireEvent.click(nodes[3]!)
    expect(face.setPhaseTier).toHaveBeenCalledWith('design', 'low')
  })

  it('renders builtin presets INSIDE 关键词规则 as clickable 预设 tags with per-pack master switches (问题 5/4.5)', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    fireEvent.click(screen.getByTestId('route-tab-keywords'))
    const tags = screen.getAllByTestId('route-preset-tag')
    // Every word of every ESCALATION pack renders as its own tag (3 per
    // fixture pack); the fixture's routineEdits is a version-skewed LOW pack
    // and must NOT render — Worker is the fallback grade (2026-10-13 批).
    expect(tags).toHaveLength(9)
    expect(tags.map(tag => tag.textContent).some(text => text?.startsWith('架构'))).toBe(true)
    expect(tags.map(tag => tag.textContent).some(text => text?.startsWith('单元测试'))).toBe(true)
    expect(tags.every(tag => tag.textContent?.includes('presetBadge') === true)).toBe(true)
    expect(tags.find(tag => tag.textContent?.includes('架构'))?.getAttribute('title')).toContain('presetComplexEngineering')
    // 4.5: the TAG is the switch — no per-tag switch button inside; a click
    // parks the word (nothing is added — it already IS a rule).
    const wordTag = tags.find(tag => tag.textContent?.includes('架构'))!
    expect(within(wordTag).queryByRole('switch')).toBeNull()
    expect(wordTag.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(wordTag)
    expect(face.setPresetWordEnabled).toHaveBeenCalledWith('complexEngineering', '架构', false)
    expect(face.addKeyword).not.toHaveBeenCalled()
    // Role-grouped with the user's own rules: the high group hosts both high
    // packs AND the fixture's own 架构|refactor rule; the mid group hosts the
    // QA pack; the dead low pack hosts nothing.
    const groups = screen.getAllByTestId('route-keyword-group')
    expect(groups).toHaveLength(2)
    expect(groups[0]?.textContent).toContain('tierHigh')
    expect(groups[0]?.textContent).toContain('架构|refactor')
    expect(groups[0]?.textContent).toContain('presetComplexEngineering')
    expect(groups[0]?.textContent).toContain('presetCriticalRelease')
    expect(groups[1]?.textContent).toContain('tierMid')
    expect(groups[1]?.textContent).toContain('presetQualityAssurance')
    expect(groups.map(group => group.textContent).some(text => text?.includes('README'))).toBe(false)
    // …but each PACK carries a master switch (类级一键开关) → setPackEnabled.
    const packToggles = screen.getAllByTestId('route-pack-toggle')
    expect(packToggles).toHaveLength(3)
    fireEvent.click(within(packToggles[0]!).getByRole('switch'))
    expect(face.setPackEnabled).toHaveBeenCalledWith('complexEngineering', false)
    // 【变更】2026-10-20 (批次二 2.5): zh/en merged into ONE segment line — CJK
    // words first, the rest after, no 中文/英文 divider labels. (rulePackName →
    // ruleHead → rulePack — walked explicitly, the hashed class names
    // substring-collide.)
    const pack = screen.getByText('presetComplexEngineering').parentElement?.parentElement
    expect(pack?.className).toContain('rulePack')
    const lines = pack?.querySelectorAll('[class*="segLine"]')
    expect(lines?.length).toBe(1)
    expect(lines?.[0]?.textContent).toContain('架构')
    expect(lines?.[0]?.textContent).toContain('重构')
    expect(lines?.[0]?.textContent).toContain('refactor')
    expect(pack?.textContent).not.toContain('tagsZh')
    expect(pack?.textContent).not.toContain('tagsEn')
    // 【变更】2026-10-20 (批次二 2.2): the preset-file pointer paragraph is gone.
    expect(screen.queryByText('presetsFileHint')).toBeNull()
  })

  it('a preset word parked via draft.presetWords renders checked off (问题 5/4.5)', () => {
    const { props } = harness({
      ...READY,
      draft: { ...CONFIG, presetWords: { 'complexEngineering::架构': false } },
    })
    render(<ModelRoutingRow {...props} />)
    const tags = screen.getAllByTestId('route-preset-tag')
    const parked = tags.find(tag => tag.textContent?.includes('架构'))!
    expect(parked.getAttribute('aria-checked')).toBe('false')
    expect(parked.className).toContain('Off')
    // The pack's other words stay on.
    const refactor = tags.find(tag => tag.textContent?.includes('refactor'))!
    expect(refactor.getAttribute('aria-checked')).toBe('true')
  })

  it('the user tag ITSELF is the switch — click or Enter parks the rule (问题 5/4.5)', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    const tag = screen.getByTestId('route-keyword-tag')
    // The tag sits in its tier group — no tier label inside the tag itself,
    // and no mini switch button anymore: the tag carries role="switch".
    expect(tag.textContent).not.toContain('tierHigh')
    expect(tag.getAttribute('role')).toBe('switch')
    expect(tag.getAttribute('aria-checked')).toBe('true')
    expect(within(tag).queryByRole('switch')).toBeNull()
    fireEvent.click(tag)
    expect(face.setKeywordEnabled).toHaveBeenCalledWith(0, false)
    // Keyboard toggles too (tabbable tag) — the harness state is static, so
    // the tag is still on and Enter asks to park it again.
    fireEvent.keyDown(tag, { key: 'Enter' })
    expect(face.setKeywordEnabled).toHaveBeenLastCalledWith(0, false)
    // ✎/✕ stop propagation — editing never toggles the rule.
    fireEvent.click(within(tag).getByTestId('route-keyword-edit-btn'))
    expect(face.setKeywordEnabled).toHaveBeenCalledTimes(2)
    // A parked (enabled:false) rule still renders, dimmed, off.
    const parked = harness({
      ...READY,
      draft: {
        ...CONFIG,
        keywords: [{ words: '架构|refactor', tier: 'high', category: '复杂任务', enabled: false }],
      },
    })
    // Scoped to this second render's container — the first row is still mounted.
    const { container } = render(<ModelRoutingRow {...parked.props} />)
    const parkedTag = within(container).getByTestId('route-keyword-tag')
    expect(parkedTag.className).toContain('Off')
    expect(parkedTag.getAttribute('aria-checked')).toBe('false')
  })

  it('groups user rules by custom category with a one-click master switch (问题 3 自定义分类)', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    fireEvent.click(screen.getByTestId('route-tab-keywords'))
    // The fixture rule carries category 复杂任务 — the group renders the label
    // and a master switch wired to setCategoryEnabled.
    const group = screen.getAllByTestId('route-keyword-group')[0]!
    const category = within(group).getByTestId('route-category')
    expect(within(category).getByText('复杂任务')).toBeTruthy()
    fireEvent.click(within(within(category).getByTestId('route-category-toggle')).getByRole('switch'))
    expect(face.setCategoryEnabled).toHaveBeenCalledWith('复杂任务', false)
    // 4.5: the category's one rule ('架构|refactor' carries CJK) reads 中文 —
    // a single-language segment carries NO 中文/英文 divider label.
    expect(category.textContent).not.toContain('tagsZh')
    expect(category.textContent).not.toContain('tagsEn')
  })

  it('the adder takes an optional category, and the edit row keeps it (问题 3)', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    fireEvent.click(screen.getByTestId('route-tab-keywords'))
    const adder = screen.getByTestId('route-keyword-adder')
    fireEvent.change(within(adder).getByTestId('route-keyword-add-words'), { target: { value: '导出' } })
    fireEvent.change(within(adder).getByTestId('route-keyword-add-category'), { target: { value: '数据导出' } })
    fireEvent.click(within(adder).getByRole('button', { name: 'keywordAdd' }))
    expect(face.addKeyword).toHaveBeenCalledWith({ words: '导出', tier: 'high', category: '数据导出' })
    // 【变更】2026-10-20 (批次二 2.4/2.6): the escalate-only switch is gone and
    // the tier picker is a Menu anchor button, not a native combobox.
    expect(screen.queryByRole('switch', { name: 'escalateOnly' })).toBeNull()
    expect(within(adder).queryByRole('combobox')).toBeNull()
    expect(within(adder).getByTestId('route-keyword-add-tier').getAttribute('aria-haspopup')).toBe('menu')
    // The inline edit carries the existing category through untouched.
    fireEvent.click(within(screen.getByTestId('route-keyword-tag')).getByTestId('route-keyword-edit-btn'))
    fireEvent.change(screen.getByTestId('route-keyword-edit-input'), { target: { value: '导出|export' } })
    fireEvent.click(screen.getByTestId('route-keyword-save'))
    expect(face.updateKeyword).toHaveBeenCalledWith(0, {
      words: '导出|export', tier: 'high', category: '复杂任务',
    })
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
    expect(face.updateKeyword).toHaveBeenCalledWith(0, { words: '重构|refactor', tier: 'high', category: '复杂任务' })
  })

  it('forwards the master switch to the face', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    fireEvent.click(screen.getByRole('switch', { name: 'master' }))
    expect(face.setEnabled).toHaveBeenCalledWith(false)
  })

  it('hot-reloads the preview: draft edits re-run the dry-run on a debounce (1.6)', async () => {
    const { store, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    // Type once — the debounce fires on its own, no run click.
    fireEvent.change(screen.getByTestId('route-preview-input'), { target: { value: 'readme' } })
    await waitFor(() => { expect(props.runPreview).toHaveBeenCalledWith('readme', { verifyRetry: false }) })
    // A keyword edit to the DRAFT re-runs with the same text (热加载).
    vi.mocked(props.runPreview).mockClear()
    store.set({
      ...READY,
      dirty: true,
      draft: { ...CONFIG, keywords: [...(CONFIG.keywords ?? []), { words: 'readme', tier: 'high' }] },
    })
    await waitFor(() => { expect(props.runPreview).toHaveBeenCalledWith('readme', { verifyRetry: false }) })
    // 【变更】2026-10-20 (批次二 2.8): the verify-retry simulation switch is
    // gone — every hot reload runs without it, forever.
    expect(screen.queryByTestId('route-preview-verify')).toBeNull()
  })

  it('shows the preview verdict, escalated flag, and auto-runs on typing (no run button)', async () => {
    const { props } = harness({
      ...READY,
      dirty: true,
      error: 'bad tiers',
      preview: {
        tier: 'mid', matched: 'readme', escalated: true, provider: 'p', model: 'mid',
      },
    })
    render(<ModelRoutingRow {...props} />)
    expect(screen.queryByTestId('route-preview-run')).toBeNull()
    expect(screen.getByTestId('route-preview').textContent).toContain('readme')
    expect(screen.getByTestId('route-preview').textContent).toContain('previewEscalated')
    expect(screen.getByTestId('route-preview').textContent).toContain('p / mid')
    // 【变更】2026-10-20 (批次二 2.8): the verdict card carries the matched
    // grade's tier accent (TIER_CLASS key in the class list).
    expect(screen.getByTestId('route-preview').className).toContain('tierMid')
    expect(screen.getByTestId('route-error').textContent).toContain('bad tiers')
    fireEvent.change(screen.getByTestId('route-preview-input'), { target: { value: '重构模块' } })
    await waitFor(() => {
      expect(props.runPreview).toHaveBeenCalledWith('重构模块', { verifyRetry: false })
    })
  })

  it('still lists every preset id the locale knows (display-name coverage)', () => {
    // The Host owns the packs; the client only carries their ids for naming.
    // 【变更】2026-10-13 (worker 关键词批): the low-tier routineEdits pack is
    // gone — three escalation packs only.
    expect(KEYWORD_PRESET_IDS).toEqual(['complexEngineering', 'criticalRelease', 'qualityAssurance'])
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
