/**
 * Guard policy core: pure, synchronous adjudication of filesystem writes and
 * shell commands against the baseline guard section and the workflow state
 * snapshot (enterprise-workflow §8.6, §12.7.3).
 *
 * Stable reason codes come first in every denial string so callers (and tests)
 * can match `code:` without parsing prose. The core is deliberately I/O-free:
 * projection state and baseline config are read by the caller and passed in.
 * @module @deepseek-ai/dsh-baf-guard/policy
 */

import { isAbsolute, normalize, relative, resolve } from 'node:path'

/** Stable denial reason codes (§8.6 enumerated set plus scope/v1 codes). */
export type GuardReasonCode =
  | 'intake_confirmation_required'
  | 'protected_path'
  | 'secret_detected'
  | 'workspace_escape'
  | 'path_traversal'
  | 'system_resource_conflict'
  | 'invalid_transition'
  | 'scope_exceeded'
  | 'dangerous_command'
  | 'shell_indirect_write'
  | 'gate_pending_ask_blocked'

/** Snapshot of the workflow state a guard call adjudicates against. */
export interface GuardWorkflowState {
  /** A non-terminal change exists in the projection. */
  readonly active: boolean
  readonly changeId?: string
  readonly stage?: string
  readonly mode?: string
  /** Intake confirmation observed in the projection (fail-closed default false). */
  readonly intakeConfirmed: boolean
  /** Allowlist from plan.json / bug-fix-path-ledger.json of the active change. */
  readonly allowlist: readonly string[]
  /** Workspace-relative change dir (docs home), e.g. `openspec/changes/<id>`. */
  readonly changeDirRel?: string
  /**
   * §22.17 J — a customer-confirmation gate is pending (unconfirmed intake
   * classification, or a parked awaiting-confirm gate A/B). When true, the
   * generic question tool must not substitute for the registry gate card.
   */
  readonly gatePending?: boolean
}

/** Baseline-derived guard configuration. */
export interface GuardPolicyConfig {
  readonly secretScan: 'required' | 'optional' | 'off'
  readonly protectedPaths: readonly string[]
}

/** Fail-closed defaults when no baseline is loadable. */
export const DEFAULT_GUARD_CONFIG: GuardPolicyConfig = {
  secretScan: 'required',
  protectedPaths: [],
}

/** Allowance (no reason code) or a stable-code denial. */
export type GuardDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reasonCode: GuardReasonCode; readonly message: string }

const allow: GuardDecision = { allowed: true }

function deny(reasonCode: GuardReasonCode, message: string): GuardDecision {
  return { allowed: false, reasonCode, message }
}

/** Normalize separators for comparison and drop a leading './'. */
export function normalizeRel(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

function hasTraversal(path: string): boolean {
  return normalizeRel(path).split('/').includes('..')
}

/**
 * Resolve a target path against the workspace root and report whether it
 * stays inside. Pure path work — no filesystem access.
 */
export function withinWorkspace(root: string, target: string): { rel: string; inside: boolean } {
  const abs = isAbsolute(target) ? normalize(target) : resolve(root, target)
  const rel = normalize(relative(root, abs))
  const inside = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  return { rel: normalizeRel(rel), inside }
}

/** Path-prefix membership with `/` boundaries; entries may end in `/**`. */
export function matchesPathEntry(rel: string, entry: string): boolean {
  const normEntry = normalizeRel(entry).replace(/\/\*{1,2}$/, '').replace(/\/$/, '')
  if (normEntry === '') return false
  return rel === normEntry || rel.startsWith(`${normEntry}/`)
}

function isProtected(rel: string, config: GuardPolicyConfig): boolean {
  return config.protectedPaths.some(entry => (entry.trim() === '<enterprise-tbd>'
    ? false
    : matchesPathEntry(rel, entry)))
}

/**
 * Built-in protected paths the guard enforces even when the baseline omits them
 * (§22.15 D). The list is additive — baselines may only **add** paths, never
 * widen these. `.baf/**` is already covered by {@link isSystemResource};
 * `openspec/**` lives in this list because the docs the model authors through
 * guarded writes sit under the active change's `openspec/changes/<id>/` and
 * must remain writable, while every *other* `openspec/**` (older changes,
 * archive targets, the spec/ folder) is forbidden from being touched.
 *
 * The check is applied only by {@link adjudicateFsWrite} (after the change-dir
 * allowance) — placing it in {@link adjudicateStructuralPath} would also flag
 * the verify-time `GuardPolicy.check('verify', …)` action, which scans the
 * historical touched set including legitimate openspec change-dir artifacts.
 */
export const BAF_CONTROLLED_PATHS: readonly string[] = ['.baf/**', 'openspec/**']

function isBafControlled(rel: string): boolean {
  return BAF_CONTROLLED_PATHS.some(entry => matchesPathEntry(rel, entry))
}

function isSystemResource(rel: string): boolean {
  return rel === '.git' || rel.startsWith('.git/')
    || rel === '.baf' || rel.startsWith('.baf/')
}

const SECRET_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/ },
  { label: 'github-token', pattern: /\bghp_[A-Za-z0-9]{30,}\b/ },
  { label: 'github-oauth', pattern: /\bgho_[A-Za-z0-9]{30,}\b/ },
  { label: 'gitlab-token', pattern: /\bglpat-[A-Za-z0-9\-_]{16,}\b/ },
  { label: 'api-key', pattern: /\bsk-[A-Za-z0-9]{16,}\b/ },
  { label: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/ },
  { label: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
]

