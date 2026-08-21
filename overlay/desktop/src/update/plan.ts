import type { AppVersions } from '../versions.ts'
import type { UpdateManifest } from './manifest.ts'
import { isNewer } from './semver.ts'

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

/**
 * Build an update plan from local versions and a remote manifest.
 * @param local - installed versions.
 * @param manifest - channel manifest.
 */
export function buildUpdatePlan(local: AppVersions, manifest: UpdateManifest): UpdatePlan {
  const updatePlugin = isNewer(manifest.bafPlugin, local.bafPlugin) && manifest.artifacts.plugin !== undefined
  const updateRuntime = isNewer(manifest.dsh, local.dsh) && manifest.artifacts.runtime !== undefined
  const updateShell = isNewer(manifest.bafDsh, local.bafDsh) && manifest.artifacts.shell !== undefined
  const shellRequired = manifest.force || isNewer(manifest.minShell, local.bafDsh)
  const hasUpdate = updatePlugin || updateRuntime || updateShell || shellRequired

  const parts: string[] = []
  if (updatePlugin) parts.push(`插件包 ${local.bafPlugin} → ${manifest.bafPlugin}`)
  if (updateRuntime) parts.push(`运行时 ${local.dsh} → ${manifest.dsh}`)
  if (updateShell || shellRequired) parts.push(`壳 ${local.bafDsh} → ${manifest.bafDsh}`)
  const summaryZh = hasUpdate
    ? (parts.length > 0 ? parts.join('；') : `需要升级到 ${manifest.bafDsh}`)
    : '已是最新版本'

  return {
    hasUpdate,
    force: shellRequired,
    shellRequired,
    updatePlugin: shellRequired ? false : updatePlugin,
    updateRuntime: shellRequired ? false : updateRuntime,
    updateShell: shellRequired || updateShell,
    manifest,
    summaryZh,
  }
}
