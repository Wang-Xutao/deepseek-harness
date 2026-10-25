// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSettingsShellStore } from '../src/client/shell-store.ts'
import { SidebarUpdateTag, type SidebarUpdateTagProps } from '../src/client/SidebarUpdateTag.tsx'
import { en, zh } from '../src/client/locales.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
// The tag reads no global fact; the hooks only ride the standard props share.
const neverHook = (() => { throw new Error('the update tag must not read global hooks') }) as never

afterEach(() => {
  cleanup()
  delete (window as { bafDesktop?: unknown }).bafDesktop
})

/** Stub the shell bridge so the update fact reads a known check result. */
function stubBridge(status: string | null): void {
  ;(window as { bafDesktop?: unknown }).bafDesktop = {
    isDesktop: true,
    getLastCheckResult: async () => (status === null ? null : { status }),
    onCheckResult: () => () => {},
  }
}

function mount(dictionary: typeof zh | typeof en = zh) {
  const shell = createSettingsShellStore().create()
  const props: SidebarUpdateTagProps = {
    useStore: bindSnapshotSelector(shell),
    actions: shell.actions,
    t: makeTranslate(dictionary),
    useSessions: neverHook,
    useSessionStatus: neverHook,
    useSessionRetainInfo: neverHook,
    usePanelInfo,
    useResource,
    useWorkspaces: neverHook,
    ...allowAllAccess,
  }
  const view = render(<SidebarUpdateTag {...props} />)
  return { view, shell }
}

// 【变更】2026-10-26 (批次二十七 1): the chip moved from the end of the
// Settings trigger to the sidebar's brand row, right of the version capsule.
// It still opens the 版本与更新 page — through the shell's own store.
describe('SidebarUpdateTag', () => {
  it('renders no chip while the shell reports no pending update', async () => {
    stubBridge('up-to-date')
    mount()
    await Promise.resolve()
    expect(screen.queryByTestId('sidebar-update-tag')).toBeNull()
  })

  it('renders no chip outside the desktop shell', async () => {
    mount()
    await Promise.resolve()
    expect(screen.queryByTestId('sidebar-update-tag')).toBeNull()
  })

  it('shows the localized chip and opens 版本与更新 through the shell store', async () => {
    stubBridge('available')
    const { shell } = mount(zh)
    const tag = await screen.findByTestId('sidebar-update-tag')
    expect(tag.textContent).toContain('更新')
    expect(tag.getAttribute('aria-label')).toBe('有新版本，点击打开「版本与更新」')
    fireEvent.click(tag)
    expect(shell.getSnapshot()).toEqual({ open: true, activeId: 'version-updates' })
  })

  it('carries the English label', async () => {
    stubBridge('available')
    mount(en)
    const tag = await screen.findByTestId('sidebar-update-tag')
    expect(tag.textContent).toContain('Update')
  })
})
