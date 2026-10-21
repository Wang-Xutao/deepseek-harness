/**
 * 【变更】2026-10-20 (批次七 2.3/2.5): the SHARED enterprise-document viewer
 * pane — extracted from EnterpriseDocsCard so the 企业规范 flow chart and the
 * 质量监控 toolchain card render the SAME right-hand side panel (like opening
 * a file): header with the bilingual title + 打开文件/关闭 actions, verbatim
 * document body, and the four payload states (loading / ready / unknown /
 * unreadable).
 */
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

/** The right-hand document pane — full text of the clicked document. */
export function EnterpriseDocViewer({ viewer, t, onOpenFile, onClose }: {
  viewer: DocViewer
  t: StandardsPanelProps['t']
  /** Fire-and-forget open — the caller wraps the face's openPath itself. */
  onOpenFile: (path: string) => void
  onClose: () => void
}) {
  const title = viewer.kind === 'ready'
    ? `${viewer.result.titleZh} · ${viewer.result.titleEn}`
    : undefined
  return (
    <aside className={css.docSide} data-testid="baf-enterprise-doc-viewer">
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
          <button
            type="button"
            className={css.miniButton}
            data-testid="baf-enterprise-doc-close"
            onClick={onClose}
          >
            {t('enterpriseDocClose')}
          </button>
        </span>
      </div>
      {viewer.kind === 'loading' ? (
        <div className={css.status}>{t('enterpriseDocLoading')}</div>
      ) : viewer.kind === 'ready' ? (
        <pre className={css.docBody} data-testid="baf-enterprise-doc-body">{viewer.result.content}</pre>
      ) : viewer.kind === 'unknown' ? (
        <div className={css.statusError}>{t('enterpriseDocUnknown')}</div>
      ) : (
        <div className={css.statusError}>{t('enterpriseDocUnreadable')}{viewer.reason}</div>
      )}
    </aside>
  )
}
