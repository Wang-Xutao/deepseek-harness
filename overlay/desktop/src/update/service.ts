import type { AppVersions } from '../versions.ts'
import { loadVersions, saveVersions } from '../versions.ts'
import { applyUpdatePlan, type ApplyProgress, type ApplyResult } from './apply.ts'
import { fetchChannelManifest, type GithubUpdateConfig } from './github.ts'
import { buildUpdatePlan, type UpdatePlan } from './plan.ts'

export type CheckUpdateResult =
  | { status: 'up-to-date', versions: AppVersions, checkedAt: string }
  | { status: 'available', versions: AppVersions, plan: UpdatePlan, checkedAt: string }
  | { status: 'error', versions: AppVersions, error: string, checkedAt: string }

export type UpdateServiceOptions = {
  userData: string
  seedVersions: AppVersions
  github: GithubUpdateConfig
  pluginDir: string
  runtimeDir: string
  stopChild: () => void
  restartChild: () => Promise<boolean>
  onProgress?: (p: ApplyProgress) => void
}

/**
 * Shared update orchestrator for splash and settings.
 */
export class UpdateService {
  private lastCheck: CheckUpdateResult | undefined
  private readonly opts: UpdateServiceOptions
  private versions: AppVersions

  constructor(opts: UpdateServiceOptions) {
    this.opts = opts
    this.versions = loadVersions(opts.userData, opts.seedVersions)
  }

  /** Current local versions. */
  getVersions(): AppVersions {
    return { ...this.versions }
  }

  /** Last check result, if any. */
  getLastCheck(): CheckUpdateResult | undefined {
    return this.lastCheck
  }

  /**
   * Pull channel manifest and compute a plan.
   * @returns check result for UI.
   */
  async checkForUpdate(): Promise<CheckUpdateResult> {
    const checkedAt = new Date().toISOString()
    try {
      const manifest = await fetchChannelManifest(this.opts.github)
      const plan = buildUpdatePlan(this.versions, manifest)
      this.lastCheck = plan.hasUpdate
        ? { status: 'available', versions: this.versions, plan, checkedAt }
        : { status: 'up-to-date', versions: this.versions, checkedAt }
      return this.lastCheck
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      this.lastCheck = { status: 'error', versions: this.versions, error, checkedAt }
      return this.lastCheck
    }
  }

  /**
   * Apply the last successful available plan, or re-check first.
   * @returns apply result.
   */
  async startUpdate(): Promise<ApplyResult> {
    let check = this.lastCheck
    if (check === undefined || check.status !== 'available') {
      check = await this.checkForUpdate()
    }
    if (check.status !== 'available') {
      return {
        ok: false,
        versions: this.versions,
        error: check.status === 'error' ? check.error : '没有可用更新',
        restartedChild: false,
        launchedInstaller: false,
      }
    }
    const result = await applyUpdatePlan(this.opts.github, check.plan, this.versions, {
      onProgress: this.opts.onProgress,
      stopChild: this.opts.stopChild,
      restartChild: this.opts.restartChild,
      pluginDir: this.opts.pluginDir,
      runtimeDir: this.opts.runtimeDir,
      userData: this.opts.userData,
    })
    if (result.ok) {
      this.versions = result.versions
      saveVersions(this.opts.userData, this.versions)
      this.lastCheck = {
        status: 'up-to-date',
        versions: this.versions,
        checkedAt: new Date().toISOString(),
      }
    }
    return result
  }
}
