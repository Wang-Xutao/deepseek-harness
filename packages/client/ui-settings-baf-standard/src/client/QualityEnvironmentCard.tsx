/**
 * 【变更】2026-10-21 (质量监控重构 1.3): the 质量监控 tab's 环境 card — the
 * unit-test toolchain with the version each member ACTUALLY answers on this
 * machine (Host-spawned `--version`), a support verdict for the current
 * workspace, and the 一键安装 button that applies the quality pack assets +
 * installs the gem/pip members (prerequisites that cannot be auto-installed
 * ride the install report with a manual hint). Replaces the old UnitTestCard's
 * hardcoded toolchain line — every version shown is real.
 * 【变更】2026-10-22 (批次十四 3, 客户决策): the 质量资产 已应用到工作区 row is
 * DELETED — replaced by a 配置文件 column right after 用途 listing each tool's
 * required config files as chips; click previews the file in the shared
 * AssetModal (打开 button top-right), a missing file dims with 未写入. The
 * 一键安装 writes every listed file from the default templates (quality + c
 * packs), so the column doubles as the per-file applied/not-applied readout.
 */
import { useState } from 'react'
import type { StandardsOverviewState } from './standards-store.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import type { BafQualityToolRow } from '../types.ts'
import type { BafStandardKey } from './locales.ts'
import { AssetModal } from './QualityFlowCard.tsx'
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

/**
 * 【变更】2026-10-22 (批次十四 3): the 配置文件 column — each tool's required
 * config files (workspace-relative). Mirrors the 测试流 canvas's STAGES asset
 * mapping keyed by tool; ruby is ceedling's runtime and carries no config of
 * its own. Every listed file is a 一键安装 template target.
 */
const TOOL_CONFIG_FILES: Readonly<Record<string, readonly string[]>> = {
  gcc: ['project.yml'],
  ruby: [],
  ceedling: ['project.yml', '.baf/quality/ceedling-config.json'],
  gcovr: ['.baf/quality/ceedling-config.json'],
  cpplint: ['CPPLINT.cfg'],
  cppcheck: ['cppcheck-suppressions.xml'],
  'clang-format': ['.clang-format'],
}

/** The state chip for one probe row. */
function ToolStateChip({ tool, t }: { tool: BafQualityToolRow; t: StandardsPanelProps['t'] }) {
  if (tool.state === 'ok') return <span className={join(css.envChip, css.envChipOk)}>{t('qolEnvOk')}</span>
  if (tool.state === 'unknown') return <span className={join(css.envChip, css.envChipUnknown)}>{t('qolEnvUnknown')}</span>
  return <span className={join(css.envChip, css.envChipMissing)}>{t('qolEnvMissing')}</span>
}

/**
 * The 环境 card — verdict banner + tool table + 一键安装 +
 * 【变更】2026-10-22 (批次十三 3): the 「AI 协助安装」 escape hatch — shown once
 * the install report carries a real failure or the env still probes
 * unsupported, so a machine-level gap (GCC/Ruby/Cppcheck/LLVM) always has a
 * next step beyond the manual hint.
 */
