// @vitest-environment jsdom
/**
 * The app-wide notice for a 「格式化输入」 run.
 *
 * 【变更】2026-10-25 (批次二十五 2): the outcome of a run must be visible
 * without hovering the control — the user reported the model path as
 * 「没有效果」, and a message that only lives in a hover tooltip reads exactly
 * like that. The notice therefore lives in the frame-wide overlay layer.
 */

import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { DraftFormatToast } from '../src/client/DraftFormatToast.tsx'
import { DraftFormatNoticeController, type DraftFormatNoticeState } from '../src/client/draft-format-notice.ts'
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
 * Render the overlay entry over a controller.
 * @param controller - the controller that holds the outcome.
 * @returns the rendered view.
 */
function renderToast(controller: DraftFormatNoticeController) {
  const useDraftFormatNotice = (selector: (state: DraftFormatNoticeState) => unknown): unknown =>
    useSyncExternalStore(
      onChange => controller.store.subscribe(onChange),
      () => selector(controller.store.getSnapshot()),
    )
  const props = {
    useDraftFormatNotice,
    dismiss: () => { controller.dismiss() },
    t,
  } as never
  return render(<DraftFormatToast {...props} />)
}

/** The alert node the toast renders into the document body. */
function alertText(): string | undefined {
  return document.querySelector('[role="alert"]')?.textContent ?? undefined
}

describe('the app-wide tidy-up notice', () => {
  it('shows nothing while no outcome is published', () => {
    renderToast(new DraftFormatNoticeController())
    expect(alertText()).toBeUndefined()
  })

  it('names the model that optimized the draft', () => {
    const controller = new DraftFormatNoticeController()
    renderToast(controller)
    act(() => { controller.publish('optimized', 'deepseek-chat') })

    expect(alertText()).toContain('已用 deepseek-chat 优化输入内容')
  })

  it('says that the local rules answered when no model did', () => {
    const controller = new DraftFormatNoticeController()
    renderToast(controller)
    act(() => { controller.publish('local') })

    expect(alertText()).toContain('模型未响应，已用本地规则整理结构')
  })

  it('says that the model found nothing to change', () => {
    const controller = new DraftFormatNoticeController()
    renderToast(controller)
    act(() => { controller.publish('same') })

    expect(alertText()).toContain('模型读过这段文字，认为无需调整')
  })

  it('says that the author changed the draft while the model worked', () => {
    const controller = new DraftFormatNoticeController()
    renderToast(controller)
    act(() => { controller.publish('changed') })

    expect(alertText()).toContain('整理期间草稿被修改')
  })

  it('leaves the notice when the toast reports it is done', () => {
    const controller = new DraftFormatNoticeController()
    renderToast(controller)
    act(() => { controller.publish('same') })
    expect(alertText()).toBeDefined()

    act(() => { controller.dismiss() })
    expect(alertText()).toBeUndefined()
  })
})
