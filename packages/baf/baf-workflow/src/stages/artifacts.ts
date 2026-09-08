/**
 * Per-stage durable artifact path helpers for projection events.
 * Directory names live in @deepseek-ai/dsh-baf-openspec/layout; this module
 * only turns them into the workspace-relative strings recorded on
 * stage-completed events.
 * @module @deepseek-ai/dsh-baf-workflow/stages/artifacts
 */

import { changeDir } from '@deepseek-ai/dsh-baf-openspec'
import { join } from 'node:path'

/**
 * Workspace-relative artifact paths recorded into projection events.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @param files - artifact file names inside the change directory.
 * @returns absolute artifact paths (join of change dir + file).
 */
export function stageArtifactPaths(
  workspaceRoot: string,
  changeId: string,
  files: readonly string[],
): string[] {
  const dir = changeDir(workspaceRoot, changeId)
  return files.map(file => join(dir, file))
}
