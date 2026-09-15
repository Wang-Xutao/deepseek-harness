/**
 * Ready-budget for the `dsh web` child, kept out of main.ts so it can be unit
 * tested without pulling in Electron.
 */

/** Environment variable that overrides the default budget, in milliseconds. */
export const READY_TIMEOUT_ENV = 'BAF_DSH_READY_TIMEOUT_MS'

/**
 * How long the `dsh web` child may take to print its ready URL.
 *
 * The budget covers the child's own boot only: module expansion, node probing
 * and the plugin sync all finish before the child is spawned. What it has to
 * absorb is the first run after an install, where Windows Defender scans the
 * freshly expanded `node_modules` tree while the child loads it — on a slow
 * disk that runs into minutes. Expiring early turns a slow boot into a hard
 * failure the user cannot recover from, so the ceiling is deliberately
 * generous; override it with {@link READY_TIMEOUT_ENV} when diagnosing.
 */
export const DEFAULT_READY_TIMEOUT_MS = 240_000

/**
 * Resolve the ready budget, honouring the diagnostic override.
 * @param env - environment to read the override from.
 * @returns the budget in milliseconds; never zero or negative.
 */
export function readyTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const override = Number.parseInt(env[READY_TIMEOUT_ENV] ?? '', 10)
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_READY_TIMEOUT_MS
}
