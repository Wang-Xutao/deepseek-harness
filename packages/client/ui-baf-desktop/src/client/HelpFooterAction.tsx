/**
 * Sidebar foot "Help" action with a centered MkDocs documentation panel.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import {
  IconCloseOutlineMedium as IconCloseOutline16,
  IconLinkOutlineMedium as IconLinkOutline16,
  IconQuestionOutlineMedium as IconQuestionOutline14,
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
  const [iframeLoaded, setIframeLoaded] = useState(false)
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

  // Reset the loaded flag every time the panel mounts: a fresh iframe is a
  // new fetch, and an unmounted iframe (closing the panel) leaves the next
  // mount with a stale "loaded" signal that would otherwise skip the
  // skeleton and flash the panel's first paint.
  useEffect(() => {
    if (!open) return
    setIframeLoaded(false)
  }, [open])

  // The help site's own `embedded.js` adds `html.baf-embedded` when running
  // inside an iframe, but it fires before stylesheets finish loading and a
  // race can leave the layout at the desktop (full-page) defaults on first
  // paint. Force the class from this side on every iframe load — the JS
  // fallback inside the help page only matters for cross-origin schemes
  // (file://, dsh-app://) where the renderer cannot read the iframe DOM.
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const applyEmbeddedClass = useCallback((): void => {
    const frame = frameRef.current
    if (frame === null) return
    let doc: Document | null = null
    try {
      doc = frame.contentDocument ?? frame.contentWindow?.document ?? null
    }
    catch {
      // Cross-origin or sandboxed frame: the embedded.js inside the help
      // page is the only fallback (used for file:// and dsh-app:// schemes).
      return
    }
    if (doc === null) return
    doc.documentElement.classList.add('baf-embedded')
    doc.documentElement.lang = 'zh-CN'
  }, [])

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
            ref={frameRef}
            className={css.frame}
            title={t('help.title')}
            src={helpUrl}
            referrerPolicy="no-referrer"
            data-loaded={iframeLoaded || undefined}
            onLoad={() => {
              setIframeLoaded(true)
              applyEmbeddedClass()
            }}
          />
          {iframeLoaded ? null : (
            <div className={css.skeleton} aria-hidden="true">
              <div className={css.skeletonBar} style={{ width: '40%' }} />
              <div className={css.skeletonBar} style={{ width: '70%' }} />
              <div className={css.skeletonBar} style={{ width: '55%' }} />
              <div className={css.skeletonBar} style={{ width: '85%' }} />
              <div className={css.skeletonBar} style={{ width: '45%' }} />
              <div className={css.skeletonBar} style={{ width: '65%' }} />
            </div>
          )}
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
