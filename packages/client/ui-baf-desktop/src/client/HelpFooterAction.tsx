/**
 * Sidebar foot "Help" action with a right-docked MkDocs placeholder panel.
 */
import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { IconCloseOutline16, IconQuestionOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './HelpFooterAction.module.css'

export type HelpFooterActionProps =
  PropsRuntime<'sidebar.footer.action'> & PropsLocale<'baf.desktop'>

/**
 * Render the Help trigger and optional right-side documentation placeholder.
 * @param props - sidebar footer action props.
 */
export function HelpFooterAction({ wide, t }: HelpFooterActionProps) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  return (
    <div className={clsx(css.layer, !wide && css.rail)} data-testid="help-footer-action">
      <button
        type="button"
        className={css.trigger}
        data-active={open || undefined}
        aria-expanded={open}
        onClick={() => { setOpen(v => !v) }}
      >
        <IconQuestionOutline14 size={wide ? 16 : 18} />
        {wide ? <span className={css.triggerLabel}>{t('help.trigger')}</span> : null}
      </button>
      {open ? (
        <div className={css.overlay} role="presentation">
          <div className={css.mask} aria-hidden="true" onClick={() => { setOpen(false) }} />
          <aside className={css.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <header className={css.header}>
              <h2 className={css.title} id={titleId}>{t('help.title')}</h2>
              <button
                ref={closeRef}
                type="button"
                className={css.close}
                aria-label={t('help.close')}
                onClick={() => { setOpen(false) }}
              >
                <IconCloseOutline16 size={14} />
              </button>
            </header>
            <div className={css.body}>
              <p className={css.placeholder}>{t('help.placeholder')}</p>
              <div className={css.docFrame} aria-hidden="true">
                <div className={css.docNav}>MkDocs</div>
                <div className={css.docMain}>
                  <div className={css.docLine} />
                  <div className={css.docLine} />
                  <div className={css.docLineShort} />
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
