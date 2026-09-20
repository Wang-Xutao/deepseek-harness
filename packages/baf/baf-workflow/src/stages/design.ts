/**
 * N3 design stage handler (§12 Phase 5.3): write `design.md` citing real
 * repository paths, then gate T7/T7a.
 * @module @deepseek-ai/dsh-baf-workflow/stages/design
 */

import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { BafError, type WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import type { StageContext } from './context.ts'
import { designGate } from './gates.ts'
import { writeArtifact } from './write.ts'
import { stageArtifactPaths } from './artifacts.ts'

/** Input for {@link driveDesign}. */
export interface DesignInput {
  readonly changeId: string
  /** Chosen approach: interfaces, data flow, error paths, compatibility. */
  readonly approach: string
  /** Real repository paths/APIs the design cites (existence-checked). */
  readonly references: readonly string[]
  /** Risk list with mitigations. */
  readonly risks?: readonly string[]
}

/** Result of a successful design drive. */
export interface DesignStageResult {
  readonly status: WorkflowStatus
  readonly artifacts: readonly string[]
}

/**
 * Verify every cited repository path exists under the workspace.
 * @param workspaceRoot - absolute workspace root.
 * @param references - workspace-relative paths.
 * @returns missing paths (empty when all exist).
 */
export async function missingReferences(
  workspaceRoot: string,
  references: readonly string[],
): Promise<readonly string[]> {
  const missing: string[] = []
  for (const ref of references) {
    try {
      await stat(join(workspaceRoot, ref))
    } catch {
      missing.push(ref)
    }
  }
  return missing
}

/**
 * Render design.md body from structured input.
 * @param input - design fields.
 * @returns markdown body.
 */
export function renderDesignBody(input: DesignInput): string {
  const lines: string[] = [
    `# Design — ${input.changeId}`,
    '',
    '## Approach',
    '',
    input.approach,
    '',
    '## Repository references',
    '',
  ]
  if (input.references.length === 0) lines.push('TODO: every conclusion cites real files/APIs, e.g. `packages/.../src/foo.ts`.')
  for (const ref of input.references) lines.push(`- \`${ref}\``)
  lines.push('', '## Risks', '')
  const risks = input.risks ?? []
  if (risks.length === 0) lines.push('TODO: risk list with mitigations.')
  for (const risk of risks) lines.push(`- ${risk}`)
  lines.push('')
  return lines.join('\n')
}

/**
 * Drive the design stage: install the artifact, existence-check citations,
 * then run the T7 gate.
 * @param ctx - stage context.
 * @param input - design fields.
 * @returns updated status plus artifact paths (gate already passed).
 * @throws {BafError} invalid_transition when a cited path is missing or the gate fails.
 */
export async function driveDesign(
  ctx: StageContext,
  input: DesignInput,
): Promise<DesignStageResult> {
  const missing = await missingReferences(ctx.workspace.root, input.references)
  if (missing.length > 0) {
    throw new BafError('invalid_transition', `design cites missing paths: ${missing.join(', ')}`, {
      changeId: input.changeId,
      missing,
    })
  }
  await writeArtifact(
    ctx.workspace.root,
    input.changeId,
    ARTIFACT_FILES.design,
    renderDesignBody(input),
  )
  const gate = await designGate({
    workspaceRoot: ctx.workspace.root,
    changeId: input.changeId,
    mode: 'full-go-path',
  })
  if (!gate.ok) {
    throw new BafError(
      'invalid_transition',
      `design gate failed: ${gate.reasonCodes.join(', ')} — ${gate.detail ?? ''}`,
      { changeId: input.changeId, reasonCodes: gate.reasonCodes },
    )
  }
  return {
    status: await ctx.store.readStatus(input.changeId),
    artifacts: stageArtifactPaths(ctx.workspace.root, input.changeId, [ARTIFACT_FILES.design]),
  }
}
