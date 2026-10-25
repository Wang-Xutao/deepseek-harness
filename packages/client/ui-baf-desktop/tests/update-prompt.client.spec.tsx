// @vitest-environment jsdom
/**
 * The in-app update prompt.
 *
 * 【变更】2026-10-25 (批次二十六 4): the shell used to raise the operating
 * system's message box; the app draws its own dialog now. These cases pin the
 * two variants apart — the optional one can be dismissed, the required one
 * cannot — and the note paragraphs the user reads.
 */

import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { UpdatePromptDialog } from '../src/client/UpdatePromptDialog.tsx'
import { UpdatePromptController, parseUpdatePrompt, type UpdatePromptState } from '../src/client/update-prompt.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/**
 * Translate a key through the package's own dictionary.
 * @param key - the dictionary key.
 * @param params - the template parameters.
 * @returns the translated text.
 */
function t(key: string, params?: Record<string, unknown>): string {
  const template = zh[key as keyof typeof zh] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/**
 * Render the prompt over a controller.
 * @param controller - the controller that holds the prompt.
 * @param actions - the actions the overlay entry binds.
 * @returns the rendered view.
 */
function renderPrompt(
  controller: UpdatePromptController,
  actions: { applyUpdate?: () => void; later?: () => void; quit?: () => void } = {},
) {
  const useUpdatePrompt = (selector: (state: UpdatePromptState) => unknown): unknown =>
    useSyncExternalStore(
      onChange => controller.store.subscribe(onChange),
      () => selector(controller.store.getSnapshot()),
    )
  const props = {
    useUpdatePrompt,
    applyUpdate: actions.applyUpdate ?? vi.fn(),
    later: actions.later ?? vi.fn(),
    quit: actions.quit ?? vi.fn(),
    t,
  } as never
  return render(<UpdatePromptDialog {...props} />)
}

describe('the in-app update prompt', () => {
  it('shows nothing while the shell has not asked for a prompt', () => {
    renderPrompt(new UpdatePromptController())
    expect(screen.queryByTestId('update-prompt')).toBeNull()
  })

  it('names an optional update and lists the points as paragraphs', () => {
    const controller = new UpdatePromptController()
    renderPrompt(controller)
    act(() => {
      controller.show({
        id: 'p1',
        required: false,
        summaryZh: 'harness: 桌面 0.0.50 → 0.0.51',
        notesZh: '第一点\n第二点\n第三点',
        targetVersion: '0.0.51',
      })
    })

    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('发现新版本')
    const notes = screen.getByTestId('update-prompt-notes').querySelectorAll('li')
    expect([...notes].map(li => li.textContent)).toEqual(['第一点', '第二点', '第三点'])
    expect(screen.getByTestId('update-prompt-summary').textContent).toContain('0.0.51')
  })

  it('offers 立即更新 and 稍后更新 on an optional update', () => {
    const controller = new UpdatePromptController()
    renderPrompt(controller)
    act(() => {
      controller.show({
        id: 'p2', required: false, summaryZh: 'summary', notesZh: '', targetVersion: '0.0.51',
      })
    })

    expect(screen.getByTestId('update-prompt-apply').textContent).toBe('立即更新')
    expect(screen.getByTestId('update-prompt-later').textContent).toBe('稍后更新')
    expect(screen.queryByTestId('update-prompt-quit')).toBeNull()
  })

  it('refuses every dismissal on a required update', () => {
    const controller = new UpdatePromptController()
    const later = vi.fn()
    const quit = vi.fn()
    renderPrompt(controller, { later, quit })
    act(() => {
      controller.show({
        id: 'p3', required: true, summaryZh: '强制安全更新，需要安装器', notesZh: '', targetVersion: '0.0.52',
      })
    })

    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('必须更新后才能继续使用')
    // The close button is gone, and Escape has nowhere to go.
    expect(document.querySelector('button[aria-label="关闭更新提示"]')).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(later).not.toHaveBeenCalled()
    expect(screen.getByTestId('update-prompt-quit').textContent).toBe('退出应用')
  })

  it('answers the apply, later and quit actions', () => {
    const controller = new UpdatePromptController()
    const applyUpdate = vi.fn()
    const later = vi.fn()
    const quit = vi.fn()
    renderPrompt(controller, { applyUpdate, later, quit })
    act(() => {
      controller.show({
        id: 'p4', required: false, summaryZh: 'summary', notesZh: '', targetVersion: '0.0.51',
      })
    })
    fireEvent.click(screen.getByTestId('update-prompt-apply'))
    fireEvent.click(screen.getByTestId('update-prompt-later'))
    expect(applyUpdate).toHaveBeenCalledTimes(1)
    expect(later).toHaveBeenCalledTimes(1)

    act(() => {
      controller.show({
        id: 'p5', required: true, summaryZh: 'summary', notesZh: '', targetVersion: '0.0.52',
      })
    })
    fireEvent.click(screen.getByTestId('update-prompt-quit'))
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('shows the failure of an apply attempt in place', () => {
    const controller = new UpdatePromptController()
    renderPrompt(controller)
    act(() => {
      controller.show({
        id: 'p6', required: false, summaryZh: 'summary', notesZh: '', targetVersion: '0.0.51',
      })
      controller.setError('校验失败：baf-dsh-Setup-0.0.51.exe')
    })

    expect(screen.getByTestId('update-prompt-error').textContent).toContain('校验失败')
  })
})

describe('the prompt payload from the shell', () => {
  it('reads the facts the shell sends', () => {
    const parsed = parseUpdatePrompt({
      id: 'p7', required: true, summaryZh: 's', notesZh: 'n', targetVersion: '0.0.52',
    })
    expect(parsed).toEqual({ id: 'p7', required: true, summaryZh: 's', notesZh: 'n', targetVersion: '0.0.52' })
  })

  it('ignores a payload that is not a prompt', () => {
    expect(parseUpdatePrompt(undefined)).toBeUndefined()
    expect(parseUpdatePrompt(null)).toBeUndefined()
    expect(parseUpdatePrompt('nope')).toBeUndefined()
    expect(parseUpdatePrompt({ summaryZh: 's' })).toBeUndefined()
  })

  it('fills the optional facts when the shell omits them', () => {
    expect(parseUpdatePrompt({ id: 'p8' })).toEqual({
      id: 'p8', required: false, summaryZh: '', notesZh: '', targetVersion: '',
    })
  })
})
