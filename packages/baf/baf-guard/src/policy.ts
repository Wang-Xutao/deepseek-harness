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
// 【变更】2026-10-29 (批次三十七 · 用户问题 6): the document lifecycle — the
// stage that FILLS a document and the stage whose gate confirms it.
import { ARTIFACT_FLOW } from '@deepseek-ai/dsh-baf-core'

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
  | 'upstream_document_locked'
  /** 【变更】2026-10-29 (批次三十七 · 用户问题 6): a CONFIRMED document (已完成)
   * is locked — the model may not rewrite the customer's own words. */
  | 'document_locked'

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
  /**
   * 【变更】2026-10-29 (批次三十六 · 用户问题 8): the change's documents that
   * a customer-authorized 「同步」 may rewrite — a document whose upstream
   * document is newer than it is. The guard reads the list so the sync order
   * the customer triggered can re-author the stale document, while the
   * upstream document itself stays locked.
   */
  readonly staleDocuments?: readonly string[]
  /**
   * 【变更】2026-10-29 (批次三十七 · 用户问题 6): the documents the customer
   * CONFIRMED (their gate was passed — 已完成). They are locked: the model
   * may not rewrite them. Only the customer may (by editing the file, or by
   * pressing 同步 to re-author the documents downstream of it).
   */
  readonly lockedDocuments?: readonly string[]
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

/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 8): the document each stage
 * AUTHORS, in workflow order.
 */
const AUTHORED_DOCUMENTS: Readonly<Record<string, readonly string[]>> = {
  open: ['proposal.md'],
  clarify: ['clarify.md'],
  design: ['design.md'],
  plan: ['plan.md', 'tasks.md', 'plan.json', 'bug-fix-path-ledger.json'],
  implement: ['checklist.md'],
  verify: ['verify.md', 'verify-report.json'],
}

/**
 * The documents a customer edits BY HAND — the ones a later stage treats as its
 * basis. The plan stage's documents are not among them: they are rendered from
 * the ledger, and the implementation ticks the ledger itself, so they stay
 * writable while the implementation runs.
 */
const HAND_EDITED_DOCUMENTS: Readonly<Record<string, readonly string[]>> = {
  open: ['proposal.md'],
  clarify: ['clarify.md'],
  design: ['design.md'],
}

/** The stage order the document chain follows. */
const STAGE_ORDER: readonly string[] = ['open', 'clarify', 'design', 'plan', 'implement', 'verify']

/**
 * The documents a stage treats as its basis — the hand-edited documents of
 * every earlier stage. At the design stage that is proposal.md and clarify.md;
 * at the implement and verify stages it is proposal.md, clarify.md and
 * design.md.
 *
 * 【变更】2026-10-29 (批次三十七 · 用户问题 6): the document the CURRENT stage
 * fills is NOT upstream. The customer reported the proposal still being a
 * blank template at the clarify stage, with the model unable to fill it —
 * the old upstream set covered proposal.md from the clarify stage on, so the
 * clarify stage could never write it. The lifecycle in baf-core says the
 * clarify stage FILLS proposal.md (未填写 → 已填写); the lock starts when the
 * gate in front of it is passed (已完成).
 * @param stage - the change's current stage.
 * @returns the upstream document file names.
 */
export function upstreamDocuments(stage: string): readonly string[] {
  const index = STAGE_ORDER.indexOf(stage)
  if (index <= 0) return []
  const upstream: string[] = []
  for (const earlier of STAGE_ORDER.slice(0, index)) {
    upstream.push(...(HAND_EDITED_DOCUMENTS[earlier] ?? []))
  }
  const filled = stageFilledDocuments(stage)
  return upstream.filter(file => !filled.includes(file))
}

/**
 * The documents the current stage really fills (the lifecycle's `fill` leg).
 * @param stage - the change's current stage.
 * @returns the document file names.
 */
function stageFilledDocuments(stage: string): readonly string[] {
  const filled: string[] = []
  for (const [file, flow] of Object.entries(ARTIFACT_FLOW)) {
    if (flow.fill === stage) filled.push(file)
  }
  return filled
}

/**
 * The stage that authored a document, or undefined when the document is not
 * one of the chain's documents.
 * @param fileName - the document's file name.
 * @returns the authoring stage.
 */
export function stageOfDocument(fileName: string): string | undefined {
  for (const stage of STAGE_ORDER) {
    if ((AUTHORED_DOCUMENTS[stage] ?? []).includes(fileName)) return stage
  }
  return undefined
}

/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 6): the documents the CURRENT
 * stage legitimately maintains even though they are 已完成 — the
 * implementation ticks the task ledger, the verify stage ticks the checklist.
 * Everything else the customer confirmed is locked.
 */
