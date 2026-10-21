// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { FeaturedSection } from '../src/client/FeaturedSection.tsx'
import {
  FeaturedSectionController,
  type FeaturedSectionFace,
  type FeaturedSectionState,
} from '../src/client/featured-store.ts'
import {
  getFeaturedPluginsUpdateAvailable,
  setFeaturedPluginsUpdateAvailable,
} from '../src/client/featured-update-signal.ts'

afterEach(() => {
  setFeaturedPluginsUpdateAvailable(false)
  cleanup()
})
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { FeaturedPluginCard, FeaturedResult } from '@deepseek-ai/dsh-api-remotes/client'

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

function card(partial: Partial<FeaturedPluginCard> = {}): FeaturedPluginCard {
  return {
    id: 'dsh-feishu',
    package: '@dsh-feishu/dsh-feishu',
    version: '^0.3.5',
    nameZh: '飞书',
    nameEn: 'Feishu',
    descriptionZh: '接入飞书',
    descriptionEn: 'Feishu integration',
    homepage: 'https://github.com/PGZXB/dsh-feishu',
    state: 'not-installed',
    updateAvailable: false,
    autoUpdate: true,
    manageable: true,
    ...partial,
  }
}

function readyState(
  plugins: readonly FeaturedPluginCard[],
  extra: Partial<FeaturedSectionState> = {},
): FeaturedSectionState {
  return {
    status: 'ready',
    plugins,
    revision: 1,
    manifestError: undefined,
    busy: undefined,
    bulk: undefined,
    checking: false,
    exporting: false,
    importing: false,
    confirm: undefined,
    notice: undefined,
    progress: undefined,
    ...extra,
  }
}

/** Bind a real snapshot store into the selector hook shape the component reads. */
function useStore<T>(store: SnapshotStore<T>): <S>(sel: (s: T) => S) => S {
  return sel => useSyncExternalStore(
    store.subscribe,
    () => sel(store.getSnapshot()),
  )
}

function harness(state: FeaturedSectionState) {
  const store = createSnapshotStore<FeaturedSectionState>(state)
  const face: FeaturedSectionFace = {
    hooks: { featuredSection: store },
    reload: vi.fn(),
    install: vi.fn(),
    update: vi.fn(),
    removePlugin: vi.fn(),
    setEnabled: vi.fn(),
    setAutoUpdate: vi.fn(),
    setAllAutoUpdate: vi.fn(),
    bulkInstall: vi.fn(),
    bulkSetEnabled: vi.fn(),
    checkUpdates: vi.fn(),
    // 【变更】2026-10-22 (批次十一 2): the import/export face seats.
    exportConfig: vi.fn(async () => undefined),
    importConfig: vi.fn(),
    acceptConfirm: vi.fn(),
    nameOf: c => c.nameEn,
    descriptionOf: c => c.descriptionEn,
  }
  const { hooks, ...actions } = face
  const props = {
    ...kit,
    ...actions,
    t: t as never,
    useFeaturedSection: useStore(hooks.featuredSection),
  }
  return { store, face, props }
}

