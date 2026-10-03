import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppVersions } from '../versions.ts'
import { loadVersions, saveVersions } from '../versions.ts'
import { applyScopedUpdate, rollbackScope, type ApplyProgress, type ApplyResult } from './apply.ts'
import { fetchChannelManifest, type GithubUpdateConfig } from './github.ts'
import { buildScopedUpdatePlans, buildUpdatePlan, type ScopedPlanResult, type UpdatePlan } from './plan.ts'

export type CheckUpdateResult =
  | { status: 'up-to-date', versions: AppVersions, checkedAt: string }
  | { status: 'available', versions: AppVersions, plan: UpdatePlan, checkedAt: string }
  | { status: 'error', versions: AppVersions, error: string, checkedAt: string }

/** Persisted update state (§11.6 版本状态) — `baf update status` reads this file. */
export type UpdateState = {
  lastCheckAt: string
  lastCheckStatus: 'up-to-date' | 'available' | 'error'
  /** Channel manifest identity of the last successful check. */
  tag?: string
  releaseEpoch?: number
  keyId?: string
  blocked?: string
  /** Scoped plans as of the last check (9.4 shapes, JSON-serializable). */
  plans?: ScopedPlanResult['plans']
  summaryZh?: string
}

export type UpdateServiceOptions = {
  userData: string
  seedVersions: AppVersions
  github: GithubUpdateConfig
  pluginDir: string
  runtimeDir: string
  stopChild: () => void
  restartChild: () => Promise<boolean>
  /** Electron seam — opens the downloaded installer (main.ts injects shell.openPath). */
  openInstaller: (setupPath: string) => void | Promise<void>
  onProgress?: (p: ApplyProgress) => void
  /** Trusted-clock skew allowance for the signed-field policy (ms). */
  clockSkewMs?: number
}

/** State file path under userData — exported for main.ts env wiring (9.6). */
export function updateStatePath(userData: string): string {
  return join(userData, 'update-state.json')
}

/** Child→main request file (sibling of the state file — the env names the dir). */
export function updateRequestPath(userData: string): string {
  return join(userData, 'update-request.json')
}

/** main→child response file (same dir; matched by request id). */
export function updateResponsePath(userData: string): string {
  return join(userData, 'update-response.json')
}

/** One dispatched command's JSON-safe response (child renders cards from it). */
export type UpdateRequestResponse = {
  id: string
  command: 'check' | 'apply' | 'rollback'
  ok: boolean
  error?: string
  check?: { status: string, checkedAt: string, summaryZh?: string, blocked?: string }
  apply?: {
    ok: boolean
    error?: string
    launchedInstaller: boolean
    restartedChild: boolean
    scopes: Array<{ scope: string, action: string, ok: boolean, error?: string, rolledBack?: boolean }>
    versions: { bafDsh: string, dsh: string, bafPlugin: string }
  }
  rollback?: { scope: string, ok: boolean, fromVersion?: string, toVersion?: string, error?: string }
}

/**
 * Shared update orchestrator for splash and settings.
 */
export class UpdateService {
  private lastCheck: CheckUpdateResult | undefined
  private lastScoped: ScopedPlanResult | undefined
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

  /** Last scoped plan result (settings 9.5 renders per scope). */
  getLastScoped(): ScopedPlanResult | undefined {
    return this.lastScoped
  }

