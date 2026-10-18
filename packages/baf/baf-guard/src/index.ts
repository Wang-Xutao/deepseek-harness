/**
 * BAF guard: tool hard-gate + verify policy (Phase 7.3).
 * @module @deepseek-ai/dsh-baf-guard
 */

export * from './policy.ts'
export * from './projection-state.ts'
export * from './tool-guard.ts'
// 【变更】2026-10-18 (项目工程 1.3): commit-time protected-paths 防线 + the
// preset-independent light guard (consumed via /global-install and
// /commit-hook subpaths by the base composition and the settings Remote).
export * from './commit-hook.ts'
export * from './global-guard.ts'
export { BafGuard } from './service.ts'
import { BafGuard } from './service.ts'
export default BafGuard
