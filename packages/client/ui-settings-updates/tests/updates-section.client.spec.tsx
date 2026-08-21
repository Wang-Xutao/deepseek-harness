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
const kit = { useSessions: unusedHook, useWorkspaces: unusedHook, close: vi.fn() }

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

  it('loads versions and checks for updates on desktop', async () => {
    const bridge: BafDesktopBridge = {
      isDesktop: true,
      getPrefs: async () => ({ closeAction: 'ask' }),
      setPrefs: async p => ({ closeAction: p.closeAction ?? 'ask' }),
      getVersions: async () => ({ bafDsh: '0.0.3', dsh: '0.1.0-rc.8', bafPlugin: '0.0.1' }),
      checkForUpdate: async () => ({
        status: 'up-to-date',
        versions: { bafDsh: '0.0.3', dsh: '0.1.0-rc.8', bafPlugin: '0.0.1' },
        checkedAt: '2026-01-01T00:00:00.000Z',
      }),
      startUpdate: async () => ({
        ok: true,
        versions: { bafDsh: '0.0.3', dsh: '0.1.0-rc.8', bafPlugin: '0.0.1' },
      }),
      getLastCheckResult: async () => null,
      onUpdateProgress: () => () => {},
    }
    window.bafDesktop = bridge
    render(<UpdatesSection {...kit} t={t as never} />)
    await waitFor(() => {
      expect(screen.getByText('0.0.3')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'check' }))
    await waitFor(() => {
      expect(screen.getByText('upToDate')).toBeTruthy()
    })
  })
})