export function QualityEnvironmentCard({
  state, t, onRecheck, onInstall, onAiHelp, openQualityAsset, closeQualityAsset, onOpenPath,
  onRevealPath,
}: {
  state: StandardsOverviewState
  t: StandardsPanelProps['t']
  /** 重新检测 — re-runs the Host probe round. */
  onRecheck: () => void
  /** 一键安装 — assets + gem/pip installs, then auto re-probe (the store). */
  onInstall: () => void
  /** AI 协助安装 — opens a baf session with a prefilled install-help draft. */
  onAiHelp: () => void
  /** 【变更】2026-10-22 (批次十四 3): fetch one 配置文件 chip's preview payload. */
  openQualityAsset: (rel: string) => void
  /** Clear the preview payload (the modal's close). */
  closeQualityAsset: () => void
  /** The modal's 打开 gesture (absolute path → default app). */
  onOpenPath: (path: string) => void
  /** 【变更】2026-10-22 (批次十五 2): the modal's 打开文件夹 gesture. */
  onRevealPath: (path: string) => void
}) {
  const env = state.qualityEnv
  const loading = state.qualityEnvLoading
  const tools = env?.tools ?? []
  const missingRequired = tools
    .filter(tool => tool.required && tool.state !== 'ok')
    .map(tool => TOOL_DISPLAY[tool.key] ?? tool.key)
  // 批次十四 3 — the 配置文件 column's own preview modal state (the flow
  // canvas keeps its own instance; both reuse the same AssetModal component,
  // which handles Escape + scrim clicks itself).
  const [cfgRel, setCfgRel] = useState<string | undefined>(undefined)

  const openCfg = (rel: string): void => {
    setCfgRel(rel)
    openQualityAsset(rel)
  }
  const closeCfg = (): void => {
    setCfgRel(undefined)
    closeQualityAsset()
  }

  /** One config file's on-disk existence from the loaded 资产 list. */
  const cfgExists = (rel: string): boolean | undefined =>
    state.qualityAssets?.status === 'ready'
      ? state.qualityAssets.assets.find(asset => asset.rel === rel)?.exists
      : undefined

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
  // 批次十三 3 — the AI escape hatch: any real install failure in the report,
  // or a still-unsupported verdict, keeps the button available.
  const installFailed = (state.qualityInstallSteps ?? []).some(step => !step.ok)
  const showAiHelp = env?.status === 'ready' && (!env.supported || installFailed)

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
              {/* 【变更】2026-10-22 (批次十四 3): the new 配置文件 column — right
                  after 用途, per the customer's word. */}
              <th>{t('qolEnvColConfig')}</th>
              <th className={css.envColVersion}>{t('qolEnvColVersion')}</th>
              <th className={css.envColState}>{t('qolEnvColState')}</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((tool) => {
              const files = TOOL_CONFIG_FILES[tool.key] ?? []
              return (
                <tr key={tool.key} data-testid={`baf-quality-env-tool-${tool.key}`}>
                  <td className={css.envToolName}>
                    {TOOL_DISPLAY[tool.key] ?? tool.key}
                    <span className={css.envTag}>{tool.required ? t('qolEnvRequired') : t('qolEnvOptional')}</span>
                  </td>
                  <td className={css.envToolRole} title={t(TOOL_ROLE[tool.key] ?? 'qolEnvColRole')}>{t(TOOL_ROLE[tool.key] ?? 'qolEnvColRole')}</td>
                  <td className={css.envToolCfg}>
                    {files.length === 0
                      ? <span className={css.envCfgNone}>{t('qolEnvCfgNone')}</span>
                      : files.map((rel) => {
                        const onDisk = cfgExists(rel)
                        return (
                          <button
                            key={rel}
                            type="button"
                            className={join(css.envCfgChip, css.pathChip, onDisk === false ? css.envCfgChipMissing : undefined)}
                            data-testid={`baf-quality-env-cfg-${tool.key}-${rel.replace(/[^a-z0-9]+/gi, '-')}`}
                            title={rel}
                            onClick={() => { openCfg(rel) }}
                          >
                            {rel}{onDisk === false ? ` · ${t('qolEnvCfgMissing')}` : ''}
                          </button>
                        )
                      })}
                  </td>
                  <td className={css.envToolVersion} title={tool.version ?? undefined}>
                    {tool.state === 'ok' && tool.version !== undefined ? tool.version : '—'}
                  </td>
                  <td><ToolStateChip tool={tool} t={t} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
          {showAiHelp ? (
            <button
              type="button"
              className={css.miniButton}
              data-testid="baf-quality-env-ai-help"
              title={t('qolEnvAiHelpTitle')}
              onClick={onAiHelp}
            >
              {t('qolEnvAiHelp')}
            </button>
          ) : null}
        </div>
      ) : showAiHelp ? (
        <div className={css.envActions}>
          <button
            type="button"
            className={css.miniButton}
            data-testid="baf-quality-env-ai-help"
            title={t('qolEnvAiHelpTitle')}
            onClick={onAiHelp}
          >
            {t('qolEnvAiHelp')}
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

      {/* 批次十四 3 — the 配置文件 chip's preview modal: the SAME component the
          测试流 canvas's 资产 chips open. 批次十五 2 — 打开 + 打开文件夹 top-right. */}
      {cfgRel !== undefined ? (
        <AssetModal
          rel={cfgRel}
          asset={state.qualityAsset}
          t={t}
          onOpenFile={onOpenPath}
          onRevealFile={onRevealPath}
          onClose={closeCfg}
        />
      ) : null}
    </div>
  )
}
