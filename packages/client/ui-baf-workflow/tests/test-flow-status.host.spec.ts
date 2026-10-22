/**
 * 【变更】2026-10-21 (批次十 测试流图): the host `testFlowStatus` reader's
 * contracts — defensive reads of the workspace's quality reports + config:
 *
 * - a full workspace maps every field (snake_case `generated_at` → camelCase)
 * - a bare workspace with no reports answers ready with nothing fabricated
 * - a broken JSON report is skipped, not thrown (the tab paints 未运行)
 * - the HTML coverage report's existence follows the config's report_html
 * 【变更】2026-10-22 (批次十三 4): the stage-switch reader — the
 * `.baf/quality/test-flow.json` `{version, stages}` envelope MUST be
 * unwrapped before normalizing (reading keys off the envelope itself is the
 * silent all-on-defaults regression the settings package caught), garbage
 * entries normalize, and the toggles ride along on `readTestFlowStatus`.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { classifyStageToolMissing, readTestFlowStageToggles, readTestFlowStatus, stageSpawnCommand } from '../src/index.ts'

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-test-flow-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('readTestFlowStatus (批次十 测试流图)', () => {
  it('maps a full workspace: reports + config + HTML report existence', async () => {
    const root = await tempRoot()
    await mkdir(join(root, '.baf', 'reports'), { recursive: true })
    await mkdir(join(root, '.baf', 'quality'), { recursive: true })
    await mkdir(join(root, 'build', 'coverage'), { recursive: true })
    await writeFile(join(root, '.baf', 'reports', 'ut-coverage.json'), JSON.stringify({
      passed: true,
      line: 83.3,
      minimum: 80,
      generated_at: '2026-10-21T10:00:00Z',
    }), 'utf8')
    await writeFile(join(root, '.baf', 'reports', 'static-analysis.json'), JSON.stringify({
      passed: false,
      errors: 5,
      generated_at: '2026-10-21T11:00:00Z',
    }), 'utf8')
    await writeFile(join(root, '.baf', 'quality', 'ceedling-config.json'), JSON.stringify({
      threshold_line: 0.8,
      gate_mode: 'shadow',
      report_html: 'build/coverage/coverage_report.html',
    }), 'utf8')
    await writeFile(join(root, 'build', 'coverage', 'coverage_report.html'), '<html></html>', 'utf8')

    const status = await readTestFlowStatus(root)
    expect(status).toEqual({
      status: 'ready',
      coverage: { line: 83.3, minimum: 80, passed: true, generatedAt: '2026-10-21T10:00:00Z' },
      staticAnalysis: { errors: 5, passed: false, generatedAt: '2026-10-21T11:00:00Z' },
      thresholdLine: 0.8,
      gateMode: 'shadow',
      reportHtmlRel: 'build/coverage/coverage_report.html',
      reportHtmlExists: true,
    })
  })

  it('a bare workspace answers ready with no fabricated fields', async () => {
    const root = await tempRoot()
    const status = await readTestFlowStatus(root)
    expect(status).toEqual({
      status: 'ready',
      reportHtmlRel: 'build/coverage/coverage_report.html',
      reportHtmlExists: false,
    })
  })

  it('broken JSON reports are skipped (未运行), the config still reads', async () => {
    const root = await tempRoot()
    await mkdir(join(root, '.baf', 'reports'), { recursive: true })
    await writeFile(join(root, '.baf', 'reports', 'ut-coverage.json'), '{not json', 'utf8')
    const status = await readTestFlowStatus(root)
    expect(status.coverage).toBeUndefined()
    expect(status.status).toBe('ready')
  })

  it('a config-less workspace still reports the report path default', async () => {
    const root = await tempRoot()
    const status = await readTestFlowStatus(root)
    expect(status.thresholdLine).toBeUndefined()
    expect(status.gateMode).toBeUndefined()
    expect(status.reportHtmlRel).toBe('build/coverage/coverage_report.html')
    expect(status.reportHtmlExists).toBe(false)
  })

  it('report_html relocation is honored for the existence probe', async () => {
    const root = await tempRoot()
    await mkdir(join(root, '.baf', 'quality'), { recursive: true })
    await mkdir(join(root, 'out'), { recursive: true })
    await writeFile(join(root, '.baf', 'quality', 'ceedling-config.json'), JSON.stringify({
      report_html: 'out/cov.html',
    }), 'utf8')
    await writeFile(join(root, 'out', 'cov.html'), '<html></html>', 'utf8')
    const status = await readTestFlowStatus(root)
    expect(status.reportHtmlRel).toBe('out/cov.html')
    expect(status.reportHtmlExists).toBe(true)
  })
})

describe('readTestFlowStageToggles (批次十三 4 测试流开关)', () => {
  it('unwraps the {version, stages} envelope and normalizes partial entries', async () => {
    const root = await tempRoot()
    await mkdir(join(root, '.baf', 'quality'), { recursive: true })
    await writeFile(join(root, '.baf', 'quality', 'test-flow.json'), JSON.stringify({
      version: 1,
      stages: {
        test: { enabled: false },
        gate: { enabled: true, haltOnError: false },
        // Garbage entries: non-object dropped, missing fields default on.
        ghost: 'not-an-object',
        lint: {},
      },
    }), 'utf8')
    const toggles = await readTestFlowStageToggles(root)
    // Envelope unwrapped: stage keys resolve (the pre-fix reader normalized
    // the ENVELOPE and silently answered {} — all-on defaults).
    expect(toggles.test).toEqual({ enabled: false, haltOnError: true })
    expect(toggles.gate).toEqual({ enabled: true, haltOnError: false })
    expect(toggles.lint).toEqual({ enabled: true, haltOnError: true })
    expect(Object.hasOwn(toggles, 'ghost')).toBe(false)
  })

  it('an absent or corrupt file answers {} (all-on defaults apply)', async () => {
    const absent = await readTestFlowStageToggles(await tempRoot())
    expect(absent).toEqual({})
    const corruptRoot = await tempRoot()
    await mkdir(join(corruptRoot, '.baf', 'quality'), { recursive: true })
    await writeFile(join(corruptRoot, '.baf', 'quality', 'test-flow.json'), '{not json', 'utf8')
    expect(await readTestFlowStageToggles(corruptRoot)).toEqual({})
  })

  it('rides along on readTestFlowStatus — absent file omits the field', async () => {
    const bare = await readTestFlowStatus(await tempRoot())
    expect(bare.stages).toBeUndefined()
    const root = await tempRoot()
    await mkdir(join(root, '.baf', 'quality'), { recursive: true })
    await writeFile(join(root, '.baf', 'quality', 'test-flow.json'), JSON.stringify({
      version: 1,
      stages: { format: { enabled: false } },
    }), 'utf8')
    const status = await readTestFlowStatus(root)
    expect(status.stages?.format).toEqual({ enabled: false, haltOnError: true })
  })
})

/**
 * 【变更】2026-10-22 (批次十三 3): the missing-tool classifier — pinned after a
 * live Windows 11 probe: cmd answers a missing command with exit **1** (not
 * 9009) and the localized 不是内部或外部命令 message arrives GBK-mangled, so
 * only the ASCII-stable `'NAME'` quoted-prefix check catches it.
 */
