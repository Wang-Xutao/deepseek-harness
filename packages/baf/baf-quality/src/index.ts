/**
 * BAF quality runner and C stack adapter (Phase 7.1) + status blockers (方案乙).
 * @module @deepseek-ai/dsh-baf-quality
 */

export * from './runner.ts'
export * from './status-blockers.ts'
// 【变更】2026-10-21 (批次十 测试流图): canonical step list for the 测试流图 surfaces.
export * from './test-flow.ts'
export { BafQuality } from './service.ts'
import { BafQuality } from './service.ts'
export default BafQuality