describe('FeaturedSection', () => {
  it('renders a not-installed card with install and auto-update', () => {
    const { props } = harness(readyState([card()]))
    render(<FeaturedSection {...props} />)
    expect(screen.getByText('Feishu')).toBeTruthy()
    expect(screen.getByText('stateNotInstalled')).toBeTruthy()
    expect(screen.getByTestId('featured-install')).toBeTruthy()
    expect(screen.queryByTestId('featured-remove')).toBeNull()
    expect(within(screen.getByTestId('featured-card-dsh-feishu')).getByText('autoUpdate')).toBeTruthy()
    expect(screen.getByTestId('featured-homepage-link').textContent).toBe('https://github.com/PGZXB/dsh-feishu')
  })

  // 【变更】2026-10-22 (批次十一 2): the list's import/export row.
  it('shows the export/import row even with an empty list, and export asks the face', () => {
    const { props, face } = harness(readyState([]))
    render(<FeaturedSection {...props} />)
    expect(screen.getByTestId('featured-config-row')).toBeTruthy()
    expect(screen.getByTestId('featured-export')).toBeTruthy()
    expect(screen.getByTestId('featured-import')).toBeTruthy()
    expect(screen.getByText('configHint')).toBeTruthy()
    fireEvent.click(screen.getByTestId('featured-export'))
    expect(face.exportConfig).toHaveBeenCalled()
  })

  it('feeds a chosen config file to importConfig', async () => {
    const { props, face } = harness(readyState([card()]))
    render(<FeaturedSection {...props} />)
    const text = JSON.stringify({ schemaVersion: 1, revision: 7, plugins: [] })
    fireEvent.change(screen.getByTestId('featured-import-input'), {
      target: { files: [new File([text], 'featured-plugins.json', { type: 'application/json' })] },
    })
    await waitFor(() => expect(face.importConfig).toHaveBeenCalledWith(text))
  })

  it('renders an enabled card with disable, update, and remove when an update is available', () => {
    const { props } = harness(readyState([
      card({ state: 'enabled', installedVersion: '0.3.5', latestKnown: '0.3.6', updateAvailable: true }),
    ]))
    render(<FeaturedSection {...props} />)
    expect(screen.getByText('stateEnabled')).toBeTruthy()
    expect(screen.getByTestId('featured-disable')).toBeTruthy()
    expect(screen.getByTestId('featured-update')).toBeTruthy()
    expect(screen.getByTestId('featured-remove')).toBeTruthy()
    expect(screen.queryByTestId('featured-update-chip')).toBeNull()
    expect(screen.getByTestId('featured-update-badge')).toBeTruthy()
    expect(screen.getByTestId('featured-homepage-link').closest('[class*=cardHead]')).toBeTruthy()
    expect(screen.getByText('versionInstalled：0.3.5')).toBeTruthy()
    expect(screen.getByText('versionLatest：0.3.6')).toBeTruthy()
  })

  it('renders an unavailable card with the hint and no actions', () => {
    const { props } = harness(readyState([card({ state: 'unavailable', verified: false })]))
    render(<FeaturedSection {...props} />)
    expect(screen.getByText('stateUnavailable')).toBeTruthy()
    expect(screen.getByText('unavailableHint')).toBeTruthy()
    expect(screen.queryByTestId('featured-install')).toBeNull()
    expect(screen.queryByTestId('featured-remove')).toBeNull()
    // 批次八 1: the unavailable card grays out (faded + desaturated) and
    // carries the data-unavailable marker; a live card does neither.
    const unavailable = screen.getByText('stateUnavailable').closest('[data-unavailable]')
    expect(unavailable).toBeTruthy()
    expect((unavailable as HTMLElement).className).toContain('cardUnavailable')
  })

  it('shows the risk confirmation on the refused card and forwards the answer', () => {
    const { face, props } = harness(readyState([card()], {
      confirm: {
        id: 'dsh-feishu', op: 'install', kind: 'risk',
        incompatible: [{ name: '@deepseek-ai/dsh-agent', version: '^0.1.7', runtimeVersion: '0.2.0-rc.2', peers: {} }],
      },
    }))
    render(<FeaturedSection {...props} />)
    expect(screen.getByTestId('featured-confirm-risk')).toBeTruthy()
    expect(screen.getByText('confirmRiskTitle')).toBeTruthy()
    fireEvent.click(screen.getByTestId('featured-confirm-accept'))
    expect(face.acceptConfirm).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByTestId('featured-confirm-decline'))
    expect(face.acceptConfirm).toHaveBeenCalledWith(false)
  })

  it('lists pending build packages on the builds confirmation', () => {
    const { props } = harness(readyState([card()], {
      confirm: { id: 'dsh-feishu', op: 'install', kind: 'builds', packages: ['protobufjs', 'esbuild'] },
    }))
    render(<FeaturedSection {...props} />)
    expect(screen.getByTestId('featured-confirm-builds')).toBeTruthy()
    expect(screen.getByText('protobufjs')).toBeTruthy()
    expect(screen.getByText('esbuild')).toBeTruthy()
  })

  it('gates the bulk bar on what the cards can do', () => {
    const { face, props } = harness(readyState([
      card({ id: 'a', state: 'enabled' }),
      card({ id: 'b', state: 'disabled' }),
    ]))
    render(<FeaturedSection {...props} />)
    const bulkInstall = screen.getByTestId('featured-bulk-install') as HTMLButtonElement
    expect(bulkInstall.disabled).toBe(true)
    fireEvent.click(screen.getByTestId('featured-bulk-enable'))
    expect(face.bulkSetEnabled).toHaveBeenCalledWith(true)
  })

  it('renders failed notices and manifest problems', () => {
    const { props } = harness(readyState([card()], {
      manifestError: 'ENOENT',
      notice: { kind: 'failed', text: 'pnpm refused', seq: 1 },
    }))
    render(<FeaturedSection {...props} />)
    expect(screen.getByTestId('featured-manifest-error').textContent).toContain('ENOENT')
    expect(screen.getByTestId('featured-notice').textContent).toContain('pnpm refused')
  })

  it('speaks a mapped refusal code and paints the failure red (问题 7)', () => {
    // 【变更】2026-10-06 (问题 7): management-required never reaches the person
    // raw — the locale sentence the plugin-inventory page uses explains it, and
    // the notice box carries the danger frame + alert role instead of a quiet
    // status line.
    const { props } = harness(readyState([card()], {
      notice: { kind: 'failed', text: 'management-required', code: 'management-required', seq: 2 },
    }))
    render(<FeaturedSection {...props} />)
    const notice = screen.getByTestId('featured-notice')
    expect(notice.getAttribute('role')).toBe('alert')
    expect(notice.className).toContain('noticeError')
    expect(notice.textContent).toContain('operationFailed')
    expect(notice.textContent).toContain('reasonManagementRequired')
    expect(notice.textContent).not.toContain('management-required：')
    // An unmapped failure keeps the Host's own words, still in the red box.
    const unmapped = harness(readyState([card()], {
      notice: { kind: 'failed', text: 'pnpm refused', code: 'not-found', seq: 3 },
    }))
    const second = render(<FeaturedSection {...unmapped.props} />)
    const secondNotice = within(second.container).getAllByTestId('featured-notice')
      .find(node => node.textContent?.includes('pnpm refused'))!
    expect(secondNotice.className).toContain('noticeError')
    expect(secondNotice.textContent).toContain('pnpm refused')
    // And a success notice stays a plain status line.
    const ok = harness(readyState([card()], { notice: { kind: 'ok', text: '', seq: 4 } }))
    const third = render(<FeaturedSection {...ok.props} />)
    const okNotice = within(third.container).getAllByTestId('featured-notice')
      .find(node => node.textContent?.includes('applied'))!
    expect(okNotice.className).not.toContain('noticeError')
    expect(okNotice.getAttribute('role')).toBe('status')
  })

  it('renders load failure with retry', () => {
    const { face, props } = harness({ ...readyState([]), status: 'failed' })
    render(<FeaturedSection {...props} />)
    expect(screen.getByText('loadFailed')).toBeTruthy()
    fireEvent.click(screen.getByTestId('featured-retry'))
    expect(face.reload).toHaveBeenCalled()
  })
})

