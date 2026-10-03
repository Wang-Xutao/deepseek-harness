/** Launcher-fact bridge for a packaged application's bundled package manager. */

import type { ProfilePnpmInvocation } from '@deepseek-ai/dsh-app-boot'

/** Environment variable carrying a JSON {@link ProfilePnpmInvocation} from the spawning launcher. */
export const PACKAGE_MANAGER_ENV = 'DSH_PACKAGE_MANAGER'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse the launcher-supplied package-manager fact from {@link PACKAGE_MANAGER_ENV}.
 * A malformed value warns and yields undefined so the caller falls back to its own
 * discovery; an absent or empty value is silence, not a problem.
 * @param raw The environment variable's current value.
 * @param warn Receives one diagnostic line for a malformed value.
 * @returns The validated invocation, or undefined when no usable fact is present.
 */
export function packageManagerFromEnv(
  raw: string | undefined,
  warn: (message: string) => void,
): ProfilePnpmInvocation | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    warn(`${PACKAGE_MANAGER_ENV} is not valid JSON; using the PATH package manager`)
    return undefined
  }
  if (!isRecord(parsed) || typeof parsed.command !== 'string' || parsed.command === '') {
    warn(`${PACKAGE_MANAGER_ENV} has no command string; using the PATH package manager`)
    return undefined
  }
  if (parsed.args !== undefined && (!Array.isArray(parsed.args) || parsed.args.some(arg => typeof arg !== 'string'))) {
    warn(`${PACKAGE_MANAGER_ENV} has a non-string args entry; using the PATH package manager`)
    return undefined
  }
  if (parsed.env !== undefined && (!isRecord(parsed.env)
    || Object.entries(parsed.env).some(([key, value]) => typeof key !== 'string' || typeof value !== 'string'))) {
    warn(`${PACKAGE_MANAGER_ENV} has a non-string env value; using the PATH package manager`)
    return undefined
  }
  return {
    command: parsed.command,
    args: Array.isArray(parsed.args) ? parsed.args : [],
    env: isRecord(parsed.env) ? parsed.env as Record<string, string> : {},
  }
}
