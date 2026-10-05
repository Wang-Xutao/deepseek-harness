// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { UpdatesSection } from '../src/client/UpdatesSection.tsx'
import type { BafDesktopBridge, CheckUpdateResult } from '../src/client/bridge.ts'
import { readBridge } from '../src/client/bridge.ts'

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

const VERSIONS = {
  bafDsh: '0.0.8',
  dsh: '0.1.3-alpha.1',
  bafCore: '0.1.0',
  bafWorkflow: '0.1.0',
} as const

const AVAILABLE: CheckUpdateResult = {
  status: 'available',
  versions: { ...VERSIONS },
  plan: {
    summaryZh: '壳 0.0.8 → 0.0.9',
    force: false,
    targetBafDsh: '0.0.9',
    notesZh: 'bug fixes',
  },
  checkedAt: '2026-01-01T00:00:00.000Z',
}

afterEach(() => {
  cleanup()
  delete (window as { bafDesktop?: unknown }).bafDesktop
})

describe('readBridge', () => {
  it('returns undefined without desktop bridge', () => {
    delete (window as { bafDesktop?: unknown }).bafDesktop
    expect(readBridge()).toBeUndefined()
  })
})

describe('UpdatesSection', () => {
  it('shows desktop-only copy on the web', () => {
    delete (window as { bafDesktop?: unknown }).bafDesktop
    render(<UpdatesSection {...kit} t={t as never} />)
    expect(screen.getByTestId('updates-section-web')).toBeTruthy()
    expect(screen.getByText('desktopOnly')).toBeTruthy()
  })

  it('explains each BAF package in plain language under its name', async () => {
    const bridge: BafDesktopBridge = {
      isDesktop: true,
      getPrefs: async () => ({ closeAction: 'ask' }),
      setPrefs: async p => ({ closeAction: p.closeAction ?? 'ask' }),
      getVersions: async () => ({ ...VERSIONS, bafCore: '0.1.0', bafWorkflow: '0.1.0' }),
      checkForUpdate: async () => AVAILABLE,
      startUpdate: async () => ({ ok: true, versions: { ...VERSIONS } }),
      getLastCheckResult: async () => ({
        status: 'up-to-date',
        versions: { ...VERSIONS },
        checkedAt: new Date().toISOString(),
      }),
      onUpdateProgress: () => () => {},
    }
    window.bafDesktop = bridge
    render(<UpdatesSection {...kit} t={t as never} />)
    // 【变更】2026-10-05 (插件包说明): every package row carries a static
    // plain-language description — what the package DOES — under its name,
    // independent of the release notes the bridge may hand.
    await waitFor(() => {
      expect(screen.getByText('packagesHint')).toBeTruthy()
    })
    for (const key of [
      'descBafCore', 'descBafWorkflow', 'descBafOpenspec', 'descBafStandard',
      'descBafQuality', 'descBafGuard', 'descBafScaffold',
    ]) {
      const desc = screen.getByText(key)
      // The description sits inside its package's row, under the name label
      // (identity t renders the label key, not the literal package name).
      const row = desc.closest('li')
      expect(row).toBeTruthy()
      expect(row?.textContent).toContain('labelBaf')
    }
  })

  it('renders multi-line notes as one paragraph per line', async () => {
    const bridge: BafDesktopBridge = {
      isDesktop: true,
      getPrefs: async () => ({ closeAction: 'ask' }),
      setPrefs: async p => ({ closeAction: p.closeAction ?? 'ask' }),
      getVersions: async () => ({
        ...VERSIONS,
        bafDshNotes: 'demo33 四问题批次\n① 账本双命名\n② checklist 中文检查项',
      }),
      checkForUpdate: async () => AVAILABLE,
      startUpdate: async () => ({ ok: true, versions: { ...VERSIONS } }),
      // A fresh retained result keeps the auto-check quiet for this test.
      getLastCheckResult: async () => ({
        status: 'up-to-date',
        versions: { ...VERSIONS },
        checkedAt: new Date().toISOString(),
      }),
      onUpdateProgress: () => () => {},
    }
    window.bafDesktop = bridge
    render(<UpdatesSection {...kit} t={t as never} />)
    await waitFor(() => {
      expect(screen.getByText('demo33 四问题批次')).toBeTruthy()
    })
    expect(screen.getByText('① 账本双命名')).toBeTruthy()
    expect(screen.getByText('② checklist 中文检查项')).toBeTruthy()
  })

  it('auto-checks silently when no retained result exists', async () => {
    const checkForUpdate = vi.fn(async () => AVAILABLE)
    const bridge: BafDesktopBridge = {
      isDesktop: true,
      getPrefs: async () => ({ closeAction: 'ask' }),
      setPrefs: async p => ({ closeAction: p.closeAction ?? 'ask' }),
      getVersions: async () => ({ ...VERSIONS }),
      checkForUpdate,
      startUpdate: async () => ({ ok: true, versions: { ...VERSIONS } }),
      getLastCheckResult: async () => null,
      onUpdateProgress: () => () => {},
    }
    window.bafDesktop = bridge
    render(<UpdatesSection {...kit} t={t as never} />)
    // 【变更】2026-10-04 (用户问题 3): the available card arrives without any
    // click — the silent auto-check feeds it.
    await waitFor(() => {
      expect(screen.getByTestId('update-available-card')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'update' })).toBeTruthy()
      expect(screen.getByText('0.0.9')).toBeTruthy()
    })
    expect(checkForUpdate).toHaveBeenCalledTimes(1)
  })

  it('keeps a fresh retained result and only checks on demand', async () => {
    const checkForUpdate = vi.fn(async () => AVAILABLE)
    const bridge: BafDesktopBridge = {
      isDesktop: true,
      getPrefs: async () => ({ closeAction: 'ask' }),
      setPrefs: async p => ({ closeAction: p.closeAction ?? 'ask' }),
      getVersions: async () => ({
        ...VERSIONS,
        bafDshNotes: 'desktop notes',
        dshNotes: 'dsh notes',
        bafCoreNotes: 'core notes',
        bafWorkflowNotes: 'workflow notes',
      }),
      checkForUpdate,
      startUpdate: async () => ({ ok: true, versions: { ...VERSIONS } }),
      getLastCheckResult: async () => ({
        status: 'up-to-date',
        versions: { ...VERSIONS },
        checkedAt: new Date().toISOString(),
      }),
      onUpdateProgress: () => () => {},
    }
    window.bafDesktop = bridge
    render(<UpdatesSection {...kit} t={t as never} />)
    await waitFor(() => {
      expect(screen.getByText('0.0.8')).toBeTruthy()
      expect(screen.getByText('desktop notes')).toBeTruthy()
      expect(screen.getByText('packagesHeading')).toBeTruthy()
    })
    expect(checkForUpdate).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'update' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'check' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'update' })).toBeTruthy()
      expect(screen.getByTestId('update-available-card')).toBeTruthy()
      expect(screen.getByText('0.0.9')).toBeTruthy()
      expect(screen.getByText('bug fixes')).toBeTruthy()
    })
  })

  it('places the check action above the version rows', async () => {
    const bridge: BafDesktopBridge = {
      isDesktop: true,
      getPrefs: async () => ({ closeAction: 'ask' }),
      setPrefs: async p => ({ closeAction: p.closeAction ?? 'ask' }),
      getVersions: async () => ({ ...VERSIONS }),
      checkForUpdate: async () => AVAILABLE,
      startUpdate: async () => ({ ok: true, versions: { ...VERSIONS } }),
      getLastCheckResult: async () => ({
        status: 'up-to-date',
        versions: { ...VERSIONS },
        checkedAt: new Date().toISOString(),
      }),
      onUpdateProgress: () => () => {},
    }
    window.bafDesktop = bridge
    render(<UpdatesSection {...kit} t={t as never} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'check' })).toBeTruthy()
    })
    const checkButton = screen.getByRole('button', { name: 'check' })
    const firstVersionRow = screen.getByText('0.0.8').closest('li')
    expect(firstVersionRow).toBeTruthy()
    // 【变更】2026-10-04 (用户问题 3): the actions block leads the page.
    expect(
      checkButton.compareDocumentPosition(firstVersionRow!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('refreshes from the onCheckResult push channel', async () => {
    let push: ((result: CheckUpdateResult) => void) | undefined
    const bridge: BafDesktopBridge = {
      isDesktop: true,
      getPrefs: async () => ({ closeAction: 'ask' }),
      setPrefs: async p => ({ closeAction: p.closeAction ?? 'ask' }),
      getVersions: async () => ({ ...VERSIONS }),
      checkForUpdate: async () => ({
        status: 'up-to-date',
        versions: { ...VERSIONS },
        checkedAt: new Date().toISOString(),
      }),
      startUpdate: async () => ({ ok: true, versions: { ...VERSIONS } }),
      getLastCheckResult: async () => ({
        status: 'up-to-date',
        versions: { ...VERSIONS },
        checkedAt: new Date().toISOString(),
      }),
      onUpdateProgress: () => () => {},
      onCheckResult: (cb) => {
        push = cb
        return () => { push = undefined }
      },
    }
    window.bafDesktop = bridge
    render(<UpdatesSection {...kit} t={t as never} />)
    await waitFor(() => {
      expect(screen.getByText('0.0.8')).toBeTruthy()
    })
    expect(screen.queryByTestId('update-available-card')).toBeNull()
    push?.(AVAILABLE)
    await waitFor(() => {
      expect(screen.getByTestId('update-available-card')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'update' })).toBeTruthy()
    })
  })
})