describe('classifyStageToolMissing (批次十三 3)', () => {
  it('catches Windows 11 exit-1 + GBK-mangled output via the quoted-prefix rule', () => {
    // 'baf-quality' followed by U+FFFD replacement chars (real probe bytes).
    const mangled = "'baf-quality' ��������\r\n"
    expect(classifyStageToolMissing(1, mangled, 'baf-quality lint (cpplint)')).toBe(true)
  })

  it('keeps the classic detectors: ENOENT, 9009, and readable not-found text', () => {
    expect(classifyStageToolMissing('ENOENT', '', 'gcc -c main.c')).toBe(true)
    expect(classifyStageToolMissing(9009, "'gcc' is not recognized", 'gcc -c main.c')).toBe(true)
    expect(classifyStageToolMissing(1, 'gcc: command not found', 'gcc -c main.c')).toBe(true)
  })

  it('does not misread a real stage failure as a missing tool', () => {
    // Exit 1 with actual findings (long output) is a lint failure, not ENOENT;
    // a lone quoted name only counts as not-found when the output is tiny.
    const findings = 'src/module.c:32:  Extra space before ( in function call.  [whitespace/parens] [5]\n'.repeat(4)
    expect(classifyStageToolMissing(1, findings, 'baf-quality lint (cpplint)')).toBe(false)
    // A different tool's not-found line must not classify this command missing.
    expect(classifyStageToolMissing(1, "'other-tool' nope", 'baf-quality lint (cpplint)')).toBe(false)
  })

  /** 批次十三复核 3: the shipped wrapper spawns ceedling/gcovr/… in a fresh
   * shell, so the not-found line can name the CHAIN member, not the wrapper. */
  it('catches a missing chain member inside a wrapper run (quoted ceedling/gcovr lines)', () => {
    expect(classifyStageToolMissing(1, "'ceedling' ��������\r\n", 'baf-quality test')).toBe(true)
    expect(classifyStageToolMissing(1, "'gcovr' is not recognized", 'baf-quality check')).toBe(true)
    expect(classifyStageToolMissing(1, "'cpplint' ��������", 'baf-quality lint')).toBe(true)
  })
})

describe('stageSpawnCommand (批次十三复核 3 — shipped baf-quality CLI)', () => {
  it('re-spawns baf-quality under node by absolute path, display contract intact', () => {
    const cli = 'D:/repo/packages/baf/baf-quality/baf-quality-cli.cjs'
    expect(stageSpawnCommand('baf-quality test', cli, 'C:/node/node.exe'))
      .toBe('"C:/node/node.exe" "D:/repo/packages/baf/baf-quality/baf-quality-cli.cjs" test')
    expect(stageSpawnCommand('baf-quality check --clean', cli, 'node.exe'))
      .toBe('"node.exe" "D:/repo/packages/baf/baf-quality/baf-quality-cli.cjs" check --clean')
  })

  it('leaves raw clang-format and the enterprise PATH-wrapper fallback untouched', () => {
    expect(stageSpawnCommand('clang-format -i source', 'D:/x.cjs', 'node.exe')).toBe('clang-format -i source')
    expect(stageSpawnCommand('baf-quality lint', undefined, 'node.exe')).toBe('baf-quality lint')
  })
})
