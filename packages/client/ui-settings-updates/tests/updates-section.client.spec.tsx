// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UpdatesSection } from '../src/client/UpdatesSection.tsx'
import type { BafDesktopBridge } from '../src/client/bridge.ts'
import { readBridge } from '../src/client/bridge.ts'

function t(key: string): string {
  return key
}

const unusedHook = (() => { throw new Error('unused') }) as never
const kit = {
  useSessions: unusedHook,
  useSessionPendingInteraction: unusedHook,
  useWorkspaces: unusedHook,
  close: vi.fn(),
}

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

  it('hides Update until a check finds an available plan', async () => {
    const bridge: BafDesktopBridge = {
      isDesktop: true,
      getPrefs: async () => ({ closeAction: 'ask' }),
      setPrefs: async p => ({ closeAction: p.closeAction ?? 'ask' }),
      getVersions: async () => ({
        bafDsh: '0.0.8',
        dsh: '0.1.3-alpha.1',
        bafCore: '0.1.0',
        bafWorkflow: '0.1.0',
        bafDshNotes: 'desktop notes',
        dshNotes: 'dsh notes',
        bafCoreNotes: 'core notes',
        bafWorkflowNotes: 'workflow notes',
      }),
      checkForUpdate: async () => ({
        status: 'available',
        versions: {
          bafDsh: '0.0.8',
          dsh: '0.1.3-alpha.1',
          bafCore: '0.1.0',
          bafWorkflow: '0.1.0',
        },
        plan: {
          summaryZh: '壳 0.0.8 → 0.0.9',
          force: false,
          targetBafDsh: '0.0.9',
          notesZh: 'bug fixes',
        },
        checkedAt: '2026-01-01T00:00:00.000Z',
      }),
      startUpdate: async () => ({
        ok: true,
        versions: {
          bafDsh: '0.0.9',
          dsh: '0.1.3-alpha.1',
          bafCore: '0.1.0',
          bafWorkflow: '0.1.0',
        },
      }),
      getLastCheckResult: async () => null,
      onUpdateProgress: () => () => {},
    }
    window.bafDesktop = bridge
    render(<UpdatesSection {...kit} t={t as never} />)
    await waitFor(() => {
      expect(screen.getByText('0.0.8')).toBeTruthy()
      expect(screen.getByText('desktop notes')).toBeTruthy()
      expect(screen.getByText('packagesHeading')).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: 'update' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'check' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'update' })).toBeTruthy()
      expect(screen.getByTestId('update-available-card')).toBeTruthy()
      expect(screen.getByText('0.0.9')).toBeTruthy()
      expect(screen.getByText('bug fixes')).toBeTruthy()
    })
  })
})
