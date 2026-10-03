import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppVersions } from '../versions.ts'
import { loadVersions, saveVersions } from '../versions.ts'
import { atomicSwapDir, extractZip, rollbackDir } from './extract.ts'
import {
  downloadAssetToFile,
  resolveReleaseAsset,
  updatesDir,
  type GithubUpdateConfig,
} from './github.ts'
import type { ScopedPlanResult, ScopedUpdatePlan, UpdateAction, UpdateScope } from './plan.ts'
import type { UpdatePlan } from './plan.ts'

export type ApplyProgress = {
  phase: 'download' | 'extract' | 'swap' | 'shell' | 'done' | 'error'
  message: string
  percent?: number
}

export type ApplyResult = {
  ok: boolean
  versions: AppVersions
  error?: string
  restartedChild: boolean
  launchedInstaller: boolean
  /** Per-scope outcomes — independent transactions commit independently (§11.6). */
  scopes: ScopeApplyOutcome[]
}

/** One scope transaction's outcome. */
export type ScopeApplyOutcome = {
  scope: UpdateScope
  action: UpdateAction
  ok: boolean
  error?: string
  rolledBack?: boolean
}

export type ApplyHooks = {
  onProgress?: (p: ApplyProgress) => void
  /** Stop the dsh child before swapping runtime/plugin. */
  stopChild: () => void
  /** Start dsh again after a hot update; return true when ready. */
  restartChild: () => Promise<boolean>
  /** Electron seam: open the downloaded installer (injected by main.ts). */
  openInstaller: (setupPath: string) => void | Promise<void>
  pluginDir: string
  runtimeDir: string
  userData: string
}

/**
 * Apply the scoped plans (§11.6 ordering):
 *
 * 1. harness `installer` → download shell, record the handoff state for the
 *    next version to re-check, stage the plugin zip, hand off to the OS
 *    installer. Failure deletes nothing of the old install.
 * 2. harness `apply` (runtime hot swap) and plugin `apply` run as
 *    INDEPENDENT transactions: each is download → extract `.next` → atomic
 *    swap, and a failure rolls back only that scope — the other scope
 *    commits (后续失败不误回滚已验证 scope).
 * 3. one child restart serves every applied scope; if it fails, the scopes
 *    applied in THIS pass roll back in reverse order and the child restarts
 *    on the old bits. A scope applied in an earlier pass is never touched.
 *
 * @param config - GitHub download config.
 * @param scoped - the scoped plan result (from buildScopedUpdatePlans).
 * @param local - current versions.
 * @param hooks - process/fs hooks owned by main.
 */
