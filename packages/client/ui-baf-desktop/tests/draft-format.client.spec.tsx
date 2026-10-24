// @vitest-environment jsdom
/**
 * Composer tidy-up control: the deterministic Markdown arrangement of a
 * draft, and the control's two states over the composer input machine.
 */

import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { DraftFormatButton } from '../src/client/DraftFormatButton.tsx'
import { formatDraft } from '../src/client/draft-format.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/** The draft fields the control reads. */
interface DraftState {
  readonly draft: string
  readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
  readonly occurrences: readonly unknown[]
}

const store: SnapshotStore<DraftState> = createSnapshotStore<DraftState>({
  draft: '',
  phase: 'plain',
  occurrences: [],
})

/**
 * Bind the snapshot store to the selector hook the composer seat delivers.
 * @param selector - the field the control reads.
 * @returns the selected value.
 */
function useInput(selector: (state: DraftState) => unknown): unknown {
  return useSyncExternalStore(
    onChange => store.subscribe(onChange),
    () => selector(store.getSnapshot()),
  )
}

/** Translate a key through the package's own dictionary. */
function t(key: string): string {
  return zh[key as keyof typeof zh] ?? key
}

function renderControl(over?: { draft?: string; phase?: DraftState['phase']; references?: number }) {
  store.set({
    draft: over?.draft ?? '',
    phase: over?.phase ?? 'plain',
    occurrences: over?.references === undefined ? [] : [{}],
  })
  const setDraft = vi.fn()
  const props = { useInput, inputActions: { setDraft }, t } as never
  const view = render(<DraftFormatButton {...props} />)
  const button = view.container.querySelector<HTMLButtonElement>('[data-baf-draft-format]')
  if (button === null) throw new Error('the tidy-up control did not render')
  return { button, setDraft }
}

describe('draft Markdown arrangement', () => {
  it('leaves an empty draft and a single short sentence alone', () => {
    expect(formatDraft('')).toBe('')
    expect(formatDraft('帮我看下这个 bug')).toBe('帮我看下这个 bug')
  })

  it('splits a long paragraph into two-sentence paragraphs', () => {
    expect(formatDraft('第一句。第二句。第三句。')).toBe('第一句。第二句。\n\n第三句。')
  })

  it('turns separate complete sentences into bullet items', () => {
    expect(formatDraft('第一步。\n第二步。')).toBe('- 第一步。\n- 第二步。')
  })

  it('lifts a named enumeration into bullets and keeps the lead word', () => {
    expect(formatDraft('包括用户信息模块、权限模块、订单模块')).toBe(
      '包括：\n- 用户信息模块\n- 权限模块\n- 订单模块',
    )
  })

  it('lifts an English enumeration into bullets', () => {
    expect(formatDraft('including user module, permission module')).toBe(
      'including:\n- user module\n- permission module',
    )
  })

  it('leaves a single named item alone', () => {
    expect(formatDraft('包括一个模块')).toBe('包括一个模块')
  })

  it('fences an English error line', () => {
    expect(formatDraft("TypeError: cannot read property 'x'")).toBe(
      "```\nTypeError: cannot read property 'x'\n```",
    )
  })

  it('keeps a Chinese sentence with parentheses as prose', () => {
    expect(formatDraft('我调用了 foo()，返回 500')).toBe('我调用了 foo()，返回 500')
  })

  it('keeps a fenced code block as the author wrote it', () => {
    expect(formatDraft('```ts\nconst a = 1\n```')).toBe('```ts\nconst a = 1\n```')
  })

  it('keeps a heading level from skipping one', () => {
    expect(formatDraft('# 标题\n\n### 子标题')).toBe('# 标题\n\n## 子标题')
  })

  it('keeps a list and a quote as the author wrote them', () => {
    expect(formatDraft('- 一\n- 二')).toBe('- 一\n- 二')
    expect(formatDraft('> 引用')).toBe('> 引用')
  })

  it('normalizes line endings, trailing spaces, and repeated blank lines', () => {
    expect(formatDraft('第一句。  \r\n\r\n\r\n第二句。')).toBe('第一句。\n\n第二句。')
  })

  it('keeps a table as the author wrote it', () => {
    const table = '| a | b |\n| --- | --- |\n| 1 | 2 |'
    expect(formatDraft(table)).toBe(table)
  })

  it('keeps a thematic break and a quoted line as the author wrote them', () => {
    expect(formatDraft('---')).toBe('---')
    expect(formatDraft('> 引用\n> 续行')).toBe('> 引用\n> 续行')
  })

  it('keeps an indented continuation with its list', () => {
    expect(formatDraft('- 一\n  续行')).toBe('- 一\n  续行')
  })

  it('keeps an indented continuation with its quote', () => {
    expect(formatDraft('> 引用\n  续行')).toBe('> 引用\n  续行')
  })

  it('ends a list when plain prose follows it', () => {
    expect(formatDraft('- 一\n普通文字')).toBe('- 一\n\n普通文字')
  })

  it('leaves a delimiter row without a table header alone', () => {
    expect(formatDraft('文字\n| --- | --- |')).toBe('文字\n| --- | --- |')
  })

  it('keeps an unterminated fence as the author opened it', () => {
    expect(formatDraft('```ts\nconst a = 1')).toBe('```ts\nconst a = 1')
  })

  it('fences a Windows path', () => {
    expect(formatDraft('C:\\Users\\test\\file.ts')).toBe('```\nC:\\Users\\test\\file.ts\n```')
  })

  it('leaves a line that carries a fence marker as prose', () => {
    expect(formatDraft('看这里的 ``` 标记')).toBe('看这里的 ``` 标记')
  })

  it('keeps a long line and an unterminated line as prose', () => {
    const long = `${'一'.repeat(90)}。`
    expect(formatDraft(long)).toBe(long)
    expect(formatDraft('没有句号的一行')).toBe('没有句号的一行')
    expect(formatDraft(`第一步。\n${long}`)).toBe(`第一步。\n${long}`)
  })

  it('fences a statement with code punctuation', () => {
    expect(formatDraft('const a = 1;')).toBe('```\nconst a = 1;\n```')
  })

  it('keeps a named enumeration that already carries its colon', () => {
    expect(formatDraft('包括：用户模块、权限模块')).toBe('包括：\n- 用户模块\n- 权限模块')
  })

  it('leaves an enumeration that spans two lines alone', () => {
    expect(formatDraft('包括：用户模块\n权限模块')).toBe('包括：用户模块\n权限模块')
  })

  it('keeps the sentence that precedes a named enumeration', () => {
    expect(formatDraft('系统很慢。包括用户模块、权限模块。')).toBe(
      '系统很慢。\n\n包括：\n- 用户模块\n- 权限模块。',
    )
  })

  it('splits a paragraph that runs past the paragraph length', () => {
    const first = `${'一'.repeat(150)}。`
    const second = `${'二'.repeat(80)}。`
    expect(formatDraft(`${first}${second}`)).toBe(`${first}\n\n${second}`)
  })

  it('drops a blank line at either end of the draft', () => {
    expect(formatDraft('\n第一句。\n\n')).toBe('第一句。')
  })
})

