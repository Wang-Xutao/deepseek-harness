/**
 * Sidebar foot "Help" action with a centered MkDocs documentation panel.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import {
  IconCloseOutline16,
  IconLinkOutline16,
  IconQuestionOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { openHelpExternal, resolveHelpDocsUrl } from './bridge.ts'
import css from './HelpFooterAction.module.css'

export type HelpFooterActionProps =
  PropsRuntime<'sidebar.footer.action'> & PropsLocale<'baf.desktop'>

/**
 * Render the Help trigger and optional centered documentation panel.
 * @param props - sidebar footer action props.
 */
export function HelpFooterAction({ wide, t }: HelpFooterActionProps) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const helpUrl = resolveHelpDocsUrl()

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const panel = open ? (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={() => { setOpen(false) }} />
      <aside
        className={css.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={css.header}>
          <div className={css.headerLead}>
            <span className={css.headerIcon} aria-hidden="true">
              <IconQuestionOutline14 size={16} />
            </span>
            <h2 className={css.title} id={titleId}>{t('help.title')}</h2>
          </div>
          <div className={css.headerActions}>
            <button
              type="button"
              className={css.openBrowser}
              onClick={() => { openHelpExternal(helpUrl) }}
            >
              <IconLinkOutline16 size={14} />
              <span>{t('help.openBrowser')}</span>
            </button>
            <button
              ref={closeRef}
              type="button"
              className={css.close}
              aria-label={t('help.close')}
              onClick={() => { setOpen(false) }}
            >
              <IconCloseOutline16 size={14} />
            </button>
          </div>
        </header>
        <div className={css.body}>
          <iframe
            className={css.frame}
            title={t('help.title')}
            src={helpUrl}
            referrerPolicy="no-referrer"
          />
        </div>
      </aside>
    </div>
  ) : null

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
      {panel !== null && typeof document !== 'undefined'
        ? createPortal(panel, document.body)
        : null}
    </div>
  )
}
