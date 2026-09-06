/**
 * Workspace identity probes and change-id generation (Phase 0 freeze).
 * @module @deepseek-ai/dsh-baf-core/identity
 */

import { randomBytes } from 'node:crypto'

/** Git identity when a workspace is a repository. */
export interface GitIdentity {
  /** Current branch name, when available. */
  readonly branch?: string
  /** HEAD revision (full or abbreviated). */
  readonly revision?: string
}

/** Workspace identity used by intake, projection, and quality reports. */
export interface WorkspaceIdentity {
  /** Absolute workspace root. */
  readonly root: string
  /** Git facts when detectable. */
  readonly git?: GitIdentity
}

/**
 * Probe Git identity. Implementations may shell out; the default returns empty.
 * @param root - workspace root.
 * @returns branch/revision when known.
 */
export type GitIdentityProbe = (root: string) => Promise<GitIdentity>

/** Default probe that reports no Git facts (Phase 2 stub). */
export const unavailableGitProbe: GitIdentityProbe = async () => ({})

/**
 * Build a workspace identity record.
 * @param root - absolute workspace root.
 * @param probe - optional Git probe.
 * @returns identity with optional git facts.
 */
export async function resolveWorkspaceIdentity(
  root: string,
  probe: GitIdentityProbe = unavailableGitProbe,
): Promise<WorkspaceIdentity> {
  const git = await probe(root)
  return {
    root,
    ...git.branch === undefined && git.revision === undefined ? {} : { git },
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Normalize a free-form title into a change-id slug (≤ 32 chars, [a-z0-9-]).
 * @param raw - user or model supplied phrase.
 * @returns a safe slug, or `change` when nothing usable remains.
 */
export function slugifyChangeTitle(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '')
  return cleaned.length > 0 && SLUG.test(cleaned) ? cleaned : 'change'
}

/**
 * Generate a change id: `change-<yyyymmdd>-<slug>-<4 hex>`.
 * @param title - free-form title for the slug segment.
 * @param now - clock for the date segment (injectable in tests).
 * @param random - 2-byte entropy source (injectable in tests).
 * @returns a new change id.
 */
export function generateChangeId(
  title: string,
  now: () => Date = () => new Date(),
  random: () => Buffer = () => randomBytes(2),
): string {
  const stamp = now()
  const y = String(stamp.getUTCFullYear())
  const m = String(stamp.getUTCMonth() + 1).padStart(2, '0')
  const d = String(stamp.getUTCDate()).padStart(2, '0')
  const slug = slugifyChangeTitle(title)
  const suffix = random().toString('hex').slice(0, 4)
  return `change-${y}${m}${d}-${slug}-${suffix}`
}

/** Projection paths frozen in enterprise-inputs §8. */
export const PROJECTION_DIR = '.baf/projection'

/**
 * Absolute-style relative path for one change's event log.
 * @param changeId - change id.
 * @returns workspace-relative jsonl path.
 */
export function projectionLogPath(changeId: string): string {
  return `${PROJECTION_DIR}/${changeId}.jsonl`
}

/** Workspace-relative derived index path (non-authoritative). */
export const PROJECTION_INDEX_PATH = `${PROJECTION_DIR}/index.json`
