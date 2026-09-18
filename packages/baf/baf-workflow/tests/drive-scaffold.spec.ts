/**
 * driveScaffold smoke tests (§22.4) — assert the scaffold drive's surface
 * contract without booting the real `baf-scaffold` service. The drive is the
 * glue between the `/baf-scaffold` slash, the `baf scaffold` CLI, and the
 * `baf-scaffold` package; a stub adapter exercises the contract locally.
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { driveScaffold, type ScaffoldAdapter, type ScaffoldAdapterOptions } from '../src/command-drives.ts'

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'baf-scaffold-drive-'))
}

function makeStubAdapter(record: { calls: ScaffoldAdapterOptions[]; outcome: 'done' | 'refused' }): ScaffoldAdapter {
  return {
    scaffold: (options) => {
      record.calls.push(options)
      if (record.outcome === 'refused') {
        return { kind: 'refused', reason: 'human_confirmation_required' }
      }
      return {
        kind: 'done',
        changes: { created: ['.baf/baseline.yml'], skipped: ['openspec/changes/.gitkeep'], backedUp: [] },
      }
    },
  }
}

describe('driveScaffold (§22.4)', () => {
  it('returns a missing-adapter card when scaffold is not mounted', async () => {
    const cwd = makeTmp()
    try {
      const result = await driveScaffold(cwd, {})
      expect(result.kind).toBe('error')
      expect(result.text).toContain('scaffold 服务未挂载')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('passes humanConfirmed:true unconditionally (the slash / button already proved intent)', async () => {
    const cwd = makeTmp()
    const record = { calls: [] as ScaffoldAdapterOptions[], outcome: 'done' as const }
    try {
      const result = await driveScaffold(cwd, { scaffold: makeStubAdapter(record) })
      expect(result.kind).toBe('success')
      expect(record.calls).toHaveLength(1)
      expect(record.calls[0]?.humanConfirmed).toBe(true)
      expect(record.calls[0]?.workspaceRoot).toBe(cwd)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('uses the explicit baselineId when provided as the third arg', async () => {
    const cwd = makeTmp()
    const record = { calls: [] as ScaffoldAdapterOptions[], outcome: 'done' as const }
    try {
      await driveScaffold(cwd, { scaffold: makeStubAdapter(record) }, 'enterprise-baseline-42')
      expect(record.calls[0]?.baselineId).toBe('enterprise-baseline-42')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('defaults baselineId to "baf-baseline-init" (matches baf-scaffold\'s planScaffold)', async () => {
    const cwd = makeTmp()
    const record = { calls: [] as ScaffoldAdapterOptions[], outcome: 'done' as const }
    try {
      await driveScaffold(cwd, { scaffold: makeStubAdapter(record) })
      expect(record.calls[0]?.baselineId).toBe('baf-baseline-init')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('reports a refusal card if the adapter refuses (defensive — drive should never set humanConfirmed:false)', async () => {
    const cwd = makeTmp()
    try {
      const result = await driveScaffold(cwd, {
        scaffold: makeStubAdapter({ calls: [], outcome: 'refused' }),
      })
      expect(result.kind).toBe('error')
      expect(result.text).toContain('需人工确认')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('reports created / skipped / backedUp counts and a "下一步" pointer', async () => {
    const cwd = makeTmp()
    try {
      const result = await driveScaffold(cwd, {
        scaffold: makeStubAdapter({ calls: [], outcome: 'done' }),
      })
      expect(result.kind).toBe('success')
      expect(result.text).toContain('已创建')
      expect(result.text).toContain('.baf/baseline.yml')
      expect(result.text).toContain('已跳过（内容一致）')
      expect(result.text).toContain('下一步')
      expect(result.text).toContain('/baf-workflow-open')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
