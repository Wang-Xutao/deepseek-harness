/**
 * Stable adapter contracts and Phase 2 unavailable stubs.
 * @module @deepseek-ai/dsh-baf-core/adapters
 */

import type { ChangeIntake, AffectedScope } from './intake.ts'
import type { BaselineManifest } from './baseline.ts'
import { domainFailure, type DomainResult } from './result.ts'
import type { WorkflowNode, WorkflowStatus, TerminalState } from './workflow.ts'
import type { WorkspaceIdentity } from './identity.ts'

/** Shared context passed into adapter detect/run calls. */
export interface AdapterContext {
  /** Workspace identity. */
  readonly workspace: WorkspaceIdentity
  /** Loaded baseline when available. */
  readonly baseline?: BaselineManifest
  /** Optional abort signal. */
  readonly signal?: AbortSignal
}

/** OpenSpec CLI detect outcome. */
export interface DetectResult {
  readonly available: boolean
  readonly cli?: string
  readonly version?: string
  readonly detail?: string
}

/** OpenSpec change skeleton input. */
export interface OpenInput {
  readonly changeId: string
  readonly title: string
  readonly workspace: WorkspaceIdentity
}

/** OpenSpec change reference. */
export interface ChangeRef {
  readonly changeId: string
  readonly path: string
}

/** OpenSpec change document state. */
export interface ChangeState {
  readonly changeId: string
  readonly files: readonly string[]
}

/** OpenSpec validate report. */
export interface ValidationReport {
  readonly passed: boolean
  readonly diagnostics: readonly string[]
}

/** OpenSpec archive outcome. */
export interface ArchiveResult {
  readonly changeId: string
  readonly archivePath: string
}

/** C stack detection. */
export interface StackDetection {
  readonly available: boolean
  readonly compiler?: string
  readonly detail?: string
}

/** Quality run input. */
export interface QualityInput {
  readonly workspace: WorkspaceIdentity
  readonly baseline: BaselineManifest
  readonly changeId: string
}

/** Quality report (Phase 7 fills checks). */
export interface QualityReport {
  readonly schema: 1
  readonly baselineId: string
  readonly workspace: string
  readonly revision?: string
  readonly toolVersions: Readonly<Record<string, string>>
  readonly checks: readonly unknown[]
  readonly artifacts: readonly string[]
  readonly passed: boolean
  readonly diagnostics: readonly string[]
}

/** Guard check input. */
export interface GuardInput {
  readonly workspace: WorkspaceIdentity
  readonly baseline: BaselineManifest
  readonly paths: readonly string[]
  readonly action: string
}

/** Guard report. */
export interface GuardReport {
  readonly allowed: boolean
  readonly reasonCodes: readonly string[]
}

/** Intake request. */
export interface IntakeInput {
  readonly description: string
  readonly workspace: WorkspaceIdentity
  readonly baseline?: BaselineManifest
  readonly affectedScopeHint?: AffectedScope
}

/** Intake decision outcome. */
export interface IntakeResult {
  readonly intake: ChangeIntake
}

/** Workflow identity for status/resume. */
export interface WorkflowIdentity {
  readonly changeId: string
  readonly workspace: WorkspaceIdentity
}

/**
 * Transition request.
 *
 * `evidence` is intentionally typed as `Record<string, unknown>`; the convention
 * field `source` is documented in §22.15 B and carried by callers (slash / CLI /
 * Tab / Tab gate-resolve / model-tool). It is not a first-class `TransitionInput`
 * field because the value is a convention set on the wire, not a domain field
 * the state machine depends on for anything other than the §22.15 source check.
 */
export interface TransitionInput {
  readonly changeId: string
  readonly from: WorkflowNode | null
  readonly to: WorkflowNode | TerminalState
  readonly evidence?: Readonly<Record<string, unknown>>
}

/**
 * Source that originated a transition (§22.15 B). Whitelist enforced in
 * `checkEvidence` for the confirm-edge set T2/T3/T7/T7a/T13/T14/T16:
 * missing or `model-tool` → `gate_confirmation_required`. The four `*Human*`
 * sources are stamped at the entry surface — see `driveGateResolve`,
 * `Remote.transition`, and the CLI dispatch in `cmdline.ts`.
 */
export type TransitionSource =
  | 'slash'
  | 'cli'
  | 'tab'
  | 'gate-card'
  | 'model-tool'

