import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { shell } from 'electron'
import type { AppVersions } from '../versions.ts'
import { saveVersions } from '../versions.ts'
import { atomicSwapDir, extractZip, rollbackDir } from './extract.ts'
import {
  downloadAssetToFile,
  resolveReleaseAsset,
  updatesDir,
  type GithubUpdateConfig,
} from './github.ts'
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
}

export type ApplyHooks = {
  onProgress?: (p: ApplyProgress) => void
  /** Stop the dsh child before swapping runtime/plugin. */
  stopChild: () => void
  /** Start dsh again after a hot update; return true when ready. */
  restartChild: () => Promise<boolean>
  pluginDir: string
  runtimeDir: string
  userData: string
}

/**
 * Apply the layers selected by the plan.
 * @param config - GitHub download config.
 * @param plan - update plan.
 * @param local - current versions.
 * @param hooks - process/fs hooks owned by main.
 */
export async function applyUpdatePlan(
  config: GithubUpdateConfig,
  plan: UpdatePlan,
  local: AppVersions,
  hooks: ApplyHooks,
): Promise<ApplyResult> {
  const next: AppVersions = { ...local }
  let restartedChild = false
  let launchedInstaller = false
  const pending = join(updatesDir(hooks.userData), 'pending')
  mkdirSync(pending, { recursive: true })
  const progress = (p: ApplyProgress): void => {
    hooks.onProgress?.(p)
  }

  try {
    if (plan.updateShell || plan.shellRequired) {
      const art = plan.manifest.artifacts.shell
      if (art === undefined) throw new Error('manifest 缺少 shell 安装包')
      progress({ phase: 'download', message: '正在下载安装包…', percent: 10 })
      const asset = await resolveReleaseAsset(config, plan.manifest.tag, art)
      const setupPath = join(pending, art.name)
      await downloadAssetToFile(config, asset, setupPath, art.sha256)
      progress({ phase: 'shell', message: '即将打开安装程序，请按向导完成升级…', percent: 90 })
      await shell.openPath(setupPath)
      launchedInstaller = true
      next.bafDsh = plan.manifest.bafDsh
      saveVersions(hooks.userData, next)
      progress({ phase: 'done', message: '安装程序已启动', percent: 100 })
      return { ok: true, versions: next, restartedChild, launchedInstaller }
    }

    const needRestart = plan.updatePlugin || plan.updateRuntime
    if (needRestart) hooks.stopChild()

    if (plan.updatePlugin) {
      const art = plan.manifest.artifacts.plugin
      if (art === undefined) throw new Error('manifest 缺少 plugin 包')
      progress({ phase: 'download', message: '正在下载插件包…', percent: 20 })
      const asset = await resolveReleaseAsset(config, plan.manifest.tag, art)
      const zipPath = join(pending, art.name)
      await downloadAssetToFile(config, asset, zipPath, art.sha256)
      const nextDir = `${hooks.pluginDir}.next`
      const bakDir = `${hooks.pluginDir}.bak`
      rmSync(nextDir, { recursive: true, force: true })
      progress({ phase: 'extract', message: '正在解压插件包…', percent: 45 })
      await extractZip(zipPath, nextDir)
      progress({ phase: 'swap', message: '正在替换插件包…', percent: 60 })
      try {
        atomicSwapDir(hooks.pluginDir, nextDir, bakDir)
        next.bafPlugin = plan.manifest.bafPlugin
      } catch (err) {
        rollbackDir(hooks.pluginDir, bakDir)
        throw err
      }
    }

    if (plan.updateRuntime) {
      const art = plan.manifest.artifacts.runtime
      if (art === undefined) throw new Error('manifest 缺少 runtime 包')
      progress({ phase: 'download', message: '正在下载运行时…', percent: 65 })
      const asset = await resolveReleaseAsset(config, plan.manifest.tag, art)
      const zipPath = join(pending, art.name)
      await downloadAssetToFile(config, asset, zipPath, art.sha256)
      const nextDir = `${hooks.runtimeDir}.next`
      const bakDir = `${hooks.runtimeDir}.bak`
      rmSync(nextDir, { recursive: true, force: true })
      progress({ phase: 'extract', message: '正在解压运行时…', percent: 80 })
      await extractZip(zipPath, nextDir)
      const nested = join(nextDir, 'dsh')
      const swapFrom = existsSync(nested) ? nested : nextDir
      progress({ phase: 'swap', message: '正在替换运行时…', percent: 88 })
      try {
        atomicSwapDir(hooks.runtimeDir, swapFrom, bakDir)
        if (swapFrom !== nextDir) rmSync(nextDir, { recursive: true, force: true })
        next.dsh = plan.manifest.dsh
      } catch (err) {
        rollbackDir(hooks.runtimeDir, bakDir)
        throw err
      }
    }

    saveVersions(hooks.userData, next)

    if (needRestart) {
      progress({ phase: 'swap', message: '正在重启服务…', percent: 95 })
      const ok = await hooks.restartChild()
      restartedChild = true
      if (!ok) {
        if (plan.updateRuntime) rollbackDir(hooks.runtimeDir, `${hooks.runtimeDir}.bak`)
        if (plan.updatePlugin) rollbackDir(hooks.pluginDir, `${hooks.pluginDir}.bak`)
        saveVersions(hooks.userData, local)
        throw new Error('升级后服务未能就绪，已回滚')
      }
    }

    progress({ phase: 'done', message: '更新完成', percent: 100 })
    return { ok: true, versions: next, restartedChild, launchedInstaller }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    progress({ phase: 'error', message })
    return { ok: false, versions: local, error: message, restartedChild, launchedInstaller }
  }
}
