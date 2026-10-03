import type { AppVersions } from '../versions.ts'
import { checkManifestPolicy, type UpdateManifest } from './manifest.ts'
import { compareVersions, isNewer } from './semver.ts'

/** Which layers an update will touch. */
export type UpdatePlan = {
  hasUpdate: boolean
  force: boolean
  shellRequired: boolean
  updatePlugin: boolean
  updateRuntime: boolean
  updateShell: boolean
  manifest: UpdateManifest
  summaryZh: string
}

/** §11.6 update scopes — baseline scope is frozen out (Phase 10). */
export type UpdateScope = 'harness' | 'plugin' | 'baseline'
export type UpdateAction = 'none' | 'download' | 'apply' | 'restart' | 'installer'

/** One scope's update decision (§11.6 authoritative shape). */
export type ScopedUpdatePlan = {
  scope: UpdateScope
  action: UpdateAction
  currentVersion: string
  targetVersion: string
  required: boolean
  restartRequired: boolean
  reason: string
}

/** Plan-time inputs for the signed-field policy (§11.2: trusted clock + skew + epoch). */
export interface PlanPolicyInput {
  /** Trusted system clock; defaults to now. */
  now?: Date
  /** Allowed clock skew (ms); production config may tighten. */
  skewMs?: number
  /** Last applied releaseEpoch for replay protection (from persisted state). */
  lastReleaseEpoch?: number
  /** Admin-signed offline exception (waives expiry only). */
  offlineException?: boolean
}

export type ScopedPlanResult = {
  plans: ScopedUpdatePlan[]
  manifest: UpdateManifest
  /** Policy refusal — every scope stays 'none' and nothing applies (停在 blocked). */
  blocked?: string
  summaryZh: string
}

const NONE = (scope: UpdateScope, version: string, reason: string): ScopedUpdatePlan => ({
  scope,
  action: 'none',
  currentVersion: version,
  targetVersion: version,
  required: false,
  restartRequired: false,
  reason,
})

/**
 * Build per-scope update plans (§11.6 ordering): signed-field policy first
 * (validity window + monotonic epoch — a refusal blocks every scope), then
 * the harness decision (forced security / minimum shell → installer
 * handoff; runtime hot-swap), then plugin (apply at the safety point, or
 * stage-download when the installer handoff dominates). The baseline scope
 * is frozen to 'none' (Phase 10). Compatibility range gates the plugin: a
 * manifest whose dsh range excludes the post-update runtime refuses the
 * plugin apply instead of breaking composition.
 * @param local - installed versions (flat projection).
 * @param manifest - VERIFIED channel manifest (signature checked in fetch).
 * @param policy - trusted-clock/epoch inputs for the signed-field check.
 */
