/**
 * Shared runtime context for full-go stage handlers (§12 Phase 5).
 * One context binds the projection store, the OpenSpec adapter, and the
 * workspace identity for a whole stage chain; handlers stay pure functions
 * over it.
 * @module @deepseek-ai/dsh-baf-workflow/stages/context
 */

import type {
  BaselineManifest,
  GuardPolicy,
  OpenSpecAdapter,
  StackAdapter,
  WorkspaceIdentity,
} from '@deepseek-ai/dsh-baf-core'
import { ProjectionStore } from '../projection.ts'

/** Options for {@link createStageContext}. */
export interface StageContextOptions {
  readonly store: ProjectionStore
  readonly adapter: OpenSpecAdapter
  readonly workspace: WorkspaceIdentity
  /** Baseline governing this change chain; open() requires it. */
  readonly baseline?: BaselineManifest
  /** Phase 7 quality adapter; unwired contexts annotate quality as unavailable. */
  readonly stack?: StackAdapter
  /** Phase 7 guard policy; unwired contexts annotate guard/secret-scan as unavailable. */
  readonly guard?: GuardPolicy
}

/**
 * Runtime binding shared by every stage handler invocation.
 *
 * Handlers must close over the same context for one change chain so that
 * projections, artifacts, and gates observe one workspace.
 */
export interface StageContext {
  readonly store: ProjectionStore
  readonly adapter: OpenSpecAdapter
  readonly workspace: WorkspaceIdentity
  readonly baseline?: BaselineManifest
  readonly stack?: StackAdapter
  readonly guard?: GuardPolicy
}

/**
 * Create the shared stage-handler context.
 * @param options - bindings.
 * @returns frozen context.
 */
export function createStageContext(options: StageContextOptions): StageContext {
  return Object.freeze({ ...options })
}
