// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DesktopClosePrefs } from '../src/client/DesktopClosePrefs.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  delete window.bafDesktop
})

const unusedHook = (() => { throw new Error('unused') }) as never
const kit = { useSessions: unusedHook, useWorkspaces: unusedHook, close: vi.fn() }
const t = (key: string) => (en as Record<string, string>)[key] ?? key

describe('DesktopClosePrefs', () => {
  it('renders nothing without the desktop bridge', () => {
    render(<DesktopClosePrefs {...kit} t={t as never} />)
    expect(screen.queryByTestId('desktop-close-prefs')).toBeNull()
  })

  it('loads bridge and selects via Menu like other general rows', async () => {
    const getPrefs = vi.fn(async () => ({ closeAction: 'ask' as const }))
    const setPrefs = vi.fn(async (prefs: { closeAction?: 'ask' | 'tray' | 'quit' }) => ({
      closeAction: prefs.closeAction ?? 'ask',
    }))
    window.bafDesktop = {
      isDesktop: true,
      getPrefs,
      setPrefs,
      getVersions: async () => ({ bafDsh: '0.0.3', dsh: '0.1.0-rc.8', bafPlugin: '0.0.1' }),
      checkForUpdate: async () => ({
        status: 'up-to-date',
        versions: { bafDsh: '0.0.3', dsh: '0.1.0-rc.8', bafPlugin: '0.0.1' },
        checkedAt: '',
      }),
      startUpdate: async () => ({ ok: true, versions: { bafDsh: '0.0.3', dsh: '0.1.0-rc.8', bafPlugin: '0.0.1' } }),
      getLastCheckResult: async () => null,
      onUpdateProgress: () => () => {},
    } as NonNullable<Window['bafDesktop']>

    render(<DesktopClosePrefs {...kit} t={t as never} />)
    expect(await screen.findByTestId('desktop-close-prefs')).toBeTruthy()
    await waitFor(() => expect(getPrefs).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'When closing the window' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Minimize to tray' }))
    expect(setPrefs).toHaveBeenCalledWith({ closeAction: 'tray' })
  })
})