const STAGE_MAINTAINED_DOCUMENTS: Readonly<Record<string, readonly string[]>> = {
  implement: ['plan.json', 'tasks.md'],
  verify: ['checklist.md'],
}

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
  // 【变更】2026-10-29 (批次三十六 · 用户问题 8): an upstream document is the
  // BASIS of the later stages, so the model may not rewrite it. The demo1
  // session edited clarify.md eight times AFTER design.md and plan.json were
  // written — that is what raised the customer's 「产物不同步」 alarm, and the
  // alarm was right: the write was the problem, not the detector.
  //
  // The one authorized rewrite is the customer-triggered 「同步」: its targets
  // are the stale documents (a document whose upstream is newer), and the
  // customer pressing 同步 is the explicit request to re-author them.
  if (inChangeDir && state.changeDirRel !== undefined) {
    const fileName = rel.slice(`${state.changeDirRel}/`.length)
    const locked = upstreamDocuments(stage)
    if (locked.includes(fileName)) {
      const stale = state.staleDocuments ?? []
      if (!stale.includes(rel)) {
        return deny('upstream_document_locked', `${rel} 是上游基准文档（${stage} 阶段之前的产物），模型不得改写它；下游文档要按最新的 ${fileName} 来改。如果确实是客户明确要求修改这份上游文档，请让客户自己改这个文件，然后点「同步」重写下游文档。`)
      }
    }
    // 【变更】2026-10-29 (批次三十七 · 用户问题 6): a CONFIRMED document
    // (已完成 — the customer passed its gate) is the customer's own word. The
    // model may not rewrite it, whatever stage it works on: the only way back
    // is the customer (edit the file themselves, or press 同步 to re-author
    // the documents downstream of it). The stage's OWN machine documents stay
    // writable — the implementation ticks the task ledger, the verify stage
    // ticks the checklist.
    const confirmed = state.lockedDocuments ?? []
    if (confirmed.includes(rel) && !(STAGE_MAINTAINED_DOCUMENTS[stage] ?? []).includes(fileName)) {
      return deny('document_locked', `${rel} 已完成（确认门已通过），文档被锁死，模型不得改写它；需要修改请让客户自己改这个文件，或让客户点「同步」重写下游文档。`)
    }
  }
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
    // path-dependent — full-go authors proposal.md; bug-fix additionally keeps
    // the plan.json fast-path ledger, and the open work order explicitly tells
    // the model to fill both.
    // 【变更】2026-09-30 (demo31 问题 4): bug-fix open authors the SAME
    // proposal.md as full-go (bug-record.md is gone — the artifact rail is
    // row-for-row the full-go one with clarify/design/plan clipped), so the
    // proposal allowance no longer forks on mode.
    if (rel === `${state.changeDirRel}/proposal.md`) {
      return allow
    }
    if (state.mode === 'bug-fix-path' && rel === `${state.changeDirRel}/plan.json`) return allow
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
    // 【变更】2026-09-30 (demo31 问题 5 · demo30 卡滞): the denial now names the
    // LEGAL escape instead of just bouncing — at implement the change dir is
    // writable, so a fix that genuinely needs this new file extends
    // plan.json's allowlist first (that is the customer-visible scope change),
    // and a scope decision the model must not make alone goes to the customer
    // via baf_question_ask. Before this, the model read a bare "outside the
    // plan allowlist", concluded the plan was unfixable, and prose-asked.
    return deny('scope_exceeded', `${rel} is outside the plan allowlist for ${state.changeId} — if the fix needs it, add the file to plan.json's allowlist (openspec/changes/${state.changeId}/plan.json is writable at implement) and add a matching task, or ask the customer with baf_question_ask before expanding scope`)
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

/** 【变更】2026-10-18 (项目工程 1.3): `git commit --no-verify` / bare `-n`
 * skips every pre-commit hook — while protected paths are configured the
 * commit 防线 must actually run, so the escape hatch is denied for the model
 * (the human owner keeps it in their own terminal). `git push -n` is a
 * different flag (--dry-run) and stays legal. */
const GIT_COMMIT_NO_VERIFY: RegExp = /\bgit\s+commit\b[^\n]*(?:\s--no-verify(?:=\S+)?|\s-n(?![\w-]))/

/** Mutation-shaped shell patterns shared by the BAF tool guard and the
 * global protected-paths guard (which denies them only when the command also
 * references a protected path — standard-mode agents keep full shell use). */
export const INDIRECT_WRITE_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
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
  config: GuardPolicyConfig,
  _state: GuardWorkflowState,
  command: string,
): GuardDecision {
  // 【变更】2026-10-18 (项目工程 1.3): see GIT_COMMIT_NO_VERIFY — gated on
  // protected paths being configured so untouched baselines keep the old
  // shell surface exactly.
  if (config.protectedPaths.length > 0 && GIT_COMMIT_NO_VERIFY.test(command)) {
    return deny('protected_path', 'git commit would skip the pre-commit protected-paths check (--no-verify); run git commit without it')
  }
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
