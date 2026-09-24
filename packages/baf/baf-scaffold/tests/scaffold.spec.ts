/**
 * baf-scaffold: workspace init skeleton with no-overwrite + backup semantics.
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { BafScaffold } from '../src/index.ts'
import {
  anchorGitWorkspace,
  applyScaffold,
  baselineTemplate,
  planScaffold,
  scaffoldWorkspace,
} from '../src/index.ts'

let workspace = ''

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'baf-scaffold-'))
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
})

function makeAt(): Date {
  return new Date('2026-09-13T10:00:00.000Z')
}

describe('baselineTemplate', () => {
  it('stamps the requested baseline id', () => {
    const text = baselineTemplate('my-baseline')
    expect(text).toContain('baselineId: my-baseline')
    expect(text).toContain('schema: 1')
  })

  it('uses enterprise-tbd placeholders for every owned value', () => {
    const text = baselineTemplate('x')
    expect(text).toContain('<enterprise-tbd>')
    expect(text).toContain('requireHumanConfirmation:')
    expect(text).toContain('scaffold')
  })
})

describe('planScaffold', () => {
  it('lays down baseline + openspec layout', () => {
    const plan = planScaffold({ baselineId: 'plan-test' })
    expect(plan.files.map(f => f.path)).toEqual([
      '.baf/baseline.yml',
      'openspec/changes/.gitkeep',
    ])
    const [baseline] = plan.files
    if (baseline === undefined) throw new Error('expected a baseline file')
    expect(baseline.content).toContain('baselineId: plan-test')
  })

  it('defaults to baf-baseline-init when no baseline id is supplied', () => {
    const plan = planScaffold()
    const [baseline] = plan.files
    if (baseline === undefined) throw new Error('expected a baseline file')
    expect(baseline.content).toContain('baselineId: baf-baseline-init')
  })
})

describe('applyScaffold', () => {
  it('creates all files on an empty workspace', () => {
    const plan = planScaffold({ baselineId: 'fresh' })
    const changes = applyScaffold(workspace, plan, makeAt())
    expect(changes.created).toEqual([
      '.baf/baseline.yml',
      'openspec/changes/.gitkeep',
    ])
    expect(changes.skipped).toEqual([])
    expect(changes.backedUp).toEqual([])
    expect(readFileSync(join(workspace, '.baf/baseline.yml'), 'utf8'))
      .toContain('baselineId: fresh')
    expect(readFileSync(join(workspace, 'openspec/changes/.gitkeep'), 'utf8'))
      .toBe('')
  })

  it('skips identical existing files', () => {
    const plan = planScaffold({ baselineId: 'idem' })
    applyScaffold(workspace, plan, makeAt())
    const second = applyScaffold(workspace, plan, makeAt())
    expect(second.created).toEqual([])
    expect(second.skipped).toEqual([
      '.baf/baseline.yml',
      'openspec/changes/.gitkeep',
    ])
    expect(second.backedUp).toEqual([])
  })

  it('backs up a differing existing file before writing', () => {
    const plan = planScaffold({ baselineId: 'first' })
    applyScaffold(workspace, plan, makeAt())
    // mutate only the baseline to force divergence
    const divergent = plan.files.map(f => f.path === '.baf/baseline.yml'
      ? { ...f, content: 'custom user content' }
      : f)
    const changes = applyScaffold(workspace, { files: divergent }, makeAt())
    expect(changes.created).toEqual([])
    expect(changes.skipped).toEqual(['openspec/changes/.gitkeep'])
    expect(changes.backedUp).toEqual(['.baf/baseline.yml'])
    // template re-applied
    expect(readFileSync(join(workspace, '.baf/baseline.yml'), 'utf8'))
      .toBe('custom user content')
    // backup carries the original template body
    const backups = readdirSync(join(workspace, '.baf'))
    const backupFile = backups.find((n: string) => n.startsWith('baseline.yml.baf-backup-'))
    expect(backupFile).toBeDefined()
    if (backupFile === undefined) throw new Error('expected a backup file')
    expect(readFileSync(join(workspace, '.baf', backupFile), 'utf8'))
      .toContain('baselineId: first')
  })
})

describe('scaffoldWorkspace', () => {
  it('refuses without human confirmation', () => {
    const out = scaffoldWorkspace({ workspaceRoot: workspace, humanConfirmed: false })
    expect(out.kind).toBe('refused')
    if (out.kind === 'refused') {
      expect(out.reason).toBe('human_confirmation_required')
    }
  })

  it('returns done with created changes when confirmed', () => {
    const out = scaffoldWorkspace({
      workspaceRoot: workspace,
      humanConfirmed: true,
      baselineId: 'confirmed',
      at: makeAt(),
    })
    expect(out.kind).toBe('done')
    if (out.kind === 'done') {
      expect(out.changes.created).toContain('.baf/baseline.yml')
      expect(out.changes.backedUp).toEqual([])
    }
    expect(readFileSync(join(workspace, '.baf/baseline.yml'), 'utf8'))
      .toContain('baselineId: confirmed')
  })
})

describe('anchorGitWorkspace (2026-09-22 user decision: scaffold owns the git anchor)', () => {
  it('creates a repository and a commit anchor on a fresh workspace', () => {
    applyScaffold(workspace, planScaffold({ baselineId: 'anchor' }), makeAt())
    const anchor = anchorGitWorkspace(workspace)
    // Best-effort contract: on a machine with git this lands; the note names
    // the anchor. (A git-less machine reports the failure instead — covered by
    // the shape, not simulated here.)
    if (anchor.initialized) {
      expect(anchor.revision).toBeDefined()
      expect(anchor.note).toContain('锚点')
      expect(existsSync(join(workspace, '.git'))).toBe(true)
      // A second run never touches the repository it just created.
      const again = anchorGitWorkspace(workspace)
      expect(again.initialized).toBe(false)
      expect(again.note).toContain('未改动')
    } else {
      expect(anchor.note).toContain('git init 未成功')
    }
  })

  it('never touches a pre-existing repository', () => {
    mkdirSync(join(workspace, '.git'), { recursive: true })
    const anchor = anchorGitWorkspace(workspace)
    expect(anchor.initialized).toBe(false)
    expect(anchor.note).toContain('未改动')
  })

  it('rides on the scaffold outcome so the card can report it', () => {
    const out = scaffoldWorkspace({
      workspaceRoot: workspace,
      humanConfirmed: true,
      baselineId: 'with-git',
      at: makeAt(),
    })
    expect(out.kind).toBe('done')
    if (out.kind === 'done') {
      expect(out.git).toBeDefined()
      if (out.git !== undefined) {
        expect(typeof out.git.note).toBe('string')
        expect(out.git.note).not.toBe('')
      }
    }
  })
})

describe('BafScaffold service', () => {
  it('mounts on a Cordis context and exposes scaffold()', async () => {
    const ctx = new Context()
    await ctx.plugin(BafScaffold, {})
    expect(ctx.bafScaffold.help()).toContain('BAF scaffold')
    const out = ctx.bafScaffold.scaffold({
      workspaceRoot: workspace,
      humanConfirmed: true,
      at: makeAt(),
    })
    expect(out.kind).toBe('done')
  })

  it('forwards a refused outcome from the service surface', async () => {
    const ctx = new Context()
    await ctx.plugin(BafScaffold, {})
    const out = ctx.bafScaffold.scaffold({
      workspaceRoot: workspace,
      humanConfirmed: false,
    })
    expect(out.kind).toBe('refused')
  })
})
