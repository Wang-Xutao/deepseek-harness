/**
 * Route-tier config file IO at `~/.dsh/baf-route-config.json` (host-process
 * level, shared across workspaces). Synchronous on purpose: the dispatch-time
 * route callback runs inside the sync `GoDispatch` path and re-reads the
 * file so a settings save applies to the very next work order. Missing or
 * invalid files always read as undefined — routing bypasses, never blocks.
 * @module @deepseek-ai/dsh-baf-workflow/route-config-io
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { parseRouteTierConfig, type RouteTierConfig } from '@deepseek-ai/dsh-baf-core'

/**
 * Resolve the config file path.
 * @param override - tests pass an explicit path.
 */
export function routeTierConfigPath(override?: string): string {
  return override ?? dshHomePath('baf-route-config.json')
}

/**
 * Read and validate the config file synchronously.
 * @param pathOverride - tests pass an explicit path.
 * @returns normalized config, or undefined when missing/corrupt/invalid.
 */
export function readRouteTierConfigSync(pathOverride?: string): RouteTierConfig | undefined {
  const path = routeTierConfigPath(pathOverride)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
  try {
    return parseRouteTierConfig(JSON.parse(raw))
  } catch {
    return undefined
  }
}

/**
 * Atomically write the config (tmp file + rename so a crash mid-write never
 * leaves a torn document behind).
 * @param pathOverride - tests pass an explicit path.
 * @param config - config to persist.
 */
export function writeRouteTierConfigSync(pathOverride: string | undefined, config: RouteTierConfig): void {
  const path = routeTierConfigPath(pathOverride)
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  renameSync(tmp, path)
}

/**
 * Remove the config file (settings "reset"); a no-op when absent.
 * @param pathOverride - tests pass an explicit path.
 */
export function resetRouteTierConfigSync(pathOverride?: string): void {
  const path = routeTierConfigPath(pathOverride)
  if (existsSync(path)) rmSync(path, { force: true })
}
