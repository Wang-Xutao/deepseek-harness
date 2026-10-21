/**
 * 【变更】2026-10-21 (批次十 测试流图): the host `testFlowStatus` reader's
 * contracts — defensive reads of the workspace's quality reports + config:
 *
 * - a full workspace maps every field (snake_case `generated_at` → camelCase)
 * - a bare workspace with no reports answers ready with nothing fabricated
 * - a broken JSON report is skipped, not thrown (the tab paints 未运行)
 * - the HTML coverage report's existence follows the config's report_html
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readTestFlowStatus } from '../src/index.ts'

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