/** Whether a source is human-originated (confirm-edge admissible). */
export function isHumanSource(source: unknown): source is TransitionSource {
  return source === 'slash' || source === 'cli' || source === 'tab' || source === 'gate-card'
}

/** Transition outcome. */
export interface TransitionResult {
  readonly accepted: boolean
  readonly status: WorkflowStatus
}

/** Resume outcome. */
export interface ResumeResult {
  readonly status: WorkflowStatus
  readonly drifted: boolean
}

/** OpenSpec adapter contract. */
export interface OpenSpecAdapter {
  detect(ctx: AdapterContext): Promise<DetectResult>
  open(input: OpenInput): Promise<DomainResult<ChangeRef>>
  read(change: ChangeRef): Promise<DomainResult<ChangeState>>
  validate(change: ChangeRef): Promise<ValidationReport>
  archive(change: ChangeRef, signal: AbortSignal): Promise<DomainResult<ArchiveResult>>
}

/** C toolchain / quality adapter contract. */
export interface StackAdapter {
  detect(ctx: AdapterContext): Promise<StackDetection>
  runQuality(input: QualityInput, signal: AbortSignal): Promise<QualityReport>
}

/** Guard policy contract. */
export interface GuardPolicy {
  check(input: GuardInput, signal: AbortSignal): Promise<GuardReport>
}

/** Workflow domain service contract (implemented in Phase 4). */
export interface WorkflowService {
  intake(input: IntakeInput): Promise<IntakeResult>
  status(input: WorkflowIdentity): Promise<WorkflowStatus>
  transition(input: TransitionInput): Promise<TransitionResult>
  resume(input: WorkflowIdentity): Promise<ResumeResult>
}

/** Bundle of adapters registered on BafCore. */
export interface BafAdapters {
  readonly openspec: OpenSpecAdapter
  readonly stack: StackAdapter
  readonly guard: GuardPolicy
  readonly workflow: WorkflowService
}

const unavailable = (adapter: string) => domainFailure('unavailable', [{
  severity: 'error',
  code: 'tool_unavailable',
  message: `${adapter} is not implemented yet`,
}], { artifacts: [] })

/** OpenSpec stub that always reports unavailable. */
export const unavailableOpenSpecAdapter: OpenSpecAdapter = {
  async detect() {
    return { available: false, detail: 'OpenSpec adapter not implemented (Phase 5)' }
  },
  async open() {
    return unavailable('openspec') as DomainResult<ChangeRef>
  },
  async read() {
    return unavailable('openspec') as DomainResult<ChangeState>
  },
  async validate() {
    return { passed: false, diagnostics: ['openspec adapter unavailable'] }
  },
  async archive() {
    return unavailable('openspec') as DomainResult<ArchiveResult>
  },
}

/** Stack/quality stub that always reports unavailable. */
export const unavailableStackAdapter: StackAdapter = {
  async detect() {
    return { available: false, detail: 'Stack adapter not implemented (Phase 7)' }
  },
  async runQuality(input) {
    return {
      schema: 1,
      baselineId: input.baseline.baselineId,
      workspace: input.workspace.root,
      toolVersions: {},
      checks: [],
      artifacts: [],
      passed: false,
      diagnostics: ['stack adapter unavailable'],
    }
  },
}

/** Guard stub that blocks with tool_unavailable semantics for Phase 2. */
export const unavailableGuardPolicy: GuardPolicy = {
  async check() {
    return { allowed: false, reasonCodes: ['tool_unavailable'] }
  },
}

/** Workflow stub; real state machine lands in Phase 4. */
export const unavailableWorkflowService: WorkflowService = {
  async intake() {
    throw new Error('WorkflowService.intake is not implemented (Phase 4)')
  },
  async status() {
    throw new Error('WorkflowService.status is not implemented (Phase 4)')
  },
  async transition() {
    throw new Error('WorkflowService.transition is not implemented (Phase 4)')
  },
  async resume() {
    throw new Error('WorkflowService.resume is not implemented (Phase 4)')
  },
}

/** Create the Phase 2 unavailable adapter bundle. */
export function createUnavailableAdapters(): BafAdapters {
  return {
    openspec: unavailableOpenSpecAdapter,
    stack: unavailableStackAdapter,
    guard: unavailableGuardPolicy,
    workflow: unavailableWorkflowService,
  }
}