describe('composer tidy-up control', () => {
  it('arranges the draft and then reverts to the author\'s wording', () => {
    const { button, setDraft } = renderControl({ draft: '第一步。\n第二步。' })

    expect(button.getAttribute('data-baf-draft-format')).toBe('format')
    fireEvent.click(button)
    expect(setDraft).toHaveBeenCalledWith('- 第一步。\n- 第二步。')
    expect(button.getAttribute('data-baf-draft-format')).toBe('revert')
    expect(button.getAttribute('aria-label')).toBe(t('draft.revert'))

    fireEvent.click(button)
    expect(setDraft).toHaveBeenLastCalledWith('第一步。\n第二步。')
    expect(button.getAttribute('data-baf-draft-format')).toBe('format')
  })

  it('answers that the draft is already structured instead of rewriting it', () => {
    vi.useFakeTimers()
    try {
      const { button, setDraft } = renderControl({ draft: '帮我看下这个 bug' })

      fireEvent.click(button)
      expect(setDraft).not.toHaveBeenCalled()
      expect(button.getAttribute('data-baf-draft-format-flash')).toBe('unchanged')

      // A second press while the answer still shows restarts it.
      fireEvent.click(button)
      expect(setDraft).not.toHaveBeenCalled()

      act(() => { vi.advanceTimersByTime(1800) })
      expect(button.getAttribute('data-baf-draft-format-flash')).toBeNull()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('releases the pending answer when the control leaves the page', () => {
    vi.useFakeTimers()
    try {
      const { button } = renderControl({ draft: '帮我看下这个 bug' })
      fireEvent.click(button)
      expect(button.getAttribute('data-baf-draft-format-flash')).toBe('unchanged')
      cleanup()
      expect(vi.getTimerCount()).toBe(0)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('refuses a draft that holds file references', () => {
    const { button, setDraft } = renderControl({ draft: '看下这个文件', references: 1 })

    expect(button.getAttribute('data-baf-draft-format-blocked')).toBe('true')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(setDraft).not.toHaveBeenCalled()
  })

  it('stays unavailable while the draft is empty or the machine is not plain', () => {
    const empty = renderControl({ draft: '   ' })
    expect(empty.button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(empty.button)
    expect(empty.setDraft).not.toHaveBeenCalled()
    cleanup()

    const claimed = renderControl({ draft: '第一步。', phase: 'claimed' })
    expect(claimed.button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(claimed.button)
    expect(claimed.setDraft).not.toHaveBeenCalled()
  })

  it('reports that the draft changed after the tidy-up', () => {
    const { button } = renderControl({ draft: '第一步。\n第二步。' })

    fireEvent.click(button)
    expect(button.getAttribute('data-baf-draft-format-dirty')).toBe('true')

    act(() => { store.set({ draft: '- 第一步。\n- 第二步。', phase: 'plain', occurrences: [] }) })
    expect(button.getAttribute('data-baf-draft-format-dirty')).toBeNull()
  })

  it('keeps the caret in the draft when the control is pressed', () => {
    const { button } = renderControl({ draft: '第一步。\n第二步。' })

    // fireEvent reports false once the event's default was prevented.
    expect(fireEvent.mouseDown(button)).toBe(false)
  })
})
