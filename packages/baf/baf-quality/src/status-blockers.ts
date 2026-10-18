/**
 * Machine-readable Spec-flow blockers for verify / doctor surfaces.
 *
 * Ports the intent of bafplugin `status-blockers.cjs` into TypeScript without
 * requiring Comet CLI. Checks are fail-closed when a required artifact is
 * missing; optional checks degrade to `skipped` when tools are absent.
 * @module @deepseek-ai/dsh-baf-quality/status-blockers
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

/** One blocker row surfaced to verify / status UI. */
export interface StatusBlocker {
  readonly id: string
  readonly severity: 'error' | 'warning' | 'info'
  readonly message: string
  readonly detail?: string
}

/** Aggregate result. */
export interface StatusBlockersReport {
  readonly blockers: readonly StatusBlocker[]
  readonly ok: boolean
}

/** Options for {@link collectStatusBlockers}. */
export interface CollectStatusBlockersOptions {
  /** Absolute workspace root. */
  readonly workspaceRoot: string
  /** Optional git base ref for clang-format dry-run (default: none → skip). */
  readonly baseRef?: string
  /** Inject which() for tests. */
  readonly whichFn?: (cmd: string) => string
}

function whichDefault(cmd: string): string {
  if (process.platform === 'win32') {
    const r = spawnSync('where', [cmd], { encoding: 'utf8', windowsHide: true })
    return r.status === 0 ? (r.stdout || '').split(/\r?\n/)[0]?.trim() ?? '' : ''
  }
  const r = spawnSync('sh', ['-c', `command -v ${JSON.stringify(cmd).slice(1, -1)}`], {
    encoding: 'utf8',
  })
  return r.status === 0 ? (r.stdout || '').trim() : ''
}

function readJson(path: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

/**
 * Collect verify-oriented blockers for a workspace.
 * @param options - workspace + optional baseRef.
 * @returns report; `ok` is false when any severity=error exists.
 */
export function collectStatusBlockers(
  options: CollectStatusBlockersOptions,
): StatusBlockersReport {
  const root = options.workspaceRoot
  const whichFn = options.whichFn ?? whichDefault
  const blockers: StatusBlocker[] = []

  const baselinePath = join(root, '.baf', 'baseline.yml')
  if (!existsSync(baselinePath)) {
    blockers.push({
      id: 'baseline.missing',
      severity: 'error',
      message: '缺少 .baf/baseline.yml',
      detail: '在会话中运行 /baf-scaffold 生成基线',
    })
  }

  const clangFormatCfg = join(root, '.clang-format')
  if (!existsSync(clangFormatCfg)) {
    blockers.push({
      id: 'clang-format.config_missing',
      severity: 'warning',
      message: '未检测到 .clang-format',
      detail: '运行方案乙 applyEnterpriseStandards({ packs: ["c"] }) 写入',
    })
  } else {
    const clang = whichFn('clang-format')
    if (clang === '') {
      blockers.push({
        id: 'clang-format.tool_missing',
        severity: 'warning',
        message: 'clang-format 不在 PATH',
      })
    } else if (options.baseRef !== undefined && options.baseRef.trim() !== '') {
      const listed = spawnSync(
        'git',
        ['diff', '--name-only', '--diff-filter=ACMR', `${options.baseRef}...HEAD`],
        { cwd: root, encoding: 'utf8', windowsHide: true },
      )
      const files = (listed.stdout || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(name => /\.(c|h)$/i.test(name) && !/(^|\/)(third_party|vendor|build|\.git)(\/|$)/i.test(name))
      if (files.length > 0) {
        const dry = spawnSync(
          clang,
          ['--dry-run', '--Werror', ...files],
          { cwd: root, encoding: 'utf8', windowsHide: true },
        )
        if ((dry.status ?? 1) !== 0) {
          blockers.push({
            id: 'clang-format.drift',
            severity: 'error',
            message: 'clang-format dry-run 未通过',
            detail: (dry.stderr || dry.stdout || '').slice(0, 2000),
          })
        }
      }
    }
  }

  if (!existsSync(join(root, 'commitlint.config.cjs'))) {
    blockers.push({
      id: 'commitlint.config_missing',
      severity: 'warning',
      message: '未检测到 commitlint.config.cjs',
      detail: 'applyEnterpriseStandards({ packs: ["commitlint"] })',
    })
  }

  const utCoverage = join(root, '.baf', 'reports', 'ut-coverage.json')
  if (existsSync(utCoverage)) {
    const raw = readJson(utCoverage)
    if (raw !== undefined && typeof raw === 'object' && raw !== null) {
      const coverage = raw as { readonly passed?: boolean; readonly line?: number; readonly minimum?: number }
      if (coverage.passed === false) {
        blockers.push({
          id: 'ut.coverage_failed',
          severity: 'error',
          message: '单元测试覆盖率报告未通过',
          detail: `line=${String(coverage.line)} minimum=${String(coverage.minimum)}`,
        })
      }
    }
  }

  const staticReport = join(root, '.baf', 'reports', 'static-analysis.json')
  if (existsSync(staticReport)) {
    const raw = readJson(staticReport)
    if (raw !== undefined && typeof raw === 'object' && raw !== null) {
      const report = raw as { readonly passed?: boolean; readonly errors?: number }
      if (report.passed === false || (typeof report.errors === 'number' && report.errors > 0)) {
        blockers.push({
          id: 'static_analysis.failed',
          severity: 'error',
          message: '静态分析报告未通过',
          detail: `errors=${String(report.errors)}`,
        })
      }
    }
  }

  if (!existsSync(join(root, '.baf', 'standards', 'ci-index.md'))) {
    blockers.push({
      id: 'constitution.ci_index_missing',
      severity: 'info',
      message: '缺少 .baf/standards/ci-index.md（constitution 包）',
    })
  }

  return {
    blockers,
    ok: blockers.every(row => row.severity !== 'error'),
  }
}
