/**
 * 多模型路由 M3 批次C — the 工作流 Tab「当前路由」row: one chip per audited
 * phase (tier·model + 回落/词/失败 badges), nothing at all when routing is off
 * (M3 验收: enabled=false 与今天一致). Preferred-only phases stay silent — the
 * row answers "which model served each phase, and did it fall back".
 */
import type { WorkflowTabKey } from './locales.ts'
import type { RouteTier, WorkflowTabRouteStatus } from './tab-types.ts'
import css from './RouteStatusRow.module.css'

/** Props for {@link RouteStatusRow}. */
export interface RouteStatusRowProps {
  /** The host fold (`WorkflowTabView.routeStatus`). */
  readonly status: WorkflowTabRouteStatus
  /** Tab locale translator. */
  readonly t: (key: WorkflowTabKey) => string
}

/** Locale key for one tier's display label. */
function tierKey(tier: RouteTier): 'route.tierHigh' | 'route.tierMid' | 'route.tierLow' {
  return tier === 'high' ? 'route.tierHigh' : tier === 'mid' ? 'route.tierMid' : 'route.tierLow'
}

/**
 * Render the「当前路由」chips row under the Tab strip.
 * @param props - the fold + translator.
 * @returns the row, or null when routing is off.
 */
export function RouteStatusRow({ status, t }: RouteStatusRowProps): React.ReactElement | null {
  if (status.state !== 'routed') return null
  const audited = status.phases.filter(row => row.actual !== undefined)
  return (
    <div className={css.row} data-testid="route-status">
      <span className={css.label}>{t('route.title')}</span>
      {audited.length === 0
        ? <span className={css.muted}>{t('route.none')}</span>
        : audited.map((row) => {
          const actual = row.actual
          if (actual === undefined) return undefined
          return (
            <span key={row.phase} className={css.chip} data-testid="route-chip">
              <span className={css.phase}>{t(`node.${row.phase}` as WorkflowTabKey)}</span>
              <span className={css.model}>
                {/* The tier label names the PREFERENCE; after a fallback move
                    the served model belongs to another tier, so the label
                    would misname it — show the model alone + the badge. */}
                {actual.tier === undefined || actual.fallbackActive
                  ? actual.model
                  : `${t(tierKey(actual.tier))}·${actual.model}`}
              </span>
              {actual.source === 'failed' ? <span className={css.badge}>{t('route.failed')}</span> : undefined}
              {actual.fallbackActive ? <span className={css.badge}>{t('route.fallback')}</span> : undefined}
              {actual.tierReason === 'keyword' ? <span className={css.badge}>{t('route.keyword')}</span> : undefined}
              {actual.tierReason === 'verify-escalation'
                ? <span className={css.badge}>{t('route.escalation')}</span>
                : undefined}
            </span>
          )
        })}
    </div>
  )
}
