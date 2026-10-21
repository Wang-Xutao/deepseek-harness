/**
 * 【变更】2026-10-20 (批次七 2.3/2.5): the SHARED enterprise-document viewer
 * pane — extracted from EnterpriseDocsCard so the 企业规范 flow chart and the
 * 质量监控 toolchain card render the SAME panel (like opening a file).
 * 【变更】2026-10-21 (批次八 3.2): the right-hand drawer becomes a FULL-SCREEN
 * modal — clearer for long documents. There is NO close button (customer
 * decision): clicking the blank scrim outside the document or pressing Escape
 * closes; the header keeps only the bilingual title + 打开文件.
 * 【变更】2026-10-22 (批次十一 4): the ready body renders the document as
 * MARKDOWN (the shared MarkdownText primitive the chat uses — headings,
 * lists, tables, code fences) instead of a verbatim `<pre>` dump. Plain-text
 * documents render unchanged (markdown degrades gracefully to paragraphs).
 */
import { useEffect, useMemo, useRef } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BafEnterpriseDocResult } from '../types.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import css from './StandardsOverview.module.css'

/** The doc viewer's payload state both cards render. */
export type DocViewer =
  | { readonly kind: 'loading'; readonly id: string }
  | { readonly kind: 'ready'; readonly result: Extract<BafEnterpriseDocResult, { status: 'ready' }> }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'unreadable'; readonly reason: string }

/** Derive the viewer state from the shared store fields. */
export function viewerOf(openId: string | undefined, doc: BafEnterpriseDocResult | undefined): DocViewer | undefined {
  if (openId === undefined) return undefined
  if (doc === undefined) return { kind: 'loading', id: openId }
  if (doc.status === 'ready') return { kind: 'ready', result: doc }
  if (doc.status === 'unknown') return { kind: 'unknown' }
  return { kind: 'unreadable', reason: doc.reason }
}

/** The full-screen document modal — the clicked document rendered as markdown. */
export function EnterpriseDocViewer({ viewer, t, onOpenFile, onClose }: {
  viewer: DocViewer
  t: StandardsPanelProps['t']
  /** Fire-and-forget open — the caller wraps the face's openPath itself. */
  onOpenFile: (path: string) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const title = viewer.kind === 'ready'
    ? `${viewer.result.titleZh} · ${viewer.result.titleEn}`
    : undefined
  // 批次十一 4: the markdown chrome copy rides the same locale seat the
  // panel uses; a stable object per t identity keeps MarkdownText's memo.
  const labels = useMemo<MarkdownLabels>(() => ({
    code: {
      copyLabel: t('mdCopy'),
      copiedLabel: t('mdCopied'),
      toolbarLabels: {
        codeLabel: t('mdCode'),
        wrapLabel: t('mdWrap'),
        unwrapLabel: t('mdUnwrap'),
      },
    },
    footnotes: t('mdFootnotes'),
  }), [t])

  // Escape is the keyboard route out (the visual route is the scrim); focus
  // lands on the dialog itself so the keystroke works without hunting.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  return (
    // The scrim is the ONLY close target — the click never reaches it from
    // the document panel (stopPropagation below).
    <div
      className={css.docModalScrim}
      data-testid="baf-enterprise-doc-scrim"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={css.docModal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="baf-enterprise-doc-viewer"
        onClick={(event) => { event.stopPropagation() }}
      >
        <div className={css.docViewerHead}>
          <span className={css.docViewerTitle}>{title}</span>
          <span className={css.titleActions}>
            {viewer.kind === 'ready' ? (
              <button
                type="button"
                className={css.miniButton}
                data-testid="baf-enterprise-doc-open-file"
                title={viewer.result.path}
                onClick={() => { onOpenFile(viewer.result.path) }}
              >
                {t('enterpriseDocOpenFile')}
              </button>
            ) : null}
          </span>
        </div>
        {viewer.kind === 'loading' ? (
          <div className={css.status}>{t('enterpriseDocLoading')}</div>
        ) : viewer.kind === 'ready' ? (
          // 批次十一 4: markdown rendering — the shared primitive the chat
          // bubbles use; the testid stays on the scrolling host.
          <div className={css.docBody} data-testid="baf-enterprise-doc-body">
            <MarkdownText text={viewer.result.content} labels={labels} />
          </div>
        ) : viewer.kind === 'unknown' ? (
          <div className={css.statusError}>{t('enterpriseDocUnknown')}</div>
        ) : (
          <div className={css.statusError}>{t('enterpriseDocUnreadable')}{viewer.reason}</div>
        )}
      </div>
    </div>
  )
}
