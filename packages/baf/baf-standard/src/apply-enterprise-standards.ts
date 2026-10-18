/**
 * Apply bafplugin-aligned enterprise standard assets into a workspace.
 *
 * Source of truth: `assets/enterprise/` (copied from bafplugin
 * `plugins/baf-standard` + `baf-quality` + workflow check scripts).
 * Idempotent: identical files are skipped; divergent files are timestamp-backed
 * up then overwritten (same semantics as baf-scaffold).
 * @module @deepseek-ai/dsh-baf-standard/apply-enterprise-standards
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One planned file relative to the workspace root. */
export interface EnterpriseStandardFile {
  /** Workspace-relative posix path. */
  readonly path: string
  /** Absolute path of the asset source. */
  readonly source: string
}

/** Report of applyEnterpriseStandards. */
export interface EnterpriseStandardsChanges {
  readonly created: readonly string[]
  readonly skipped: readonly string[]
  readonly backedUp: readonly string[]
  /** Whether `.baf/baseline.yml` stack was pinned to Ceedling/static cmds. */
  readonly stackPinned: boolean
}

/** Options for {@link applyEnterpriseStandards}. */
export interface ApplyEnterpriseStandardsOptions {
  /** Absolute workspace root. */
  readonly workspaceRoot: string
  /**
   * Which packs to apply. Default: all.
   * - `c` — .clang-format, C templates, high-risk checklist, third-party whitelist
   * - `commitlint` — commitlint.config.cjs + husky commit-msg
   * - `constitution` — AGENTS/CLAUDE/ci-index/openspec/project.md
   * - `quality` — Ceedling + CPPLINT/cppcheck templates
   * - `scripts` — status-blockers check scripts under `.baf/scripts/`
   * - `skills` — agent skills under `.agents/skills/` (optional companion)
   */
  readonly packs?: readonly EnterprisePackId[]
  /**
   * When true (default if `quality` pack is included), rewrite baseline
   * `stack` placeholders to {@link ENTERPRISE_STACK_PIN}.
   */
  readonly pinStack?: boolean
  /** Timestamp for backup names (tests). */
  readonly at?: Date
}

/** Selectable asset packs. */
export type EnterprisePackId =
  | 'c'
  | 'commitlint'
  | 'constitution'
  | 'quality'
  | 'scripts'
  | 'skills'

const ALL_PACKS: readonly EnterprisePackId[] = [
  'c', 'commitlint', 'constitution', 'quality', 'scripts', 'skills',
]

/**
 * Resolve the on-disk `assets/enterprise` directory shipped with this package.
 * @returns absolute assets root.
 */
export function enterpriseAssetsRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  // src/ → ../assets/enterprise ; lib/types/ → ../../assets/enterprise
  const candidates = [
    join(here, '..', '..', 'assets', 'enterprise'),
    join(here, '..', 'assets', 'enterprise'),
    join(here, 'assets', 'enterprise'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`enterprise assets not found near ${here}`)
}

function walkFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else out.push(full)
    }
  }
  if (existsSync(root)) walk(root)
  return out
}

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

/**
 * Map an asset-relative path to the workspace destination.
 * @param rel - path under assets/enterprise (posix).
 * @returns workspace-relative path, or undefined to skip.
 */
