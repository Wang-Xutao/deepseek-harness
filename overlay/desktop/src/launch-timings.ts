/**
 * Internal launch-time phase timings, written next to other Electron state.
 *
 * Each labeled timestamp is captured in milliseconds since `app.whenReady` first
 * fired (`process.startup`-anchored). The measurement stays out of the public
 * IPC surface — A/B comparisons happen by reading the JSON file directly.
 * @module @baf-dsh-desktop/launch-timings
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** Phases the desktop shell marks in order. Names are stable: do not rename. */
export type LaunchPhase =
  | 'app-ready'
  | 'splash-shown'
  | 'dsh-spawn'
  | 'dsh-ready'
  | 'main-load-url'
  | 'main-shown'
  | 'splash-closed'

/** Origin timestamp captured at module load (= electron main entry). */
const T0_MS = Date.now()

/** Phase marks written to disk in registration order. */
const marks: { phase: LaunchPhase, atMs: number }[] = []

/** When true, every subsequent {@link mark} also appends to the timings file. */
let writeEnabled = false

/** Path of the per-launch timings file, set when {@link enableWrites} runs. */
let timingsPath: string | undefined

/**
 * Persist future marks to `userData/launch-timings.jsonl`.
 * @param userData - the Electron `app.getPath('userData')` value.
 */
export function enableWrites(userData: string): void {
  if (writeEnabled) return
  mkdirSync(userData, { recursive: true })
  timingsPath = join(userData, 'launch-timings.jsonl')
  // Write the run header so a JSONL parser can split per-launch segments.
  appendFileSync(timingsPath, `${JSON.stringify({ kind: 'run', atMs: 0, t0Ms: T0_MS })}\n`, 'utf8')
  writeEnabled = true
  // Replay early marks captured before writes were enabled (`app-ready` is
  // recorded at module load so it lands before `whenReady` can open the
  // timings file). Without this, `app-ready` exists in memory but never on
  // disk, and the bench harness can't compute `app-ready → main-shown`.
  for (const entry of marks) {
    appendFileSync(timingsPath, `${JSON.stringify({ kind: 'mark', phase: entry.phase, atMs: entry.atMs })}\n`, 'utf8')
  }
}

/**
 * Record one phase at the current wall-clock instant.
 * @param phase - the phase name (see {@link LaunchPhase}).
 */
export function mark(phase: LaunchPhase): void {
  const atMs = Date.now() - T0_MS
  marks.push({ phase, atMs })
  if (writeEnabled && timingsPath !== undefined) {
    appendFileSync(timingsPath, `${JSON.stringify({ kind: 'mark', phase, atMs })}\n`, 'utf8')
  }
}

/** Snapshot of all recorded phases, for the in-memory summary log. */
export function snapshot(): readonly { phase: LaunchPhase, atMs: number }[] {
  return [...marks]
}

/** Reset for tests; never call from production code paths. */
export function reset(): void {
  marks.length = 0
  writeEnabled = false
  timingsPath = undefined
}