/**
 * Scan text for common credential shapes.
 * @returns labels of the detected secret classes (empty when clean).
 */
export function scanTextSecrets(text: string): readonly string[] {
  const hits: string[] = []
  for (const { label, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) hits.push(label)
  }
  return hits
}

/** Stages where model-authored documents live in the change dir. */
const DOC_STAGES = new Set(['clarify', 'design', 'plan'])

/** Filesystem-write adjudication input. */
export interface FsWriteInput {
  /** Absolute workspace root. */
  readonly root: string
  /** Tool-provided target path (absolute or cwd-relative). */
  readonly path: string
  /** Full new content (write) or replacement text (edit); scanned when set. */
  readonly content?: string
}

/**
 * Structural path checks shared by the tool guard and the verify action:
 * traversal, workspace escape, system resources, protected paths — never
 * stage/intake policy (verify-time paths are historical, not new writes).
 */
export function adjudicateStructuralPath(
  config: GuardPolicyConfig,
  root: string,
  path: string,
): GuardDecision {
  if (hasTraversal(path)) {
    return deny('path_traversal', `path traversal in ${path}`)
  }
  const { rel, inside } = withinWorkspace(root, path)
  if (!inside) {
    return deny('workspace_escape', `${path} resolves outside the workspace`)
  }
  if (isSystemResource(rel)) {
    return deny('system_resource_conflict', `${rel} is owned by the workflow; use its commands`)
  }
  if (isProtected(rel, config)) {
    return deny('protected_path', `${rel} is protected by the baseline`)
  }
  return allow
}

/**
 * Adjudicate one filesystem write.
 * @param config - baseline guard section.
 * @param state - workflow snapshot.
 * @param input - write target and content.
 * @returns allow or a stable-code denial.
 */
export function adjudicateFsWrite(
  config: GuardPolicyConfig,
  state: GuardWorkflowState,
  input: FsWriteInput,
): GuardDecision {
  const structural = adjudicateStructuralPath(config, input.root, input.path)
  if (!structural.allowed) return structural
  if (config.secretScan !== 'off' && input.content !== undefined) {
    const hits = scanTextSecrets(input.content)
    if (hits.length > 0) return deny('secret_detected', `content matches secret patterns: ${hits.join(', ')}`)
  }
  const { rel } = withinWorkspace(input.root, input.path)
  if (!state.active || state.changeId === undefined) {
    return deny('intake_confirmation_required', 'no active change: start and confirm one in the workflow tab first')
  }
  if (!state.intakeConfirmed) {
    return deny('intake_confirmation_required', `intake for ${state.changeId} is not confirmed yet`)
  }
  const inChangeDir = state.changeDirRel !== undefined && matchesPathEntry(rel, state.changeDirRel)
  const stage = state.stage ?? 'intake'
  if (inChangeDir && (DOC_STAGES.has(stage) || stage === 'implement')) return allow
  // 【变更】2026-09-28 (用户问题 8): the verify stage's one writable artifact is
  // checklist.md — the model ticks `- [ ]` → `- [x]` as verification confirms
  // each item (gate B hard-checks every box before archive). Everything else
  // in the change dir stays protected at verify.
  if (inChangeDir && stage === 'verify' && state.changeDirRel !== undefined
    && rel === `${state.changeDirRel}/checklist.md`) return allow
  // 【变更】2026-09-22 (web walk, change 170b — user report #1): open's
  // artifact is proposal.md, but open was never a DOC_STAGE — every
  // change-dir write at open bounced as protected_path, so the model could
  // not author the proposal at all (it misread the block as "artifacts are
  // workflow-managed" and idled). Allow EXACTLY proposal.md at open, not the
  // whole change dir: clarify/design/plan must stay unwritable until their
  // stage begins, or the stage order the gates enforce becomes decorative.
  if (inChangeDir && stage === 'open' && state.changeDirRel !== undefined) {
    // 【变更】2026-09-28 (用户问题 3 · demo-21 死锁): open's artifact set is
    // path-dependent. Full-go authors proposal.md; bug-fix authors
    // bug-record.md + plan.json — the open work order explicitly tells the
    // model to fill them. Allowing ONLY proposal.md left every bug-fix
    // record write bouncing as protected_path, cornering the model into
    // calling the abandon gate after six dead turns (demo-21
    // change-20260927-ecum-demo-1e45, forced abandon).
    if (state.mode !== 'bug-fix-path' && rel === `${state.changeDirRel}/proposal.md`) {
      return allow
    }
    if (state.mode === 'bug-fix-path'
      && (rel === `${state.changeDirRel}/bug-record.md`
        || rel === `${state.changeDirRel}/plan.json`)) return allow
  }
  // §22.15 D: built-in protected paths apply even when the baseline omits
  // them. Once the change-dir allowance above has cleared the active change's
  // docs/implement artifacts, every other path under `.baf/**` / `openspec/**`
  // (older changes, archive targets, the spec folder, the baseline file
  // itself) must be touched only through the workflow drives — even an
  // allowlist entry pointing into `openspec/**` is rejected here, because the
  // allowlist is for *new* writes inside the active change, not rewrites of
  // historical artifacts.
  if (isBafControlled(rel)) {
    return deny('protected_path', `${rel} is owned by the workflow; edit through /baf-* drives`)
  }
  if (stage === 'implement') {
    const withinAllowlist = state.allowlist.some(entry => matchesPathEntry(rel, entry))
    if (withinAllowlist) return allow
    return deny('scope_exceeded', `${rel} is outside the plan allowlist for ${state.changeId}`)
  }
  return deny('invalid_transition', `stage ${stage} does not permit writing ${rel}`)
}

