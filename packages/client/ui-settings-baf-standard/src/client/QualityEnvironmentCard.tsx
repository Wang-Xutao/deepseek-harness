/**
 * 【变更】2026-10-21 (质量监控重构 1.3): the 质量监控 tab's 环境 card — the
 * unit-test toolchain with the version each member ACTUALLY answers on this
 * machine (Host-spawned `--version`), a support verdict for the current
 * workspace, and the 一键安装 button that applies the quality pack assets +
 * installs the gem/pip members (prerequisites that cannot be auto-installed
 * ride the install report with a manual hint). Replaces the old UnitTestCard's
 * hardcoded toolchain line — every version shown is real.
 */
import type { StandardsOverviewState } from './standards-store.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import type { BafQualityToolRow } from '../types.ts'
import type { BafStandardKey } from './locales.ts'
import css from './StandardsOverview.module.css'

/** Join CSS-module names without a clsx dependency (filters dropped keys). */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/** Locale-free product names (mono-ish tool ids, never translated). */
const TOOL_DISPLAY: Readonly<Record<string, string>> = {
  gcc: 'GCC',
  ruby: 'Ruby',
  ceedling: 'Ceedling',
  gcovr: 'gcovr',
  cpplint: 'cpplint',
  cppcheck: 'Cppcheck',
  'clang-format': 'clang-format',
}

/** The 用途 column's locale keys (one per probed tool id). */
const TOOL_ROLE: Readonly<Record<string, BafStandardKey>> = {
  gcc: 'qolEnvToolGcc',
  ruby: 'qolEnvToolRuby',
  ceedling: 'qolEnvToolCeedling',
  gcovr: 'qolEnvToolGcovr',
  cpplint: 'qolEnvToolCpplint',
  cppcheck: 'qolEnvToolCppcheck',
  'clang-format': 'qolEnvToolClangFormat',
}

/** The state chip for one probe row. */
function ToolStateChip({ tool, t }: { tool: BafQualityToolRow; t: StandardsPanelProps['t'] }) {
  if (tool.state === 'ok') return <span className={join(css.envChip, css.envChipOk)}>{t('qolEnvOk')}</span>
  if (tool.state === 'unknown') return <span className={join(css.envChip, css.envChipUnknown)}>{t('qolEnvUnknown')}</span>
  return <span className={join(css.envChip, css.envChipMissing)}>{t('qolEnvMissing')}</span>
}

/**
 * The 环境 card — verdict banner + tool table + assets line + 一键安装.
 */
export function QualityEnvironmentCard({ state, t, onRecheck, onInstall }: {
  state: StandardsOverviewState
  t: StandardsPanelProps['t']
  /** 重新检测 — re-runs the Host probe round. */
  onRecheck: () => void
  /** 一键安装 — assets + gem/pip installs, then auto re-probe (the store). */
  onInstall: () => void
}) {
  const env = state.qualityEnv
  const loading = state.qualityEnvLoading
  const tools = env?.tools ?? []
  const missingRequired = tools
    .filter(tool => tool.required && tool.state !== 'ok')
    .map(tool => TOOL_DISPLAY[tool.key] ?? tool.key)

  // Verdict banner: probing → neutral, no-workspace → neutral guidance,
  // supported → success, else danger with the missing member names.
  const verdictClass = env?.status === 'ready' && env.supported
    ? join(css.envVerdict, css.envVerdictOk)
    : env?.status === 'ready'
      ? join(css.envVerdict, css.envVerdictBad)
      : join(css.envVerdict, css.envVerdictNeutral)
  const verdictText = env === undefined || loading
    ? t('qolEnvProbing')
    : env.status === 'no-workspace'
      ? t('qolEnvNoWorkspace')
      : env.supported
        ? t('qolEnvSupported')
        : `${t('qolEnvUnsupported')}：${missingRequired.join(' · ')}`

  const showInstall = env?.status === 'ready' && (!env.supported || !env.assetsInstalled)

  return (
    <div className={css.card} data-testid="baf-quality-env-card">
      <div className={css.cardTitleRow}>
        <span className={css.cardTitle}>{t('qolEnvTitle')}</span>
        <span className={css.titleActions}>
          <button
            type="button"
            className={css.miniButton}
            data-testid="baf-quality-env-recheck"
            disabled={loading}
            onClick={onRecheck}
          >
            {t('qolEnvRecheck')}
          </button>
        </span>
      </div>

      <div className={verdictClass} data-testid="baf-quality-env-verdict">
        <span className={css.envDot} aria-hidden="true" />
        {verdictText}
      </div>

      {tools.length > 0 ? (
        <table className={css.envTable} data-testid="baf-quality-env-table">
          <thead>
            <tr>
              <th className={css.envColTool}>{t('qolEnvColTool')}</th>
              <th>{t('qolEnvColRole')}</th>
              <th className={css.envColVersion}>{t('qolEnvColVersion')}</th>
              <th className={css.envColState}>{t('qolEnvColState')}</th>
            </tr>
          </thead>
          <tbody>
            {tools.map(tool => (
              <tr key={tool.key} data-testid={`baf-quality-env-tool-${tool.key}`}>
                <td className={css.envToolName}>
                  {TOOL_DISPLAY[tool.key] ?? tool.key}
                  <span className={css.envTag}>{tool.required ? t('qolEnvRequired') : t('qolEnvOptional')}</span>
                </td>
                <td className={css.envToolRole} title={t(TOOL_ROLE[tool.key] ?? 'qolEnvColRole')}>{t(TOOL_ROLE[tool.key] ?? 'qolEnvColRole')}</td>
                <td className={css.envToolVersion} title={tool.version ?? undefined}>
                  {tool.state === 'ok' && tool.version !== undefined ? tool.version : '—'}
                </td>
                <td><ToolStateChip tool={tool} t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {env?.status === 'ready' ? (
        <div className={css.utRow}>
          <span className={css.utRowLabel}>{t('qolEnvAssets')}</span>
          <span className={join(css.utRowValue, env.assetsInstalled ? css.envAssetsOn : undefined)}>
            {env.assetsInstalled ? t('qolEnvAssetsOn') : t('qolEnvAssetsOff')}
          </span>
        </div>
      ) : null}

      {showInstall ? (
        <div className={css.envActions}>
          <button
            type="button"
            className={css.titleSave}
            data-testid="baf-quality-env-install"
            disabled={state.qualityInstallRunning}
            onClick={onInstall}
          >
            {state.qualityInstallRunning ? t('qolEnvInstalling') : t('qolEnvInstall')}
          </button>
        </div>
      ) : null}

      {state.qualityInstallNotice !== undefined ? (
        <div className={css.statusError} data-testid="baf-quality-env-install-notice">
          {state.qualityInstallNotice}
        </div>
      ) : null}

      {state.qualityEnvNotice !== undefined ? (
        <div className={css.statusError} data-testid="baf-quality-env-notice">
          {state.qualityEnvNotice}
        </div>
      ) : null}

      {state.qualityInstallSteps !== undefined && state.qualityInstallSteps.length > 0 ? (
        <div className={css.envSteps} data-testid="baf-quality-env-steps">
          <div className={css.envStepsLabel}>{t('qolEnvSteps')}</div>
          {state.qualityInstallSteps.map(step => (
            <div key={step.id} className={css.envStep} data-testid={`baf-quality-env-step-${step.id}`}>
              <span className={join(css.envStepMark, step.ok ? css.envStepOk : css.envStepBad)} aria-hidden="true">
                {step.ok ? '✓' : '✗'}
              </span>
              <span className={css.envStepDetail}>{step.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