/** A minimal `remote.featuredPlugins` + `locale` context for the controller. */
function fakeCtx(methods: {
  list?: () => Promise<{ ok: true; value: { plugins: FeaturedPluginCard[]; revision: number } }>
  installPlugin?: (id: string, options?: unknown) => Promise<{ ok: true; value: FeaturedResult }>
} = {}) {
  const remote = {
    featuredPlugins: {
      list: methods.list ?? (async () => ({ ok: true, value: { plugins: [card()], revision: 1 } }) as const),
      installPlugin: methods.installPlugin ?? (async () => ({ ok: true, value: { ok: true, application: 'applied' } }) as const),
      update: async () => ({ ok: true, value: { ok: true, application: 'applied' } }) as const,
      removePlugin: async () => ({ ok: true, value: { ok: true, application: 'applied' } }) as const,
      setEnabled: async () => ({ ok: true, value: { ok: true, application: 'applied' } }) as const,
      setAutoUpdate: async () => ({ ok: true, value: { ok: true } }) as const,
      bulkInstall: async () => ({ ok: true, value: { outcomes: [] } }) as const,
      bulkSetEnabled: async () => ({ ok: true, value: { outcomes: [] } }) as const,
      checkUpdates: async () => ({ ok: true, value: { plugins: [], revision: 1 } }) as const,
    },
  }
  const locale = {
    resolveText: (text: { zh?: string; en?: string }) => text.zh ?? text.en ?? '',
  }
  return { remote, locale } as unknown as ClientContext
}

