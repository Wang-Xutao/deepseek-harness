/**
 * 【变更】2026-10-22 (批次十二 3, 客户决策): the 质量监控 tab's 资产 card — the
 * EXPLICIT list of files the quality pack lays into the workspace (project.yml /
 * CPPLINT.cfg / .clang-format / …), each with what it governs, whether it is on
 * disk right now, and 预览/打开 gestures (preview is a full-screen text modal;
 * 打开 hands the absolute path to the OS default program). Replaces the old
 * QualityFlowCard (the execution-order chart) — that story lives in the session
 * tab's 测试流图 now.
 */
import { useEffect, useRef, useState } from 'react'
import type { StandardsOverviewState } from './standards-store.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import type { BafQualityAssetRow } from '../types.ts'
import type { BafStandardKey } from './locales.ts'
import css from './StandardsOverview.module.css'

/** The 用途 column's locale keys (one per asset roleKey). */
const ASSET_ROLE: Readonly<Record<BafQualityAssetRow['roleKey'], BafStandardKey>> = {
  assetProject: 'qolAssetRoleProject',
  assetGateConfig: 'qolAssetRoleGateConfig',
  assetCpplint: 'qolAssetRoleCpplint',
  assetSuppressions: 'qolAssetRoleSuppressions',
  assetClangFormat: 'qolAssetRoleClangFormat',
  assetUtReadme: 'qolAssetRoleUtReadme',
  assetStaticReadme: 'qolAssetRoleStaticReadme',
}

/** Row testid slug: path separators/dots → dashes (stable, locale-free). */
const slugOf = (rel: string): string => rel.replace(/[^a-zA-Z0-9]+/g, '-')

/** One label-left / actions-right asset row (the utRow anatomy). */
function AssetRow({ asset, t, onPreview, onOpenPath }: {
  asset: BafQualityAssetRow
  t: StandardsPanelProps['t']
  /** Fetch + open this file's preview modal. */
  onPreview: (rel: string) => void
  /** Fire-and-forget open of the absolute path with its default app. */
  onOpenPath: (path: string) => void
}) {
  const slug = slugOf(asset.rel)
  return (
    <div className={css.utRow} data-testid={`baf-quality-asset-${slug}`}>
      <span className={css.utRowLabel} title={asset.rel}>{asset.rel}</span>
      <span className={css.utRowActions}>
        <span className={css.utRowValue}>{t(ASSET_ROLE[asset.roleKey])}</span>
        {asset.exists ? (
          <>
            <button
              type="button"
              className={css.miniButton}
              data-testid={`baf-quality-asset-${slug}-preview`}
              title={asset.rel}
              onClick={() => { onPreview(asset.rel) }}
            >
              {t('qolAssetPreview')}
            </button>
            <button
              type="button"
              className={css.miniButton}
              data-testid={`baf-quality-asset-${slug}-open`}
              title={asset.rel}
              onClick={() => { onOpenPath(asset.rel) }}
            >
              {t('qolAssetOpen')}
            </button>
          </>
        ) : (
          <span className={css.utPending}>{t('qolAssetMissing')}</span>
        )}
      </span>
    </div>
  )
}

/** The asset preview modal — same scrim/Escape contract as the report modal. */
function AssetModal({ rel, asset, t, onOpenFile, onClose }: {
  /** The clicked file's workspace-relative path (modal title). */
  rel: string
  asset: StandardsOverviewState['qualityAsset']
  t: StandardsPanelProps['t']
  /** Fire-and-forget open of the file with its default app. */
  onOpenFile: (path: string) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Escape is the keyboard route out (the scrim click is the visual one).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  return (
    <div className={css.docModalScrim} data-testid="baf-quality-asset-scrim" onClick={onClose}>
      <div
        ref={panelRef}
        className={css.docModal}
        role="dialog"
        aria-modal="true"
        aria-label={t('qolAssetModalTitle')}
        tabIndex={-1}
        data-testid="baf-quality-asset-modal"
        onClick={(event) => { event.stopPropagation() }}
      >
        <div className={css.docViewerHead}>
          <span className={css.docViewerTitle}>{rel}</span>
          <span className={css.titleActions}>
            {asset?.status === 'ready' ? (
              <button
                type="button"
                className={css.miniButton}
                data-testid="baf-quality-asset-open-file"
                title={asset.path}
                onClick={() => { onOpenFile(asset.path) }}
              >
                {t('qolAssetOpen')}
              </button>
            ) : null}
          </span>
        </div>
        {asset === undefined ? (
          <div className={css.status}>{t('qolAssetLoading')}</div>
        ) : asset.status === 'ready' ? (
          <pre className={css.assetPre} data-testid="baf-quality-asset-content">{asset.content}</pre>
        ) : asset.status === 'missing' ? (
          <div className={css.status} data-testid="baf-quality-asset-missing">{t('qolAssetMissing')}</div>
        ) : asset.status === 'no-workspace' ? (
          <div className={css.status}>{t('qolCfgNoWorkspace')}</div>
        ) : (
          <div className={css.statusError} data-testid="baf-quality-asset-error">
            {t('qolAssetReadFailed')}{asset.reason}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The 资产 card — the explicit quality-pack file list + the preview modal.
 */
export function QualityAssetsCard({ state, t, onPreview, onClosePreview, onOpenPath }: {
  state: StandardsOverviewState
  t: StandardsPanelProps['t']
  /** Fetch + open one file's preview modal (workspace-relative path). */
  onPreview: (rel: string) => void
  /** Close the modal (drops any in-flight fetch). */
  onClosePreview: () => void
  /** Open one file (workspace-relative → absolute via the list's cwd). */
  onOpenPath: (absPath: string) => void
}) {
  const assets = state.qualityAssets
  const [modalRel, setModalRel] = useState<string | undefined>(undefined)

  const openPreview = (rel: string): void => {
    setModalRel(rel)
    onPreview(rel)
  }
  const closePreview = (): void => {
    setModalRel(undefined)
    onClosePreview()
  }
  /** The row's 打开 gesture: join the list's cwd onto the relative path. */
  const openRow = (rel: string): void => {
    if (assets?.cwd !== undefined) onOpenPath(`${assets.cwd.replace(/\/+$/, '')}/${rel}`)
  }

  return (
    <div className={css.card} data-testid="baf-quality-assets-card">
      <div className={css.cardTitle}>{t('qolAssetTitle')}</div>
      <div className={css.cardDesc}>{t('qolAssetIntro')}</div>

      {assets === undefined ? (
        <div className={css.status}>{t('qolAssetLoading')}</div>
      ) : assets.status === 'no-workspace' ? (
        <div className={css.status}>{t('qolCfgNoWorkspace')}</div>
      ) : (
        assets.assets.map(asset => (
          <AssetRow
            key={asset.rel}
            asset={asset}
            t={t}
            onPreview={openPreview}
            onOpenPath={openRow}
          />
        ))
      )}

      {modalRel !== undefined ? (
        <AssetModal
          rel={modalRel}
          asset={state.qualityAsset}
          t={t}
          onOpenFile={onOpenPath}
          onClose={closePreview}
        />
      ) : null}
    </div>
  )
}