export async function applyScopedUpdate(
  config: GithubUpdateConfig,
  scoped: ScopedPlanResult,
  local: AppVersions,
  hooks: ApplyHooks,
): Promise<ApplyResult> {
  if (scoped.blocked !== undefined) {
    return {
      ok: false,
      versions: local,
      error: scoped.blocked,
      restartedChild: false,
      launchedInstaller: false,
      scopes: scoped.plans.map(p => ({ scope: p.scope, action: 'none', ok: false, error: scoped.blocked })),
    }
  }
  const next: AppVersions = { ...local }
  const outcomes: ScopeApplyOutcome[] = []
  let restartedChild = false
  let launchedInstaller = false
  const pending = join(updatesDir(hooks.userData), 'pending')
  mkdirSync(pending, { recursive: true })
  const progress = (p: ApplyProgress): void => {
    hooks.onProgress?.(p)
  }
  const harness = scoped.plans.find(p => p.scope === 'harness')
  const plugin = scoped.plans.find(p => p.scope === 'plugin')

  try {
    // --- harness: installer handoff (记录状态安全退出，新版本恢复重查) ---
    if (harness?.action === 'installer') {
      const art = scoped.manifest.artifacts.shell
      if (art === undefined) throw new Error('manifest 缺少 shell 安装包')
      progress({ phase: 'download', message: '正在下载安装包…', percent: 10 })
      const asset = await resolveReleaseAsset(config, scoped.manifest.tag, art)
      const setupPath = join(pending, art.name)
      await downloadAssetToFile(config, asset, setupPath, art.sha256)
      // Stage the plugin zip alongside (best-effort): the new version picks
      // the pending download up and applies it at its own safety point.
      if (plugin?.action === 'download' && scoped.manifest.artifacts.plugin !== undefined) {
        try {
          const pluginArt = scoped.manifest.artifacts.plugin
          const pluginAsset = await resolveReleaseAsset(config, scoped.manifest.tag, pluginArt)
          await downloadAssetToFile(config, pluginAsset, join(pending, pluginArt.name), pluginArt.sha256)
        } catch {
          // Staging is opportunistic; the installer handoff must proceed.
        }
      }
      // Handoff record — Phase 9.6 surfaces it via `baf update status`.
      writeFileSync(join(updatesDir(hooks.userData), 'installer-handoff.json'), `${JSON.stringify({
        tag: scoped.manifest.tag,
        targetVersion: scoped.manifest.bafDsh,
        keyId: scoped.manifest.signature.keyId,
        releaseEpoch: scoped.manifest.releaseEpoch,
        pendingPlugin: plugin?.targetVersion ?? null,
        at: new Date().toISOString(),
      }, null, 2)}\n`, 'utf8')
      progress({ phase: 'shell', message: '即将打开安装程序，请按向导完成升级…', percent: 90 })
      await hooks.openInstaller(setupPath)
      launchedInstaller = true
      next.bafDsh = scoped.manifest.bafDsh
      saveVersions(hooks.userData, next)
      outcomes.push({ scope: 'harness', action: 'installer', ok: true })
      progress({ phase: 'done', message: '安装程序已启动', percent: 100 })
      return { ok: true, versions: next, restartedChild, launchedInstaller, scopes: outcomes }
    }

    // --- hot scopes: runtime + plugin, independent transactions ---
    const applied: Array<{ scope: UpdateScope; rollback: () => void; version: () => void }> = []
    const hotScopes: ScopedUpdatePlan[] = []
    if (harness?.action === 'apply') hotScopes.push(harness)
    if (plugin?.action === 'apply') hotScopes.push(plugin)
    const needRestart = hotScopes.length > 0
    if (needRestart) hooks.stopChild()

    for (const scope of hotScopes) {
      try {
        if (scope.scope === 'harness') {
          const art = scoped.manifest.artifacts.runtime
          if (art === undefined) throw new Error('manifest 缺少 runtime 包')
          progress({ phase: 'download', message: '正在下载运行时…', percent: 40 })
          const asset = await resolveReleaseAsset(config, scoped.manifest.tag, art)
          const zipPath = join(pending, art.name)
          await downloadAssetToFile(config, asset, zipPath, art.sha256)
          const nextDir = `${hooks.runtimeDir}.next`
          const bakDir = `${hooks.runtimeDir}.bak`
          rmSync(nextDir, { recursive: true, force: true })
          progress({ phase: 'extract', message: '正在解压运行时…', percent: 60 })
          // 9.7: extractZip validates entry paths (拒 ../绝对路径/symlink 逃逸).
          await extractZip(zipPath, nextDir)
          const nested = join(nextDir, 'dsh')
          const swapFrom = existsSync(nested) ? nested : nextDir
          progress({ phase: 'swap', message: '正在替换运行时…', percent: 70 })
          try {
            atomicSwapDir(hooks.runtimeDir, swapFrom, bakDir)
          } catch (err) {
            rollbackDir(hooks.runtimeDir, bakDir)
            throw err
          }
          if (swapFrom !== nextDir) rmSync(nextDir, { recursive: true, force: true })
          applied.push({
            scope: 'harness',
            rollback: () => rollbackDir(hooks.runtimeDir, `${hooks.runtimeDir}.bak`),
            version: () => { next.dsh = scoped.manifest.dsh },
          })
          outcomes.push({ scope: 'harness', action: 'apply', ok: true })
        } else {
          const art = scoped.manifest.artifacts.plugin
          if (art === undefined) throw new Error('manifest 缺少 plugin 包')
          progress({ phase: 'download', message: '正在下载插件包…', percent: 45 })
          const asset = await resolveReleaseAsset(config, scoped.manifest.tag, art)
          const zipPath = join(pending, art.name)
          await downloadAssetToFile(config, asset, zipPath, art.sha256)
          const nextDir = `${hooks.pluginDir}.next`
          const bakDir = `${hooks.pluginDir}.bak`
          rmSync(nextDir, { recursive: true, force: true })
          progress({ phase: 'extract', message: '正在解压插件包…', percent: 55 })
          await extractZip(zipPath, nextDir)
          progress({ phase: 'swap', message: '正在替换插件包…', percent: 65 })
          try {
            atomicSwapDir(hooks.pluginDir, nextDir, bakDir)
          } catch (err) {
            rollbackDir(hooks.pluginDir, bakDir)
            throw err
          }
          applied.push({
            scope: 'plugin',
            rollback: () => rollbackDir(hooks.pluginDir, `${hooks.pluginDir}.bak`),
            version: () => { next.bafPlugin = scoped.manifest.bafPlugin },
          })
          outcomes.push({ scope: 'plugin', action: 'apply', ok: true })
        }
      } catch (err) {
        // Per-scope failure: THIS scope rolled itself back; other scopes
        // keep their own transactions (独立事务，互不误回滚).
        const message = err instanceof Error ? err.message : String(err)
        outcomes.push({ scope: scope.scope, action: 'apply', ok: false, error: message, rolledBack: true })
      }
    }

    // Versions only advance for scopes that actually committed.
    for (const entry of applied) entry.version()
    if (applied.length > 0) saveVersions(hooks.userData, next)

    if (needRestart) {
      progress({ phase: 'swap', message: '正在重启服务…', percent: 95 })
      const ok = await hooks.restartChild()
      restartedChild = true
      if (!ok) {
        // Restart failure rolls back the scopes applied in THIS pass, in
        // reverse order (plugin first — §11.6 child failure 仅回滚 plugin;
        // the runtime swap of this pass is equally unverified, so it goes
        // too; scopes from earlier passes are never touched).
        for (const entry of [...applied].reverse()) entry.rollback()
        saveVersions(hooks.userData, local)
        for (const outcome of outcomes) {
          if (outcome.ok && outcome.action === 'apply') {
            outcome.ok = false
            outcome.rolledBack = true
            outcome.error = '升级后服务未能就绪，已回滚'
          }
        }
        // Best-effort revive on the old bits — the child must not stay down.
        await hooks.restartChild().catch(() => undefined)
        throw new Error('升级后服务未能就绪，已回滚')
      }
    }

    progress({ phase: 'done', message: '更新完成', percent: 100 })
    const failed = outcomes.filter(o => !o.ok)
    return {
      ok: failed.length === 0,
      versions: next,
      ...(failed.length === 0 ? {} : { error: failed.map(f => `${f.scope}: ${f.error}`).join('；') }),
      restartedChild,
      launchedInstaller,
      scopes: outcomes,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    progress({ phase: 'error', message })
    return {
      ok: false,
      versions: local,
      error: message,
      restartedChild,
      launchedInstaller,
      scopes: outcomes,
    }
  }
}

/** Rollback outcome for {@link rollbackScope}. */
export type RollbackResult = {
  ok: boolean
  error?: string
  fromVersion?: string
  toVersion?: string
}

/** Minimal hook subset rollback needs (no downloads, no installer). */
export type RollbackHooks = {
  pluginDir: string
  runtimeDir: string
  userData: string
  stopChild: () => void
  restartChild: () => Promise<boolean>
  onProgress?: (p: ApplyProgress) => void
}

/** Read a version field out of a directory's plugin/package manifest. */
function versionInDir(dir: string, file: 'plugin-manifest.json' | 'package.json'): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { version?: unknown }
    return typeof raw.version === 'string' ? raw.version : undefined
  } catch {
    return undefined
  }
}

