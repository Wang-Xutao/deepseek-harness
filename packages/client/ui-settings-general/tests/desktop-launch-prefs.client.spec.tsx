// @vitest-environment jsdom
// 【变更】2026-10-06 (问题 2): the 开机自启动 switch — bridge-gated like the
// close-pref row, and its toggle patches ONLY launchAtLogin over IPC.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DesktopLaunchPrefs } from '../src/client/DesktopLaunchPrefs.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  delete window.bafDesktop
})

const unusedHook = (() => { throw new Error('unused') }) as never
const kit = {
  useResource: unusedHook,
  useSessions: unusedHook,
  useSessionPendingInteraction: unusedHook,
  useWorkspaces: unusedHook,
  close: vi.fn(),
}
const t = (key: string) => (en as Record<string, string>)[key] ?? key

function withBridge(getPrefs: () => Promise<{ launchAtLogin?: boolean }>): ReturnType<typeof vi.fn> {
  const setPrefs = vi.fn(async (prefs: { launchAtLogin: boolean }) => ({ ...prefs }))
  window.bafDesktop = {
    isDesktop: true, getPrefs, setPrefs,
  } as unknown as NonNullable<Window['bafDesktop']>
  return setPrefs
}

describe('DesktopLaunchPrefs', () => {
  it('renders nothing without the desktop bridge', () => {
    render(<DesktopLaunchPrefs {...kit} t={t as never} />)
    expect(screen.queryByTestId('desktop-launch-prefs')).toBeNull()
  })

  it('stays off until the bridge answers, then toggles launchAtLogin', async () => {
    const setPrefs = withBridge(vi.fn(async () => ({ launchAtLogin: false })))
    render(<DesktopLaunchPrefs {...kit} t={t as never} />)
    const row = await screen.findByTestId('desktop-launch-prefs')
    const control = screen.getByRole('switch', { name: en['desktopLaunch.title'] })
    // Off from the bridge, and disabled until that answer lands.
    await waitFor(() => expect(control.getAttribute('aria-checked')).toBe('false'))
    expect(row.textContent).toContain(en['desktopLaunch.description'])
    fireEvent.click(control)
    await waitFor(() => expect(setPrefs).toHaveBeenCalledWith({ launchAtLogin: true }))
    expect(control.getAttribute('aria-checked')).toBe('true')
  })

  it('loads an already-enabled pref and turns it off', async () => {
    const setPrefs = withBridge(vi.fn(async () => ({ launchAtLogin: true })))
    render(<DesktopLaunchPrefs {...kit} t={t as never} />)
    const control = await screen.findByRole('switch', { name: en['desktopLaunch.title'] })
    await waitFor(() => expect(control.getAttribute('aria-checked')).toBe('true'))
    fireEvent.click(control)
    await waitFor(() => expect(setPrefs).toHaveBeenCalledWith({ launchAtLogin: false }))
  })

  it('flags a refused toggle without losing the row', async () => {
    const setPrefs = vi.fn(async () => { throw new Error('registry refused') })
    window.bafDesktop = {
      isDesktop: true,
      getPrefs: async () => ({ launchAtLogin: false }),
      setPrefs,
    } as unknown as NonNullable<Window['bafDesktop']>
    render(<DesktopLaunchPrefs {...kit} t={t as never} />)
    const control = await screen.findByRole('switch', { name: en['desktopLaunch.title'] })
    await waitFor(() => expect(control.getAttribute('aria-checked')).toBe('false'))
    fireEvent.click(control)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(en['desktopLaunch.error']))
  })
})
