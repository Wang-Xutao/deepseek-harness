// @vitest-environment jsdom
/**
 * 多模型路由 M3 批次B — the settings row controller + component.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'

afterEach(cleanup)
import { useSyncExternalStore } from 'react'
import type { RouteTierConfig } from '@deepseek-ai/dsh-baf-core'
import type { RouteTier } from '../src/types.ts'
import { ModelRoutingRow } from '../src/client/ModelRoutingRow.tsx'
import {
  RouteSectionController, type RouteSectionFace, type RouteSectionState,
} from '../src/client/route-store.ts'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { Context as ClientContext } from '@deepseek-ai/cordis'

const CONFIG: RouteTierConfig = {
  schema: 1,
  enabled: true,
  tiers: {
    high: { provider: 'p', model: 'big', reasoningEffort: 'high' },
    mid: { provider: 'p', model: 'mid' },
    low: { provider: 'q', model: 'cheap' },
  },
  phaseTier: { design: 'high', verify: 'mid' },
  keywords: [{ words: '架构|refactor', tier: 'high' }],
  escalateOnly: true,
}

/** What the Host's `defaults()` Remote hands a fresh draft. */
const PHASE_DEFAULTS: Record<string, RouteTier> = {
  design: 'high', plan: 'high', clarify: 'mid', verify: 'mid',
  implement: 'low', intake: 'low', open: 'low', archive: 'low', drift: 'low',
}

function t(key: string): string {
  return key
}

const unusedHook = (() => { throw new Error('unused') }) as never
const kit = {
  useResource: unusedHook,
  useSessions: unusedHook,
  useSessionPendingInteraction: unusedHook,
  useWorkspaces: unusedHook,
  close: vi.fn(),
}

/** A minimal `remote.bafRouteConfig` + `remote.session` context for the controller. */
function fakeCtx(overrides: {
  get?: () => Promise<{ ok: true; value: RouteTierConfig | null }>
  save?: (config: RouteTierConfig) => Promise<{ ok: true; value: { ok: boolean; error?: string } }>
  preview?: (summary: string) => Promise<{ ok: true; value: { tier: RouteTier | null; matched?: string } }>
  defaults?: () => Promise<{ ok: true; value: { phaseTier: Record<string, RouteTier> } }>
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
          ?? (async () => ({ ok: true, value: { phaseTier: PHASE_DEFAULTS } }) as const),
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
    setPhaseTier: vi.fn(),
    addKeyword: vi.fn(),
    removeKeyword: vi.fn(),
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
  catalog: { providers: ['p', 'q'], models: ['big', 'mid', 'cheap'] },
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

  it('save() persists the draft and folds the host verdict into error/dirty', async () => {
    const save = vi.fn(async () => ({ ok: true, value: { ok: false, error: 'bad tiers' } }) as const)
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

  it('loads provider/model suggestions from the catalog even with a saved config', async () => {
    const catalog = vi.fn(async () => ({
      ok: true,
      value: {
        default: { provider: 'p', model: 'm' },
        routableProviders: [],
        groups: [
          { id: 'p', name: 'P', models: [{ id: 'm1', name: 'M1' }, { id: 'm2', name: 'M2' }] },
          { id: 'q', name: 'Q', models: [{ id: 'cheap', name: 'C' }] },
        ],
        failures: [],
      },
    }) as const)
    const controller = new RouteSectionController(fakeCtx({ catalog }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    expect(store.getSnapshot().catalog).toEqual({ providers: ['p', 'q'], models: ['m1', 'm2', 'cheap'] })
  })

  it('runPreview() carries the host verdict into the preview slot', async () => {
    const controller = new RouteSectionController(fakeCtx({
      preview: async () => ({ ok: true, value: { tier: 'high', matched: '架构' } }) as const,
    }))
    const store = controller.inject().hooks.routeSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    await controller.runPreview('梳理整体架构')
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
  it('renders the master switch, three tier cards, phase rows, and keyword rows from the draft', () => {
    const { props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    expect(screen.getByRole('switch', { name: 'master' })).toBeTruthy()
    // Three tier cards (testids on the card containers — the repo convention
    // keeps testids on intrinsics this component owns, never primitives). The
    // provider/model inputs carry list= suggestions, so they surface as
    // comboboxes (dropdown + 手输), not plain textboxes.
    const high = within(screen.getByTestId('route-tier-high'))
    expect((high.getAllByRole('combobox')[0] as HTMLInputElement).value).toBe('p')
    expect((high.getAllByRole('combobox')[1] as HTMLInputElement).value).toBe('big')
    const low = within(screen.getByTestId('route-tier-low'))
    expect((low.getAllByRole('combobox')[1] as HTMLInputElement).value).toBe('cheap')
    // Phase mapping rows for all nine nodes (8 stages + drift).
    expect(screen.getAllByTestId('route-phase-row')).toHaveLength(9)
    // Provider/model inputs carry catalog suggestions (datalist: dropdown + 手输).
    // jsdom hides datalists from the accessibility tree, so count the option
    // elements directly instead of by role.
    expect(screen.getByTestId('route-provider-options').querySelectorAll('option')).toHaveLength(2)
    expect(screen.getByTestId('route-model-options').querySelectorAll('option')).toHaveLength(3)
    // The keyword rule row shows its pattern.
    expect(screen.getByDisplayValue('架构|refactor')).toBeTruthy()
  })

  it('forwards the master switch and tier edits to the face', () => {
    const { face, props } = harness(READY)
    render(<ModelRoutingRow {...props} />)
    fireEvent.click(screen.getByRole('switch', { name: 'master' }))
    expect(face.setEnabled).toHaveBeenCalledWith(false)
    const high = within(screen.getByTestId('route-tier-high'))
    fireEvent.change(high.getAllByRole('combobox')[1], { target: { value: 'bigger' } })
    expect(face.setTierModel).toHaveBeenCalledWith('high', { model: 'bigger' })
  })

  it('shows the preview verdict and the inline save error', () => {
    const { props } = harness({
      ...READY,
      dirty: true,
      error: 'bad tiers',
      preview: { tier: 'high', matched: '架构' },
    })
    render(<ModelRoutingRow {...props} />)
    expect(screen.getByTestId('route-preview').textContent).toContain('架构')
    expect(screen.getByTestId('route-error').textContent).toContain('bad tiers')
    fireEvent.change(screen.getByTestId('route-preview-input'), { target: { value: '重构模块' } })
    fireEvent.click(screen.getByTestId('route-preview-run'))
    expect(props.runPreview).toHaveBeenCalledWith('重构模块')
  })
})