export function mapAssetToWorkspace(rel: string): string | undefined {
  const n = toPosix(rel)
  if (n.startsWith('c/')) {
    if (n === 'c/.clang-format') return '.clang-format'
    if (n === 'c/third-party-whitelist.json') return '.baf/standards/third-party-whitelist.json'
    if (n === 'c/high-risk-review-checklist.md') return '.baf/standards/high-risk-review-checklist.md'
    if (n === 'c/module-README.template.md') return '.baf/standards/module-README.template.md'
    if (n === 'c/Doxyfile.example') return '.baf/standards/Doxyfile.example'
    if (n === 'c/api-mainpage.dox.example') return '.baf/standards/api-mainpage.dox.example'
    if (n === 'c/template.c') return '.baf/standards/templates/template.c'
    if (n === 'c/template.h') return '.baf/standards/templates/template.h'
    return undefined
  }
  if (n.startsWith('commitlint/')) {
    if (n === 'commitlint/commitlint.config.cjs') return 'commitlint.config.cjs'
    if (n === 'commitlint/commit-msg') return '.husky/commit-msg'
    if (n === 'commitlint/README.md') return '.baf/standards/commitlint-README.md'
    return undefined
  }
  if (n.startsWith('constitution/')) {
    const rest = n.slice('constitution/'.length)
    if (rest === 'AGENTS.md' || rest === 'CLAUDE.md') return rest
    if (rest === 'ci-index.md') return '.baf/standards/ci-index.md'
    if (rest === 'openspec/project.md') return 'openspec/project.md'
    if (rest === 'docs/api/README.md') return 'docs/api/README.md'
    if (rest === 'README.md') return '.baf/standards/constitution-README.md'
    return undefined
  }
  if (n.startsWith('quality/ceedling/')) {
    const rest = n.slice('quality/ceedling/'.length)
    if (rest === 'project.yml') return 'project.yml'
    if (rest === 'config.json') return '.baf/quality/ceedling-config.json'
    if (rest === 'README.md') return '.baf/quality/ceedling-README.md'
    if (rest.startsWith('test/')) return rest
    if (rest.startsWith('source/')) return rest
    return undefined
  }
  if (n.startsWith('quality/static-analysis/')) {
    const rest = n.slice('quality/static-analysis/'.length)
    if (rest === 'CPPLINT.cfg') return 'CPPLINT.cfg'
    if (rest === 'cppcheck-suppressions.xml') return 'cppcheck-suppressions.xml'
    if (rest === 'README.md') return '.baf/quality/static-analysis-README.md'
    return undefined
  }
  if (n.startsWith('scripts/')) {
    return `.baf/scripts/${n.slice('scripts/'.length)}`
  }
  if (n.startsWith('skills/')) {
    return `.agents/skills/${n.slice('skills/'.length)}`
  }
  return undefined
}

function packOf(rel: string): EnterprisePackId | undefined {
  const n = toPosix(rel)
  if (n.startsWith('c/')) return 'c'
  if (n.startsWith('commitlint/')) return 'commitlint'
  if (n.startsWith('constitution/')) return 'constitution'
  if (n.startsWith('quality/')) return 'quality'
  if (n.startsWith('scripts/')) return 'scripts'
  if (n.startsWith('skills/')) return 'skills'
  return undefined
}

/**
 * Build the file plan for selected packs.
 * @param packs - packs to include (default all).
 * @returns ordered plan entries.
 */
