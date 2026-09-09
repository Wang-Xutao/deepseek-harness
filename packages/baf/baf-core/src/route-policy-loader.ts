/**
 * Node-only file loader for {@link parseEnterpriseRoutePolicy}.
 * Lives apart from the shared `route-policy.ts` vocabulary so the Client face
 * never pulls `node:fs/promises` into the browser bundle.
 * @module @deepseek-ai/dsh-baf-core/route-policy-loader
 */

import { readFile } from 'node:fs/promises'
import { load as loadYaml } from 'js-yaml'
import { BafError } from './errors.ts'
import type { EnterpriseRoutePolicy } from './route-policy.ts'
import { parseEnterpriseRoutePolicy } from './route-policy.ts'

/**
 * Load an enterprise route policy YAML file.
 * @param path - filesystem path from deployment config.
 * @returns validated policy.
 */
export async function loadEnterpriseRoutePolicyFile(path: string): Promise<EnterpriseRoutePolicy> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    throw new BafError('policy_missing', `enterprise route policy unreadable at ${path}`, {
      field: 'enterpriseRoutePolicyPath',
      consumer: 'loadEnterpriseRoutePolicyFile',
      path,
      cause: error instanceof Error ? error.message : String(error),
    })
  }
  let raw: unknown
  try {
    raw = loadYaml(text)
  } catch (error) {
    throw new BafError('policy_missing', `enterprise route policy YAML parse failed at ${path}`, {
      field: 'enterpriseRoutePolicyPath',
      consumer: 'loadEnterpriseRoutePolicyFile',
      path,
      cause: error instanceof Error ? error.message : String(error),
    })
  }
  return parseEnterpriseRoutePolicy(raw, path)
}
