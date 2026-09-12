/**
 * BafGuard Cordis service: exposes the guard policy (verify-time async
 * contract) and the ToolGuard factory on the entry-local BAF domain realm.
 * The per-agent hard gate itself mounts through the non-isolated
 * `@deepseek-ai/dsh-baf-guard/install` row (agent/created → tools.guard).
 * @module @deepseek-ai/dsh-baf-guard/service
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { GuardInput, GuardPolicy, GuardReport } from '@deepseek-ai/dsh-baf-core'
import { adjudicateStructuralPath, scanTextSecrets } from './policy.ts'
import { loadGuardConfig } from './projection-state.ts'
import { createBafToolGuard, type BafToolGuardOptions } from './tool-guard.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** BAF guard service (baf-domain isolate). */
    bafGuard: BafGuard
  }
}

/** Composition config for {@link BafGuard}. */
export interface Config {}

/**
 * Owns guard factories. Stateless: every policy check and tool-guard call
 * re-reads the workspace projection and baseline synchronously.
 */
export class BafGuard extends Service {
  static Config = z.object({})

  constructor(ctx: Context, _config: Config) {
    super(ctx, 'bafGuard')
  }

  /**
   * GuardPolicy bound to one workspace for the verify stage.
   * Supported actions: `verify` (protected/system/escape over touched
   * paths) and `secret-scan` (content scan of touched paths).
   * @param workspaceRoot - absolute workspace root.
   * @returns GuardPolicy for StageContext.guard wiring.
   */
  policy(workspaceRoot: string): GuardPolicy {
    return {
      check: async (input: GuardInput, _signal: AbortSignal): Promise<GuardReport> => {
        const root = workspaceRoot || input.workspace.root
        const config = loadGuardConfig(root)
        if (input.action === 'verify') {
          const codes: string[] = []
          for (const path of input.paths) {
            const decision = adjudicateStructuralPath(config, root, path)
            if (!decision.allowed) codes.push(decision.reasonCode)
          }
          return { allowed: codes.length === 0, reasonCodes: codes }
        }
        if (input.action === 'secret-scan') {
          if (input.baseline.guard.secretScan === 'off') {
            return { allowed: true, reasonCodes: [] }
          }
          const labels: string[] = []
          for (const path of input.paths) {
            try {
              const text = readFileSync(join(root, path), 'utf8')
              labels.push(...scanTextSecrets(text))
            } catch {
              // Unreadable path: nothing to scan.
            }
          }
          return labels.length === 0
            ? { allowed: true, reasonCodes: [] }
            : { allowed: false, reasonCodes: ['secret_detected', ...new Set(labels)] }
        }
        return { allowed: false, reasonCodes: ['invalid_transition'] }
      },
    }
  }

  /**
   * Create the synchronous per-agent ToolGuard.
   * @param options - workspace binding and test source overrides.
   * @returns ToolGuard returning denial strings.
   */
  toolGuard(options: BafToolGuardOptions) {
    return createBafToolGuard(options)
  }

  /**
   * Help string for slash/CLI.
   * @returns summary.
   */
  help(): string {
    return 'BAF guard: baseline-driven hard gate over fs/shell tools (sync projection adjudication + secret scan).'
  }
}

export default BafGuard