const DANGEROUS_COMMAND_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'rm-root', pattern: /\brm\s[^|;&\n]*\s(?:\/|~|\*)\s*$/ },
  { label: 'rm-recursive-root', pattern: /\brm\s[^|;&\n]*-[a-zA-Z]*r[a-zA-Z]*f?[^|;&\n]*\s(?:\/|~)(?:\/|\s|$)/ },
  { label: 'format', pattern: /\bformat\s+[a-z]:/i },
  { label: 'mkfs', pattern: /\bmkfs(?:\.\w+)?\b/ },
  { label: 'dd-raw-device', pattern: /\bdd\b[^|;&\n]*of=\/dev\// },
  { label: 'shutdown', pattern: /\b(?:shutdown|poweroff|halt|reboot)\b/ },
  { label: 'git-force-push', pattern: /\bgit\s+push\b[^|;&\n]*(?:\s--force(?:-with-lease)?(?:=\S+)?|\s-f)(?:\s|$)/ },
]

const INDIRECT_WRITE_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  // Any output redirection to a file; fd duplication (`2>&1`) stays legal.
  { label: 'redirect', pattern: /(?<![<\w])>{1,2}(?![&<=])/ },
  { label: 'fd-redirect-to-file', pattern: /\d>(?![&<=])/ },
  { label: 'heredoc', pattern: /(?:^|\s)<<<?\s*\S/ },
  { label: 'tee', pattern: /(?:^|[\s|;&(])tee\s/ },
  { label: 'sed-in-place', pattern: /\bsed\s+(?:[^|;&\n]*\s)?-[a-zA-Z-]*i[a-zA-Z-]*(?:\s|$)/ },
  { label: 'perl-in-place', pattern: /\bperl\s+[^|;&\n]*-p[i]/ },
  { label: 'truncate', pattern: /(?:^|[\s|;&(])truncate\s/ },
  { label: 'shred', pattern: /(?:^|[\s|;&(])shred\s/ },
  // File-mutating utilities: workspace mutations belong to the guarded fs tools.
  { label: 'copy', pattern: /(?:^|[\s|;&(])cp\s/ },
  { label: 'move', pattern: /(?:^|[\s|;&(])mv\s/ },
  { label: 'remove', pattern: /(?:^|[\s|;&(])rm\s/ },
  { label: 'install-file', pattern: /(?:^|[\s|;&(])install\s+-/ },
  { label: 'extract', pattern: /(?:^|[\s|;&(])(?:unzip|tar)\s/ },
  { label: 'download', pattern: /(?:^|[\s|;&(])(?:wget|curl)\s/ },
]

/**
 * Adjudicate one shell command. Mutations of the workspace must go through
 * the guarded filesystem tools, so redirects and in-place editors are denied
 * with `shell_indirect_write` regardless of stage; destructive and forced-Git
 * commands are denied outright.
 * @param _config - baseline guard section (reserved for enterprise policy).
 * @param _state - workflow snapshot (reserved for stage-scoped shell policy).
 * @param command - full command string.
 * @returns allow or a stable-code denial.
 */
export function adjudicateShell(
  _config: GuardPolicyConfig,
  _state: GuardWorkflowState,
  command: string,
): GuardDecision {
  for (const { label, pattern } of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return deny('dangerous_command', `command matches ${label}`)
    }
  }
  for (const { label, pattern } of INDIRECT_WRITE_PATTERNS) {
    if (pattern.test(command)) {
      return deny('shell_indirect_write', `command matches ${label}: write files via the write/edit tools`)
    }
  }
  return allow
}