  /**
   * Pull channel manifest and compute the scoped plans (then the flat
   * projection over them for the Settings IPC shape). The signed-field
   * policy reads the last applied releaseEpoch from the persisted state so
   * replayed manifests are refused even across restarts.
   * @returns check result for UI.
   */
  async checkForUpdate(): Promise<CheckUpdateResult> {
    const checkedAt = new Date().toISOString()
    try {
      const manifest = await fetchChannelManifest(this.opts.github)
      const previous = this.readState()
      const scoped = buildScopedUpdatePlans(this.versions, manifest, {
        skewMs: this.opts.clockSkewMs ?? 0,
        ...(previous.releaseEpoch === undefined ? {} : { lastReleaseEpoch: previous.releaseEpoch }),
      })
      this.lastScoped = scoped
      const plan = buildUpdatePlan(this.versions, manifest)
      const acting = scoped.blocked === undefined && scoped.plans.some(p => p.action !== 'none')
      this.lastCheck = acting
        ? { status: 'available', versions: this.versions, plan, checkedAt }
        : { status: 'up-to-date', versions: this.versions, checkedAt }
      this.writeState({
        lastCheckAt: checkedAt,
        lastCheckStatus: acting ? 'available' : 'up-to-date',
        ...(scoped.blocked === undefined ? {} : { blocked: scoped.blocked }),
        tag: manifest.tag,
        releaseEpoch: manifest.releaseEpoch,
        keyId: manifest.signature.keyId,
        plans: scoped.plans,
        summaryZh: scoped.summaryZh,
      })
      return this.lastCheck
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      this.lastCheck = { status: 'error', versions: this.versions, error, checkedAt }
      this.writeState({ lastCheckAt: checkedAt, lastCheckStatus: 'error', summaryZh: error })
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
    if (check.status !== 'available' || this.lastScoped === undefined) {
      return {
        ok: false,
        versions: this.versions,
        ...(check.status === 'error' ? { error: check.error } : { error: '没有可用更新' }),
        restartedChild: false,
        launchedInstaller: false,
        scopes: [],
      }
    }
    const result = await applyScopedUpdate(this.opts.github, this.lastScoped, this.versions, {
      onProgress: this.opts.onProgress,
      stopChild: this.opts.stopChild,
      restartChild: this.opts.restartChild,
      openInstaller: this.opts.openInstaller,
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
      // The applied epoch becomes the replay floor for the next check.
      this.writeState({
        lastCheckAt: new Date().toISOString(),
        lastCheckStatus: 'up-to-date',
        tag: this.lastScoped.manifest.tag,
        releaseEpoch: this.lastScoped.manifest.releaseEpoch,
        keyId: this.lastScoped.manifest.signature.keyId,
        summaryZh: '更新已完成',
      })
    }
    return result
  }

  /**
   * Dispatch one child-originated update command (9.6 request file loop):
   * `check` re-pulls the channel, `apply` runs the last/next plan, and
   * `rollback` restores the scope's `.bak`. Returns a JSON-safe response the
   * child renders as a card; every failure mode maps to `ok:false` + error
   * instead of throwing, so the watcher can always answer.
   * @param raw - parsed request body (`{id, command, scope?}`).
   * @returns the response for `update-response.json`.
   */
  async dispatchUpdateRequest(raw: unknown): Promise<UpdateRequestResponse> {
    const o = raw as { id?: unknown, command?: unknown, scope?: unknown }
    const id = typeof o.id === 'string' ? o.id : 'unknown'
    const command = o.command
    if (command === 'check') {
      const r = await this.checkForUpdate()
      const scoped = this.getLastScoped()
      return {
        id,
        command: 'check',
        ok: r.status !== 'error',
        ...(r.status === 'error' ? { error: r.error } : {}),
        check: {
          status: r.status,
          checkedAt: r.checkedAt,
          ...(scoped?.summaryZh === undefined ? {} : { summaryZh: scoped.summaryZh }),
          ...(scoped?.blocked === undefined ? {} : { blocked: scoped.blocked }),
        },
      }
    }
    if (command === 'apply') {
      const r = await this.startUpdate()
      return {
        id,
        command: 'apply',
        ok: r.ok,
        ...(r.error === undefined ? {} : { error: r.error }),
        apply: {
          ok: r.ok,
          ...(r.error === undefined ? {} : { error: r.error }),
          launchedInstaller: r.launchedInstaller,
          restartedChild: r.restartedChild,
          scopes: r.scopes.map(s => ({
            scope: s.scope,
            action: s.action,
            ok: s.ok,
            ...(s.error === undefined ? {} : { error: s.error }),
            ...(s.rolledBack === undefined ? {} : { rolledBack: s.rolledBack }),
          })),
          versions: {
            bafDsh: r.versions.bafDsh,
            dsh: r.versions.dsh,
            bafPlugin: r.versions.bafPlugin,
          },
        },
      }
    }
    if (command === 'rollback') {
      const scope = typeof o.scope === 'string' ? o.scope : 'plugin'
      const r = await rollbackScope(scope === 'runtime' ? 'runtime' : 'plugin', {
        pluginDir: this.opts.pluginDir,
        runtimeDir: this.opts.runtimeDir,
        userData: this.opts.userData,
        stopChild: this.opts.stopChild,
        restartChild: this.opts.restartChild,
        onProgress: this.opts.onProgress,
      })
      if (r.ok) this.versions = loadVersions(this.opts.userData, this.opts.seedVersions)
      return {
        id,
        command: 'rollback',
        ok: r.ok,
        ...(r.error === undefined ? {} : { error: r.error }),
        rollback: {
          scope,
          ok: r.ok,
          ...(r.error === undefined ? {} : { error: r.error }),
          ...(r.fromVersion === undefined ? {} : { fromVersion: r.fromVersion }),
          ...(r.toVersion === undefined ? {} : { toVersion: r.toVersion }),
        },
      }
    }
    return { id, command: 'check', ok: false, error: `未知更新命令：${String(command)}` }
  }

  /** Read the persisted state (missing/corrupt → empty shape). */
  readState(): Partial<UpdateState> {
    try {
      const path = updateStatePath(this.opts.userData)
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<UpdateState>
      if (raw === null || typeof raw !== 'object' || typeof raw.lastCheckAt !== 'string') return {}
      return raw
    } catch {
      return {}
    }
  }

  private writeState(state: UpdateState): void {
    try {
      const path = updateStatePath(this.opts.userData)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    } catch {
      // State persistence is advisory — an update must not fail on it.
    }
  }
}
