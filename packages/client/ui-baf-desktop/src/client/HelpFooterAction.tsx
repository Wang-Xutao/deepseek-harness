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
  ShortcutKeys,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { openHelpExternal, resolveHelpDocsUrl } from './bridge.ts'
import { HelpLoadingMark } from './HelpLoadingMark.tsx'
import css from './HelpFooterAction.module.css'

/**
 * Plugin-level help state consumed by the trigger and the Ctrl+Alt+H command.
 * 【变更】2026-10-19 (主页面三改 2): the open flag moved from component state to
 * the apply()-level snapshot store so the 'help.open' shortcut resolver and
 * this trigger toggle the same panel.
 */
export interface HelpFooterInjected {
  readonly hooks: {
    readonly helpOpen: SnapshotStore<boolean>
    readonly shortcuts: ObservableSnapshot<readonly ShortcutCatalogEntry[]>
  }
  readonly toggleHelp: () => void
  readonly closeHelp: () => void
}

export type HelpFooterActionProps =
  PropsRuntime<'sidebar.footer.action'> & PropsLocale<'baf.desktop'> & InjectFace<HelpFooterInjected>

/**
 * Render the Help trigger and optional centered documentation panel.
 * @param props - sidebar footer action props.
 */
export function HelpFooterAction({ wide, t, useHelpOpen, useShortcuts, toggleHelp, closeHelp }: HelpFooterActionProps) {
  const open = useHelpOpen(value => value)
  // 【变更】2026-10-19 (主页面三改 2): the Ctrl+Alt+H row feeds the hover
  // tooltip (rail mode), the wide-mode keycap, and aria-keyshortcuts.
  const shortcut = useShortcuts(rows => rows.find(row => row.id === 'help.open'))
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
      if (e.key === 'Escape') closeHelp()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closeHelp])

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
      <div className={css.mask} aria-hidden="true" onClick={() => { closeHelp() }} />
      <aside
        className={css.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-shortcut-modal="help"
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
              onClick={() => { closeHelp() }}
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
            <div className={css.loading} aria-hidden="true">
              <HelpLoadingMark />
            </div>
          )}
        </div>
      </aside>
    </div>
  ) : null

  return (
    <div className={clsx(css.layer, !wide && css.rail)} data-testid="help-footer-action">
      {/* Rail mode explains the trigger through a hover tooltip that carries
          the chord; wide mode keeps the label and shows the keycap on hover. */}
      <Tooltip label={t('help.trigger')} shortcutKeys={shortcut?.keys} delayMs={500} disabled={wide}>
        <button
          type="button"
          className={css.trigger}
          data-active={open || undefined}
          aria-label={t('help.trigger')}
          aria-keyshortcuts={shortcut?.aria}
          aria-expanded={open}
          onClick={() => { toggleHelp() }}
        >
          <IconQuestionOutline14 size={wide ? 16 : 18} />
          {wide ? <span className={css.triggerLabel}>{t('help.trigger')}</span> : null}
          {wide && shortcut !== undefined && shortcut.keys.length > 0 && (
            <span className={css.triggerShortcut} aria-hidden="true">
              <ShortcutKeys keys={shortcut.keys} />
            </span>
          )}
        </button>
      </Tooltip>
      {panel !== null && typeof document !== 'undefined'
        ? createPortal(panel, document.body)
        : null}
    </div>
  )
}