export function planEnterpriseStandards(
  packs: readonly EnterprisePackId[] = ALL_PACKS,
): readonly EnterpriseStandardFile[] {
  const root = enterpriseAssetsRoot()
  const selected = new Set(packs)
  const files: EnterpriseStandardFile[] = []
  for (const abs of walkFiles(root)) {
    const rel = toPosix(relative(root, abs))
    const pack = packOf(rel)
    if (pack === undefined || !selected.has(pack)) continue
    const dest = mapAssetToWorkspace(rel)
    if (dest === undefined) continue
    files.push({ path: dest, source: abs })
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

function backupName(path: string, at: Date): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-')
  return `${path}.baf-backup-${stamp}`
}

/**
 * Apply enterprise standard assets into a workspace.
 * @param options - workspace + packs.
 * @returns created / skipped / backed-up report.
 */
export function applyEnterpriseStandards(
  options: ApplyEnterpriseStandardsOptions,
): EnterpriseStandardsChanges {
  const at = options.at ?? new Date()
  const packs = options.packs ?? ALL_PACKS
  const plan = planEnterpriseStandards(packs)
  const created: string[] = []
  const skipped: string[] = []
  const backedUp: string[] = []

  for (const file of plan) {
    const dest = join(options.workspaceRoot, file.path)
    mkdirSync(dirname(dest), { recursive: true })
    const next = readFileSync(file.source)
    if (existsSync(dest)) {
      const prev = readFileSync(dest)
      if (Buffer.compare(prev, next) === 0) {
        skipped.push(file.path)
        continue
      }
      const backup = join(options.workspaceRoot, backupName(file.path, at))
      mkdirSync(dirname(backup), { recursive: true })
      renameSync(dest, backup)
      backedUp.push(file.path)
    } else {
      created.push(file.path)
    }
    writeFileSync(dest, next)
  }

  const shouldPin = options.pinStack ?? packs.includes('quality')
  const stackPinned = shouldPin
    ? pinEnterpriseStackInBaseline(options.workspaceRoot, at)
    : false

  return { created, skipped, backedUp, stackPinned }
}

/**
 * Baseline stack snippet to pin after quality pack apply (Ceedling + static).
 * Enterprises may still override; placeholders are replaced with concrete cmds.
 */
export const ENTERPRISE_STACK_PIN = {
  language: 'c' as const,
  compiler: 'gcc',
  build: 'ceedling files:build',
  test: 'ceedling test:all',
  coverage: { required: true, minimum: 80 as const },
  analyzers: ['cpplint', 'cppcheck'] as const,
}

const STACK_PIN_YAML = `stack:
  language: c
  compiler: gcc
  build: ceedling files:build
  test: ceedling test:all
  coverage:
    required: true
    minimum: 80
  analyzers:
    - cpplint
    - cppcheck
`

/**
 * Rewrite the `stack:` block in `.baf/baseline.yml` to {@link ENTERPRISE_STACK_PIN}.
 * No-op when baseline is missing. Backs up the previous baseline first.
 * @param workspaceRoot - absolute workspace root.
 * @param at - backup timestamp.
 * @returns true when the file was rewritten.
 */
export function pinEnterpriseStackInBaseline(
  workspaceRoot: string,
  at: Date = new Date(),
): boolean {
  const baselinePath = join(workspaceRoot, '.baf', 'baseline.yml')
  if (!existsSync(baselinePath)) return false
  const prev = readFileSync(baselinePath, 'utf8')
  if (prev.includes('build: ceedling files:build') && prev.includes('test: ceedling test:all')) {
    return false
  }
  const stackMatch = prev.match(/^stack:\n(?:[ \t].*\n?)*/m)
  if (stackMatch === null) return false
  const next = `${prev.slice(0, stackMatch.index)}${STACK_PIN_YAML}${prev.slice((stackMatch.index ?? 0) + stackMatch[0].length)}`
  if (next === prev) return false
  const backup = join(workspaceRoot, backupName('.baf/baseline.yml', at))
  mkdirSync(dirname(backup), { recursive: true })
  writeFileSync(backup, prev)
  writeFileSync(baselinePath, next.endsWith('\n') ? next : `${next}\n`)
  return true
}

/** Marker files that prove each pack is present in a workspace. */
const PACK_MARKERS: Record<EnterprisePackId, readonly string[]> = {
  c: ['.clang-format'],
  commitlint: ['commitlint.config.cjs'],
  constitution: ['AGENTS.md', '.baf/standards/ci-index.md'],
  quality: ['project.yml', 'CPPLINT.cfg'],
  scripts: ['.baf/scripts/status-blockers.cjs'],
  skills: ['.agents/skills/sora-c-code-standards/SKILL.md'],
}

/**
 * Detect which enterprise packs are already present in a workspace.
 * @param workspaceRoot - absolute workspace root.
 * @returns packs whose marker files all exist.
 */
export function detectAppliedEnterprisePacks(
  workspaceRoot: string,
): readonly EnterprisePackId[] {
  return ALL_PACKS.filter(pack =>
    PACK_MARKERS[pack].every(rel => existsSync(join(workspaceRoot, rel))),
  )
}
