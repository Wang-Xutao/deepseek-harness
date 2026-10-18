/**
 * 【变更】2026-10-18 (项目工程 1.3, 客户决策: 任何 AI agent 都不得修改管控
 * 文件夹): the preset-independent protected-paths ToolGuard. `baf-guard/install`
 * mounts the FULL workflow guard only on agents composed under the baf preset
 * (2026-09-28 客户决策 — BAF workflow rules must not leak into other modes);
 * standard / minimal / cordis / ptc agents therefore had NO protected-path
 * enforcement at all. This light guard closes that gap for EVERY agent:
 *
 * - fs write/edit: deny when the target sits under a `guard.protectedPaths`
 *   entry or a built-in system resource (`.git` / `.baf`) — nothing else.
 * - shell: deny mutation-shaped commands that reference a protected path,
 *   and deny `git commit --no-verify` while protected paths are configured
 *   (the commit 防线 must run for the model; the human keeps the escape).
 *
 * Deliberately global by design — unlike the 2026-09-28 incident (BAF
 * *workflow* stage rules leaking), the AI 禁改路径 rule is a product-level
 * customer decision that crosses presets on purpose. Stacked on a baf-preset
 * agent it is fully subsumed by the full guard (structural check precedes
 * every stage allowance there), so double installation is harmless.
 * @module @deepseek-ai/dsh-baf-guard/global-guard
 */

import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { withinWorkspace, matchesPathEntry, normalizeRel, INDIRECT_WRITE_PATTERNS } from './policy.ts'
import { classifyToolCall } from './tool-guard.ts'
import { loadGuardConfig } from './projection-state.ts'

/** Denial strings start with the same stable prefix the full guard uses. */
const PREFIX = '[baf-guard]'

/** Path-prefix membership over baseline entries (placeholder skipped). */
function isProtectedRel(rel: string, protectedPaths: readonly string[]): boolean {
  return protectedPaths.some(entry =>
    entry.trim() === '<enterprise-tbd>' ? false : matchesPathEntry(rel, entry))
}

/** Built-ins every agent is fenced from regardless of baseline content. */
function isSystemResource(rel: string): boolean {
  return rel === '.git' || rel.startsWith('.git/') || rel === '.baf' || rel.startsWith('.baf/')
}

/** Does the command text reference one of the protected entries? */
function referencesProtectedPath(command: string, protectedPaths: readonly string[]): boolean {
  return protectedPaths.some((entry) => {
    const trimmed = entry.trim()
    if (trimmed === '<enterprise-tbd>') return false
    const base = normalizeRel(trimmed).replace(/\/\*{1,2}$/, '').replace(/\/$/, '')
    if (base === '') return false
    return command.includes(base)
  })
}

/** `git commit` skipping hooks — see the full guard's GIT_COMMIT_NO_VERIFY. */
const NO_VERIFY: RegExp = /\bgit\s+commit\b[^\n]*(?:\s--no-verify(?:=\S+)?|\s-n(?![\w-]))/

/**
 * Create the preset-independent protected-paths guard for one workspace.
 * Every call re-reads the baseline (the full guard's no-cache contract), so
 * a 设置→工作流→项目工程 save takes effect on the next tool call.
 * @param options - workspace binding.
 * @returns ToolGuard returning a denial string or undefined.
 */
export function createProtectedPathsGuard(options: { readonly workspaceRoot: string }) {
  return (execution: Readonly<ToolExecution>): string | undefined => {
    const call = classifyToolCall(execution.name, execution.arguments)
    if (call.kind === 'unrecognized') return undefined
    const config = loadGuardConfig(options.workspaceRoot)
    const hasProtected = config.protectedPaths.some(entry => entry.trim() !== '<enterprise-tbd>')

    if (call.kind === 'fs-write') {
      const { rel } = withinWorkspace(options.workspaceRoot, call.path)
      if (isProtectedRel(rel, config.protectedPaths)) {
        return `${PREFIX} protected_path: ${rel} 位于客户配置的 AI 禁改路径（.baf/baseline.yml guard.protectedPaths），任何 AI 会话不得修改；如需调整请由客户在 设置→工作流→项目工程 中修改。`
      }
      if (isSystemResource(rel)) {
        return `${PREFIX} protected_path: ${rel} 由产品内建保护（.git/.baf），AI 会话不得直接修改。`
      }
      return undefined
    }

    // shell: only mutation-shaped commands referencing a protected entry are
    // denied — standard-mode agents keep full shell use otherwise.
    if (hasProtected && NO_VERIFY.test(call.command)) {
      return `${PREFIX} protected_path: git commit --no-verify 会跳过禁改路径的提交校验钩子；请去掉该参数重新提交（人工放行请由客户在自己的终端执行）。`
    }
    if (hasProtected
      && referencesProtectedPath(call.command, config.protectedPaths)
      && INDIRECT_WRITE_PATTERNS.some(({ pattern }) => pattern.test(call.command))) {
      return `${PREFIX} protected_path: 命令疑似通过 shell 间接修改 AI 禁改路径；文件修改请使用 write/edit 工具（它们会拒绝禁改目标）。`
    }
    return undefined
  }
}
