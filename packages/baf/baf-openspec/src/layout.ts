/**
 * Frozen workspace-local OpenSpec layout: roots and per-stage artifact names.
 * @module @deepseek-ai/dsh-baf-openspec/layout
 */

import { join } from 'node:path'

/** Workspace-relative OpenSpec root (matches baseline `openspec.root`). */
export const OPENSPEC_ROOT = 'openspec'

/** Workspace-relative changes root (matches baseline `openspec.changeRoot`). */
export const OPENSPEC_CHANGES = `${OPENSPEC_ROOT}/changes`

/** Workspace-relative archive root for completed changes. */
export const OPENSPEC_ARCHIVE = `${OPENSPEC_CHANGES}/archive`

/**
 * Absolute changes directory for a workspace.
 * @param workspaceRoot - absolute workspace root.
 * @returns absolute changes dir.
 */
export function changesDir(workspaceRoot: string): string {
  return join(workspaceRoot, OPENSPEC_CHANGES)
}

/**
 * Absolute archive directory for a workspace.
 * @param workspaceRoot - absolute workspace root.
 * @returns absolute archive dir.
 */
export function archiveDir(workspaceRoot: string): string {
  return join(workspaceRoot, OPENSPEC_ARCHIVE)
}

/**
 * Absolute change directory for one change.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @returns absolute change dir.
 */
export function changeDir(workspaceRoot: string, changeId: string): string {
  return join(changesDir(workspaceRoot), changeId)
}

/**
 * Absolute archive destination for one archived change.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @returns absolute archived change dir.
 */
export function archivedChangeDir(workspaceRoot: string, changeId: string): string {
  return join(archiveDir(workspaceRoot), changeId)
}

/** Stage artifact files written by full-go-path handlers. */
export const ARTIFACT_FILES = {
  proposal: 'proposal.md',
  clarify: 'clarify.md',
  design: 'design.md',
  tasks: 'tasks.md',
  plan: 'plan.md',
  planJson: 'plan.json',
} as const

/** One artifact file key. */
export type ArtifactFileKey = keyof typeof ARTIFACT_FILES