/**
 * Roll back one scope's last applied update (§11.8 `baf update rollback`):
 * restore the `.bak` the last swap kept, restart the child on the old bits,
 * and write the old version back into versions.json. The harness/desktop
 * scope is installer-managed and has no `.bak` — the caller refuses it in
 * its card; here only the two hot dirs are addressable.
 * @param scope - which hot scope to restore.
 * @param hooks - dirs + child lifecycle hooks.
 */
export async function rollbackScope(scope: 'plugin' | 'runtime', hooks: RollbackHooks): Promise<RollbackResult> {
  const liveDir = scope === 'plugin' ? hooks.pluginDir : hooks.runtimeDir
  const bakDir = `${liveDir}.bak`
  const versionFile = scope === 'plugin' ? 'plugin-manifest.json' as const : 'package.json' as const
  if (!existsSync(bakDir)) {
    return { ok: false, error: `没有可回滚的备份（${bakDir} 不存在）` }
  }
  const fromVersion = versionInDir(liveDir, versionFile)
  const toVersion = versionInDir(bakDir, versionFile)
  hooks.onProgress?.({ phase: 'swap', message: `正在回滚 ${scope === 'plugin' ? '插件' : '运行时'}…`, percent: 30 })
  hooks.stopChild()
  try {
    rollbackDir(liveDir, bakDir)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await hooks.restartChild().catch(() => undefined)
    return { ok: false, error: `回滚失败：${message}`, ...(fromVersion === undefined ? {} : { fromVersion }) }
  }
  const local = loadVersions(hooks.userData)
  const next: AppVersions = scope === 'plugin'
    ? { ...local, bafPlugin: toVersion ?? local.bafPlugin }
    : { ...local, dsh: toVersion ?? local.dsh }
  saveVersions(hooks.userData, next)
  hooks.onProgress?.({ phase: 'swap', message: '正在重启服务…', percent: 80 })
  const restarted = await hooks.restartChild()
  if (!restarted) {
    return {
      ok: false,
      error: '回滚后服务未能就绪',
      ...(fromVersion === undefined ? {} : { fromVersion }),
      ...(toVersion === undefined ? {} : { toVersion }),
    }
  }
  hooks.onProgress?.({ phase: 'done', message: '回滚完成', percent: 100 })
  return {
    ok: true,
    ...(fromVersion === undefined ? {} : { fromVersion }),
    ...(toVersion === undefined ? {} : { toVersion }),
  }
}

