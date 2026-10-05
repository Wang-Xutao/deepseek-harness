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
import {
  BUILTIN_KEYWORD_PRESETS, effectiveKeywordRules, parseRouteKeywordPresets, parseRouteTierConfig,
  type BuiltinKeywordPreset, type RouteKeywordPresetsFile, type RouteTierConfig, type TierKeywordRule,
} from '@deepseek-ai/dsh-baf-core'

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

/**
 * Resolve the preset word-library file path
 * (`~/.dsh/baf-route-presets.json`, 2026-10-06 问题 4).
 * @param override - tests pass an explicit path.
 */
export function routePresetsPath(override?: string): string {
  return override ?? dshHomePath('baf-route-presets.json')
}

/**
 * Read the user-editable preset word library synchronously. A missing file
 * SEEDS from the code builtins on first read (the user then edits a real
 * file); a corrupt/invalid file falls back to the code builtins WITHOUT
 * overwriting the user's document.
 * @param pathOverride - tests pass an explicit path.
 * @returns the pack list (never empty — builtins are the floor).
 */
export function readRoutePresetsSync(pathOverride?: string): RouteKeywordPresetsFile {
  const path = routePresetsPath(pathOverride)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    writeRoutePresetsSync(pathOverride, { schema: 1, packs: [...BUILTIN_KEYWORD_PRESETS] })
    return { schema: 1, packs: [...BUILTIN_KEYWORD_PRESETS] }
  }
  try {
    return parseRouteKeywordPresets(JSON.parse(raw)) ?? { schema: 1, packs: [...BUILTIN_KEYWORD_PRESETS] }
  } catch {
    return { schema: 1, packs: [...BUILTIN_KEYWORD_PRESETS] }
  }
}

/**
 * Atomically write the preset word library.
 * @param pathOverride - tests pass an explicit path.
 * @param file - packs to persist.
 */
export function writeRoutePresetsSync(pathOverride: string | undefined, file: RouteKeywordPresetsFile): void {
  const path = routePresetsPath(pathOverride)
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
  renameSync(tmp, path)
}

/**
 * The one effective-rule fold every evaluation point runs (intake freeze,
 * confirm backfill, auto routing, settings 预演): the FILE packs under the
 * config's enable states (`packs` / `presetWords`), behind the user's own
 * rules with their `enabled` flags honored. A missing config still evaluates
 * the file packs — the presets do not depend on a saved config.
 * @param config - normalized config (or undefined on a fresh machine).
 * @param presetsPathOverride - tests pass an explicit presets path.
 * @returns the rules a task description evaluates, first-match-wins.
 */
export function effectiveRouteKeywordRules(
  config: RouteTierConfig | undefined,
  presetsPathOverride?: string,
): TierKeywordRule[] {
  const presets: readonly BuiltinKeywordPreset[] = readRoutePresetsSync(presetsPathOverride).packs
  return effectiveKeywordRules(config?.keywords, {
    presets,
    ...(config?.packs === undefined ? {} : { packs: config.packs }),
    ...(config?.presetWords === undefined ? {} : { presetWords: config.presetWords }),
  })
}