export function buildScopedUpdatePlans(
  local: AppVersions,
  manifest: UpdateManifest,
  policy: PlanPolicyInput = {},
): ScopedPlanResult {
  const verdict = checkManifestPolicy(manifest, {
    now: policy.now ?? new Date(),
    skewMs: policy.skewMs ?? 0,
    ...(policy.lastReleaseEpoch === undefined ? {} : { lastReleaseEpoch: policy.lastReleaseEpoch }),
    ...(policy.offlineException === undefined ? {} : { offlineException: policy.offlineException }),
  })
  if (!verdict.ok) {
    const plans = [
      NONE('harness', local.bafDsh, verdict.error),
      NONE('plugin', local.bafPlugin, verdict.error),
      NONE('baseline', 'unknown', verdict.error),
    ]
    return { plans, manifest, blocked: verdict.error, summaryZh: `更新被阻断：${verdict.error}` }
  }

  // --- harness scope: installer handoff dominates, then runtime hot swap ---
  const shellAvailable = manifest.artifacts.shell !== undefined
  const shellNewer = isNewer(manifest.bafDsh, local.bafDsh)
  const minShellRequired = manifest.force || isNewer(manifest.minShell, local.bafDsh)
  const runtimeNewer = isNewer(manifest.dsh, local.dsh) && manifest.artifacts.runtime !== undefined
  let harness: ScopedUpdatePlan
  if ((shellNewer && shellAvailable) || minShellRequired) {
    harness = {
      scope: 'harness',
      action: 'installer',
      currentVersion: local.bafDsh,
      targetVersion: manifest.bafDsh,
      required: minShellRequired,
      restartRequired: true,
      reason: minShellRequired
        ? (manifest.force ? '强制安全更新，需要安装器' : `最低桌面版本 ${manifest.minShell} 高于已装 ${local.bafDsh}`)
        : `桌面 ${local.bafDsh} → ${manifest.bafDsh}`,
    }
  } else if (runtimeNewer) {
    harness = {
      scope: 'harness',
      action: 'apply',
      currentVersion: local.dsh,
      targetVersion: manifest.dsh,
      required: false,
      restartRequired: true,
      reason: `DeepSeek Harness ${local.dsh} → ${manifest.dsh}`,
    }
  } else {
    harness = NONE('harness', local.bafDsh, minShellRequired ? '需要安装器但 manifest 缺 shell 安装包' : '已是最新版本')
  }

  // --- plugin scope: apply at the safety point, unless the installer
  // handoff dominates (stage-download only; the new version re-checks) ---
  const pluginNewer = isNewer(manifest.bafPlugin, local.bafPlugin) && manifest.artifacts.plugin !== undefined
  const effectiveDsh = runtimeNewer ? manifest.dsh : local.dsh
  const dshTooOld = compareVersions(effectiveDsh, manifest.compatibility.minDsh) < 0
  const dshTooNew = manifest.compatibility.maxDsh !== '*'
    && compareVersions(effectiveDsh, manifest.compatibility.maxDsh) > 0
  let plugin: ScopedUpdatePlan
  if (!pluginNewer) {
    plugin = NONE('plugin', local.bafPlugin, '已是最新版本')
  } else if (harness.action === 'installer') {
    plugin = {
      scope: 'plugin',
      action: 'download',
      currentVersion: local.bafPlugin,
      targetVersion: manifest.bafPlugin,
      required: harness.required,
      restartRequired: false,
      reason: `桌面安装器升级期间暂存插件 ${local.bafPlugin} → ${manifest.bafPlugin}，新版本恢复后应用`,
    }
  } else if (dshTooOld || dshTooNew) {
    plugin = {
      scope: 'plugin',
      currentVersion: local.bafPlugin,
      targetVersion: manifest.bafPlugin,
      action: 'none',
      required: false,
      restartRequired: false,
      reason: dshTooOld
        ? `运行时 ${effectiveDsh} 低于 manifest 兼容下限 ${manifest.compatibility.minDsh}，先升级运行时`
        : `运行时 ${effectiveDsh} 高于 manifest 兼容上限 ${manifest.compatibility.maxDsh}，拒绝应用`,
    }
  } else {
    plugin = {
      scope: 'plugin',
      action: 'apply',
      currentVersion: local.bafPlugin,
      targetVersion: manifest.bafPlugin,
      required: false,
      restartRequired: true,
      reason: `插件 ${local.bafPlugin} → ${manifest.bafPlugin}`,
    }
  }

  // --- baseline scope: frozen (Phase 10) ---
  const baseline = NONE('baseline', 'unknown', 'baseline scope 暂缓（Phase 10）')

  const plans = [harness, plugin, baseline]
  const acting = plans.filter(p => p.action !== 'none')
  const summaryZh = acting.length === 0
    ? '已是最新版本'
    : acting.map(p => `${p.scope}: ${p.reason}`).join('；')
  return { plans, manifest, summaryZh }
}

/**
 * Legacy flat-plan adapter (§12 9.4): derives the old {@link UpdatePlan}
 * booleans from the scoped plans so Settings IPC keeps its shape.
 * @param local - installed versions.
 * @param manifest - channel manifest.
 */
export function buildUpdatePlan(local: AppVersions, manifest: UpdateManifest): UpdatePlan {
  const { plans, blocked, summaryZh } = buildScopedUpdatePlans(local, manifest)
  const harness = plans.find(p => p.scope === 'harness')
  const plugin = plans.find(p => p.scope === 'plugin')
  const shellRequired = harness?.action === 'installer' && harness.required
  const updateShell = harness?.action === 'installer'
  const updateRuntime = harness?.action === 'apply'
  const updatePlugin = plugin?.action === 'apply'
  const hasUpdate = blocked === undefined && plans.some(p => p.action !== 'none')
  return {
    hasUpdate,
    force: shellRequired,
    shellRequired,
    updatePlugin,
    updateRuntime,
    updateShell,
    manifest,
    summaryZh,
  }
}