/**
 * Legacy flat-plan entry (§12 9.4 adapter) — routes the flat booleans into
 * the scoped engine so existing callers keep working unchanged.
 * @param config - GitHub download config.
 * @param plan - flat update plan.
 * @param local - current versions.
 * @param hooks - process/fs hooks owned by main.
 */
export async function applyUpdatePlan(
  config: GithubUpdateConfig,
  plan: UpdatePlan,
  local: AppVersions,
  hooks: ApplyHooks,
): Promise<ApplyResult> {
  const scoped: ScopedPlanResult = {
    plans: [
      plan.updateShell || plan.shellRequired
        ? {
            scope: 'harness',
            action: 'installer',
            currentVersion: local.bafDsh,
            targetVersion: plan.manifest.bafDsh,
            required: plan.shellRequired,
            restartRequired: true,
            reason: 'flat plan adapter',
          }
        : plan.updateRuntime
          ? {
              scope: 'harness',
              action: 'apply',
              currentVersion: local.dsh,
              targetVersion: plan.manifest.dsh,
              required: false,
              restartRequired: true,
              reason: 'flat plan adapter',
            }
          : NONE_PLAN('harness', local.bafDsh),
      plan.updatePlugin
        ? {
            scope: 'plugin',
            action: 'apply',
            currentVersion: local.bafPlugin,
            targetVersion: plan.manifest.bafPlugin,
            required: false,
            restartRequired: true,
            reason: 'flat plan adapter',
          }
        : NONE_PLAN('plugin', local.bafPlugin),
      NONE_PLAN('baseline', 'unknown'),
    ],
    manifest: plan.manifest,
    summaryZh: plan.summaryZh,
  }
  return applyScopedUpdate(config, scoped, local, hooks)
}

function NONE_PLAN(scope: UpdateScope, version: string): ScopedUpdatePlan {
  return {
    scope,
    action: 'none',
    currentVersion: version,
    targetVersion: version,
    required: false,
    restartRequired: false,
    reason: 'flat plan adapter',
  }
}