describe('FeaturedSectionController', () => {
  it('folds a compatibility refusal into a risk confirmation, then retries with acceptRisk', async () => {
    const install = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: { ok: false, needsRiskAck: [{ name: '@deepseek-ai/dsh-agent', version: '^0.1.7', runtimeVersion: '0.2.0-rc.2', peers: {} }] } })
      .mockResolvedValueOnce({ ok: true, value: { ok: true, application: 'applied' } })
    const controller = new FeaturedSectionController(fakeCtx({ installPlugin: install as never }))
    const store = controller.inject().hooks.featuredSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.install('dsh-feishu')
    await waitFor(() => {
      expect(store.getSnapshot().confirm?.kind).toBe('risk')
      expect(store.getSnapshot().confirm?.id).toBe('dsh-feishu')
    })
    expect(store.getSnapshot().notice).toBeUndefined()
    controller.acceptConfirm(true)
    await waitFor(() => {
      expect(store.getSnapshot().confirm).toBeUndefined()
      expect(store.getSnapshot().notice?.kind).toBe('ok')
    })
    expect(install).toHaveBeenCalledTimes(2)
    expect(install).toHaveBeenLastCalledWith('dsh-feishu', expect.objectContaining({ acceptRisk: true }))
  })

  it('folds held build scripts into a builds confirmation and approves them on accept', async () => {
    const install = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: { ok: false, pendingBuilds: ['protobufjs'] } })
      .mockResolvedValueOnce({ ok: true, value: { ok: true, application: 'restart-required' } })
    const controller = new FeaturedSectionController(fakeCtx({ installPlugin: install as never }))
    const store = controller.inject().hooks.featuredSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.install('dsh-feishu')
    await waitFor(() => { expect(store.getSnapshot().confirm?.kind).toBe('builds') })
    controller.acceptConfirm(true)
    await waitFor(() => { expect(store.getSnapshot().notice?.kind).toBe('restart') })
    expect(install).toHaveBeenLastCalledWith('dsh-feishu', expect.objectContaining({ approvedBuilds: ['protobufjs'] }))
  })

  it('declining a confirmation drops it without retrying', async () => {
    const install = vi.fn()
      .mockResolvedValue({ ok: true, value: { ok: false, needsRiskAck: [{ name: 'p', version: '1', runtimeVersion: '2', peers: {} }] } })
    const controller = new FeaturedSectionController(fakeCtx({ installPlugin: install as never }))
    const store = controller.inject().hooks.featuredSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.install('dsh-feishu')
    await waitFor(() => { expect(store.getSnapshot().confirm).toBeDefined() })
    controller.acceptConfirm(false)
    expect(store.getSnapshot().confirm).toBeUndefined()
    expect(install).toHaveBeenCalledTimes(1)
  })

  it('surfaces a refused bulk outcome as that card confirmation and names the first failure', async () => {
    const ctx = fakeCtx()
    const refused: FeaturedResult = { ok: false, needsRiskAck: [{ name: 'p', version: '1', runtimeVersion: '2', peers: {} }] }
    ctx.remote.featuredPlugins.bulkInstall = async () => ({
      ok: true,
      value: { outcomes: [{ id: 'dsh-feishu', result: refused }] },
    }) as never
    const controller = new FeaturedSectionController(ctx)
    const store = controller.inject().hooks.featuredSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    controller.bulkInstall()
    await waitFor(() => {
      expect(store.getSnapshot().confirm?.kind).toBe('risk')
      expect(store.getSnapshot().notice?.kind).toBe('failed')
      expect(store.getSnapshot().bulk).toBeUndefined()
    })
  })

  it('optimistically flips auto-update and rolls back on refusal', async () => {
    const ctx = fakeCtx()
    ctx.remote.featuredPlugins.setAutoUpdate = async () => ({ ok: false, error: { code: 'internal', message: 'no' } }) as never
    const controller = new FeaturedSectionController(ctx)
    const store = controller.inject().hooks.featuredSection
    await waitFor(() => { expect(store.getSnapshot().status).toBe('ready') })
    expect(store.getSnapshot().plugins[0]?.autoUpdate).toBe(true)
    controller.setAutoUpdate('dsh-feishu', false)
    expect(store.getSnapshot().plugins[0]?.autoUpdate).toBe(false)
    await waitFor(() => {
      expect(store.getSnapshot().plugins[0]?.autoUpdate).toBe(true)
      expect(store.getSnapshot().notice?.kind).toBe('failed')
    })
  })

  it('publishes the nav update signal when a loaded card has an update', async () => {
    const ctx = fakeCtx({
      list: async () => ({
        ok: true,
        value: {
          plugins: [card({ state: 'enabled', updateAvailable: true, installedVersion: '0.1.0', latestKnown: '0.2.0' })],
          revision: 2,
        },
      }),
    })
    const controller = new FeaturedSectionController(ctx)
    await waitFor(() => { expect(getFeaturedPluginsUpdateAvailable()).toBe(true) })
    ctx.remote.featuredPlugins.list = async () => ({
      ok: true,
      value: { plugins: [card({ state: 'enabled', updateAvailable: false })], revision: 3 },
    }) as never
    controller.reload()
    await waitFor(() => { expect(getFeaturedPluginsUpdateAvailable()).toBe(false) })
  })

  it('reports a failed load as status failed', async () => {
    const ctx = fakeCtx()
    ctx.remote.featuredPlugins.list = async () => ({ ok: false, error: { code: 'internal', message: 'transport down' } }) as never
    const controller = new FeaturedSectionController(ctx)
    const store = controller.inject().hooks.featuredSection
    await waitFor(() => {
      expect(store.getSnapshot().status).toBe('failed')
      expect(store.getSnapshot().notice?.text).toBe('transport down')
    })
  })
})

describe('FeaturedSection — 2026-10-06 问题 7/9 批 (推荐插件 + 卡片插件名)', () => {
  it('names every card with its plugin package id (问题 9)', () => {
    const { props } = harness(readyState([card()]))
    render(<FeaturedSection {...props} />)
    // The display name AND the plugin id both render: 飞书（Feishu）· dsh-feishu —
    // the customer installs by id, so the id must be visible on the card.
    const cardEl = screen.getByTestId('featured-card-dsh-feishu')
    expect(within(cardEl).getByText('Feishu')).toBeTruthy()
    expect(within(cardEl).getByTestId('featured-card-id').textContent).toBe('dsh-feishu')
  })

  it('renames the section 推荐插件 / Recommended plugins across the copy (问题 7)', async () => {
    const { zh, en } = await import('../src/client/locales.ts')
    expect(zh.nav).toBe('推荐插件')
    expect(zh.title).toBe('推荐插件')
    expect(zh.intro).toContain('推荐')
    expect(zh.loadFailed).toContain('推荐插件')
    expect(en.nav).toBe('Recommended plugins')
    expect(en.title).toBe('Recommended plugins')
  })
})
