/**
 * BAF tool-guard tests: pure policy adjudication (§8.6 reason codes), shell
 * classification, tool-call mapping, sync disk-state integration against a
 * real projection, the verify/secret-scan GuardPolicy actions, and the
 * install row's wiring contract.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { confirmIntake, createWorkflowService } from '@deepseek-ai/dsh-baf-workflow'
import { ProjectionStore } from '@deepseek-ai/dsh-baf-workflow'
import { StagePipeline } from '@deepseek-ai/dsh-baf-workflow'
import { recordTouched, completeTask, focusFor, resetFocusCache } from '@deepseek-ai/dsh-baf-workflow'
import {
  adjudicateFsWrite,
  adjudicateShell,
  adjudicateStructuralPath,
  matchesPathEntry,
  scanTextSecrets,
  type GuardPolicyConfig,
  type GuardWorkflowState,
} from '../src/policy.ts'
import { classifyToolCall, createBafToolGuard } from '../src/tool-guard.ts'
import { GUARD_BASELINE_PATH, loadGuardConfig, readGuardWorkflowState } from '../src/projection-state.ts'
import { BafGuard } from '../src/service.ts'
import { apply, inject, name as installName } from '../src/install.ts'

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

const CONFIG: GuardPolicyConfig = { secretScan: 'required', protectedPaths: ['config/secure/**'] }

function state(partial: Partial<GuardWorkflowState>): GuardWorkflowState {
  return {
    active: true,
    changeId: 'change-1',
    stage: 'implement',
    mode: 'full-go-path',
    intakeConfirmed: true,
    allowlist: ['src/feature.c'],
    changeDirRel: 'openspec/changes/change-1',
    ...partial,
  }
}

const ROOT = 'W:\\repo'

function exec(name: string, args: unknown) {
  return { name, arguments: args, callId: 'c1', rootCallId: 'c1', token: 't1' } as never
}

describe('policy: filesystem writes', () => {
  it('denies traversal, escape, system resources, and protected paths with stable codes', () => {
    const results = [
      adjudicateFsWrite(CONFIG, state({}), { root: ROOT, path: 'src/../..' }),
      adjudicateFsWrite(CONFIG, state({}), { root: ROOT, path: '..\\other\\x.c' }),
      adjudicateFsWrite(CONFIG, state({}), { root: ROOT, path: 'W:\\elsewhere\\x.c' }),
      adjudicateFsWrite(CONFIG, state({}), { root: ROOT, path: join(ROOT, '.git', 'config') }),
      adjudicateFsWrite(CONFIG, state({}), { root: ROOT, path: join(ROOT, '.baf', 'projection', 'index.json') }),
      adjudicateFsWrite(CONFIG, state({}), { root: ROOT, path: join(ROOT, 'config', 'secure', 'keys.h') }),
    ]
    expect(results.map(r => r.allowed)).toEqual([false, false, false, false, false, false])
    expect(results.map(r => (r.allowed ? '' : r.reasonCode))).toEqual([
      'path_traversal',
      'path_traversal',
      'workspace_escape',
      'system_resource_conflict',
      'system_resource_conflict',
      'protected_path',
    ])
  })

  // §22.15 D: the guard refuses model writes into other changes' dirs,
  // historical openspec/** artifacts, the spec/ folder, and the baseline
  // file itself — these are owned by the workflow, not the model.
  it('blocks openspec/** writes outside the active change dir even when allowlisted', () => {
    const otherChange = adjudicateFsWrite(CONFIG, state({}), {
      root: ROOT, path: join(ROOT, 'openspec', 'changes', 'change-99', 'design.md'),
    })
    expect(otherChange).toMatchObject({ allowed: false, reasonCode: 'protected_path' })
    const specFolder = adjudicateFsWrite(CONFIG, state({}), {
      root: ROOT, path: join(ROOT, 'openspec', 'spec', 'parser', 'spec.md'),
    })
    expect(specFolder).toMatchObject({ allowed: false, reasonCode: 'protected_path' })
    const archivedChange = adjudicateFsWrite(CONFIG, state({}), {
      root: ROOT, path: join(ROOT, 'openspec', 'changes', 'archive', 'change-1.md'),
    })
    expect(archivedChange).toMatchObject({ allowed: false, reasonCode: 'protected_path' })
    const baseline = adjudicateFsWrite(CONFIG, state({}), {
      root: ROOT, path: join(ROOT, '.baf', 'baseline.yml'),
    })
    expect(baseline).toMatchObject({ allowed: false, reasonCode: 'system_resource_conflict' })
  })

  it('still allows openspec writes inside the active change dir on doc stages', () => {
    const inside = adjudicateFsWrite(CONFIG, state({ stage: 'design' }), {
      root: ROOT, path: join(ROOT, 'openspec', 'changes', 'change-1', 'design.md'),
    })
    expect(inside.allowed).toBe(true)
  })

  // 【变更】2026-09-22 (user report #1, web walk change 170b): open's artifact
  // is proposal.md — the guard used to block EVERY change-dir write at open,
  // so the model could never author the proposal (it misread the block as
  // "artifacts are workflow-managed" and idled). Allow exactly proposal.md;
  // the other stage artifacts must stay unwritable until their stage begins.
  it('open stage allows only proposal.md inside the change dir', () => {
    const open = state({ stage: 'open' })
    const proposal = adjudicateFsWrite(CONFIG, open, {
      root: ROOT, path: join(ROOT, 'openspec', 'changes', 'change-1', 'proposal.md'),
    })
    expect(proposal.allowed).toBe(true)
    const clarify = adjudicateFsWrite(CONFIG, open, {
      root: ROOT, path: join(ROOT, 'openspec', 'changes', 'change-1', 'clarify.md'),
    })
    expect(clarify).toMatchObject({ allowed: false, reasonCode: 'protected_path' })
    const tasks = adjudicateFsWrite(CONFIG, open, {
      root: ROOT, path: join(ROOT, 'openspec', 'changes', 'change-1', 'tasks.md'),
    })
    expect(tasks).toMatchObject({ allowed: false, reasonCode: 'protected_path' })
    const source = adjudicateFsWrite(CONFIG, open, { root: ROOT, path: 'src/feature.c' })
    expect(source).toMatchObject({ allowed: false, reasonCode: 'invalid_transition' })
  })

  it('fails closed without an active change or with unconfirmed intake', () => {
    const noChange = adjudicateFsWrite(CONFIG, state({ active: false }), {
      root: ROOT, path: 'src/x.c',
    })
    expect(noChange).toMatchObject({ allowed: false, reasonCode: 'intake_confirmation_required' })
    const unconfirmed = adjudicateFsWrite(CONFIG, state({ intakeConfirmed: false }), {
      root: ROOT, path: 'src/x.c',
    })
    expect(unconfirmed).toMatchObject({ allowed: false, reasonCode: 'intake_confirmation_required' })
  })

  it('doc stages allow only change-dir writes; source writes are invalid_transition', () => {
    const design = state({ stage: 'design' })
    expect(adjudicateFsWrite(CONFIG, design, { root: ROOT, path: join(ROOT, 'openspec', 'changes', 'change-1', 'design.md') }).allowed).toBe(true)
    const source = adjudicateFsWrite(CONFIG, design, { root: ROOT, path: 'src/feature.c' })
    expect(source).toMatchObject({ allowed: false, reasonCode: 'invalid_transition' })
  })

  it('implement enforces the plan allowlist with scope_exceeded', () => {
    const implement = state({})
    expect(adjudicateFsWrite(CONFIG, implement, { root: ROOT, path: join(ROOT, 'src', 'feature.c') }).allowed).toBe(true)
    expect(adjudicateFsWrite(CONFIG, implement, { root: ROOT, path: join(ROOT, 'src', 'feature.h') }).allowed).toBe(false)
    const out = adjudicateFsWrite(CONFIG, implement, { root: ROOT, path: join(ROOT, 'other', 'y.c') })
    expect(out).toMatchObject({ allowed: false, reasonCode: 'scope_exceeded' })
  })

  it('verify/archive stages deny model filesystem writes', () => {
    for (const stage of ['verify', 'archive']) {
      const result = adjudicateFsWrite(CONFIG, state({ stage }), { root: ROOT, path: 'src/feature.c' })
      expect(result).toMatchObject({ allowed: false, reasonCode: 'invalid_transition' })
    }
  })

  it('scans written content for secrets and honors secretScan: off', () => {
    const dirty = adjudicateFsWrite(CONFIG, state({}), {
      root: ROOT, path: 'src/feature.c', content: 'const k = "AKIAIOSFODNN7EXAMPLE";\n',
    })
    expect(dirty).toMatchObject({ allowed: false, reasonCode: 'secret_detected' })
    const off: GuardPolicyConfig = { ...CONFIG, secretScan: 'off' }
    expect(adjudicateFsWrite(off, state({}), {
      root: ROOT, path: 'src/feature.c', content: 'const k = "AKIAIOSFODNN7EXAMPLE";\n',
    }).allowed).toBe(true)
  })

  it('matches path entries on / boundaries and ignores placeholder entries', () => {
    expect(matchesPathEntry('src/x.c', 'src')).toBe(true)
    expect(matchesPathEntry('srcx.c', 'src')).toBe(false)
    expect(matchesPathEntry('a/b/c.h', 'a/**')).toBe(true)
    expect(matchesPathEntry('x.c', 'a/**')).toBe(false)
    const withPlaceholder: GuardPolicyConfig = { secretScan: 'required', protectedPaths: ['<enterprise-tbd>'] }
    expect(adjudicateFsWrite(withPlaceholder, state({}), { root: ROOT, path: 'anything.c' }).allowed !== false
      || adjudicateStructuralPath(withPlaceholder, ROOT, 'anything.c').allowed).toBe(true)
  })
})

describe('policy: shell commands', () => {
  it('denies destructive and forced-Git commands', () => {
    for (const command of [
      'rm -rf /',
      'rm -rf ~',
      'format C:',
      'mkfs.ext4 /dev/sda1',
      'dd if=img.bin of=/dev/sda',
      'shutdown now',
      'git push --force origin main',
      'git push -f',
      'git push origin main --force-with-lease',
    ]) {
      const result = adjudicateShell(CONFIG, state({}), command)
      expect(result, command).toMatchObject({ allowed: false, reasonCode: 'dangerous_command' })
    }
  })

  it('denies indirect writes and redirects, allows fd duplication and build commands', () => {
    for (const command of [
      'echo hi > out.txt',
      'echo hi >> out.txt',
      'make 2> err.txt',
      'cat <<EOF\nx\nEOF',
      'tee out.txt',
      'sed -i s/a/b/ src/x.c',
      'sed --in-place s/a/b/ src/x.c',
      'cp a.c b.c',
      'mv a.c b.c',
      'rm src/x.c',
      'unzip bundle.zip',
      'curl -o data.bin https://example.com',
    ]) {
      const result = adjudicateShell(CONFIG, state({}), command)
      expect(result, command).toMatchObject({ allowed: false, reasonCode: 'shell_indirect_write' })
    }
    for (const command of [
      'make -j4',
      'gcc --version',
      'ctest --output-on-failure',
      'git status',
      'git push origin main',
      'ls -la',
      'make 2>&1',
    ]) {
      expect(adjudicateShell(CONFIG, state({}), command).allowed, command).toBe(true)
    }
  })
})

describe('tool classification and guard', () => {
  it('classifies write/edit/bash/pwsh and passes others through', () => {
    expect(classifyToolCall('write', { file_path: 'a.c', content: 'x' })).toEqual({
      kind: 'fs-write', path: 'a.c', content: 'x',
    })
    expect(classifyToolCall('edit', { file_path: 'a.c', old_string: 'x', new_string: 'y' })).toEqual({
      kind: 'fs-write', path: 'a.c', content: 'y',
    })
    expect(classifyToolCall('bash', { command: 'make' })).toEqual({ kind: 'shell', command: 'make' })
    expect(classifyToolCall('pwsh', { command: 'gcc --version' })).toEqual({ kind: 'shell', command: 'gcc --version' })
    expect(classifyToolCall('read', { file_path: 'a.c' })).toEqual({ kind: 'unrecognized' })
    expect(classifyToolCall('write', { content: 'orphan' })).toEqual({ kind: 'unrecognized' })
  })

  it('returns stable-prefix denial strings and undefined for allowed calls', () => {
    const guard = createBafToolGuard({
      workspaceRoot: ROOT,
      sources: {
        readConfig: () => CONFIG,
        readState: () => state({ stage: 'design' }),
      },
    })
    const denial = guard(exec('write', { file_path: join(ROOT, 'src', 'x.c'), content: '' }))
    expect(denial).toMatch(/^\[baf-guard\] invalid_transition: /)
    expect(guard(exec('bash', { command: 'make -j4' }))).toBeUndefined()
    expect(guard(exec('read', { file_path: 'anything' }))).toBeUndefined()
  })

  it('re-adjudicates on every call: a stage change flips the verdict', () => {
    let current = state({ stage: 'design' })
    const guard = createBafToolGuard({
      workspaceRoot: ROOT,
      sources: { readConfig: () => CONFIG, readState: () => current },
    })
    const target = join(ROOT, 'src', 'feature.c')
    expect(guard(exec('write', { file_path: target, content: '' }))).toContain('invalid_transition')
    current = state({ stage: 'implement' })
    expect(guard(exec('write', { file_path: target, content: '' }))).toBeUndefined()
    // Out of allowlist flips it back.
    expect(guard(exec('write', { file_path: join(ROOT, 'src', 'other.c'), content: '' }))).toContain('scope_exceeded')
  })
})

describe('§22.17 J hard line: generic question tool vs pending gate', () => {
  it('denies ask_user_question while a gate is pending, pointing at baf_gate_ask', () => {
    const guard = createBafToolGuard({
      workspaceRoot: ROOT,
      sources: {
        readConfig: () => CONFIG,
        readState: () => state({ stage: 'intake', intakeConfirmed: false, gatePending: true }),
      },
    })
    const denial = guard(exec('ask_user_question', { questions: [] }))
    expect(denial).toContain('gate_pending_ask_blocked')
    expect(denial).toContain('baf_gate_ask')
  })

  it('allows ask_user_question when no gate is pending (clarification stays legal)', () => {
    const guard = createBafToolGuard({
      workspaceRoot: ROOT,
      sources: {
        readConfig: () => CONFIG,
        readState: () => state({ stage: 'implement', gatePending: false }),
      },
    })
    expect(guard(exec('ask_user_question', { questions: [] }))).toBeUndefined()
  })

  it('allows ask_user_question in an inactive workspace (auto-pop owns that zone)', () => {
    const guard = createBafToolGuard({
      workspaceRoot: ROOT,
      sources: {
        readConfig: () => CONFIG,
        readState: () => ({ active: false, intakeConfirmed: false, allowlist: [] }),
      },
    })
    expect(guard(exec('ask_user_question', { questions: [] }))).toBeUndefined()
  })

  it('2026-09-21 standing rule: an option-bearing ask is denied at every workflow state, pointing at baf_question_ask', () => {
    // The rule holds outside the pending-gate window too — a selection
    // question anywhere must ride the BAF popup channels (session 6.jsonl:
    // prose A/B lists and generic option asks both bypassed the card rule).
    for (const st of [
      state({ stage: 'implement', gatePending: false }),
      { active: false, intakeConfirmed: false, allowlist: [] },
      state({ stage: 'design', gatePending: false }),
    ]) {
      const guard = createBafToolGuard({
        workspaceRoot: ROOT,
        sources: { readConfig: () => CONFIG, readState: () => st },
      })
      const denial = guard(exec('ask_user_question', {
        questions: [{ id: 'q1', question: '选哪个？', options: [{ label: 'A' }, { label: 'B' }] }],
      }))
      expect(denial).toContain('ask_options_blocked')
      expect(denial).toContain('baf_question_ask')
    }
  })

  it('a pending gate still takes precedence over the option-bearing denial', () => {
    const guard = createBafToolGuard({
      workspaceRoot: ROOT,
      sources: {
        readConfig: () => CONFIG,
        readState: () => state({ stage: 'intake', intakeConfirmed: false, gatePending: true }),
      },
    })
    const denial = guard(exec('ask_user_question', {
      questions: [{ id: 'q1', question: '选哪个？', options: [{ label: 'A' }, { label: 'B' }] }],
    }))
    expect(denial).toContain('gate_pending_ask_blocked')
  })

  it('free-text-only questions (no options anywhere) stay legal', () => {
    const guard = createBafToolGuard({
      workspaceRoot: ROOT,
      sources: {
        readConfig: () => CONFIG,
        readState: () => state({ stage: 'implement', gatePending: false }),
      },
    })
    expect(guard(exec('ask_user_question', {
      questions: [{ id: 'q1', question: '环境变量叫什么？' }],
    }))).toBeUndefined()
    // An empty options array is not a selection question.
    expect(guard(exec('ask_user_question', {
      questions: [{ id: 'q1', question: '补充一下背景？', options: [] }],
    }))).toBeUndefined()
  })

  it('disk state: unconfirmed intake ⇒ gatePending; confirm ⇒ cleared', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-guard-gate-'))
    try {
      await mkdir(join(root, '.baf'), { recursive: true })
      const baseline = await loadBaselineFile(FIXTURE_BASELINE)
      const store = new ProjectionStore({ workspaceRoot: root })
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'feat: add export public API for reports',
        workspace: { root },
        affectedScopeHint: 'public-api',
        baseline,
      })
      expect(readGuardWorkflowState(root).gatePending).toBe(true)
      await confirmIntake(store, intake.changeId, 'user')
      expect(readGuardWorkflowState(root).gatePending).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  })
})

describe('sync disk state', () => {
  async function workspace() {
    const root = await mkdtemp(join(tmpdir(), 'baf-guard-'))
    return { root, clean: () => rm(root, { recursive: true, force: true }) }
  }

  async function driveToImplement(root: string) {
    const store = new ProjectionStore({ workspaceRoot: root })
    const baseline = await loadBaselineFile(FIXTURE_BASELINE)
    const pipeline = new StagePipeline({ store, workspaceRoot: root, gitRevision: 'rev-1', baseline })
    const service = createWorkflowService({ store })
    const { intake } = await service.intake({
      description: 'feat: serializer',
      workspace: { root },
      affectedScopeHint: 'small-local',
    })
    await confirmIntake(store, intake.changeId, 'user')
    await pipeline.driveOpenStage(intake.changeId, 'Serializer', 'slash')
    await pipeline.driveClarifyStage({
      changeId: intake.changeId,
      questions: [{ question: 'Q?', answer: 'A', status: 'decided' }],
      acceptanceCriteria: ['test passes'],
    })
    await pipeline.driveDesignStage({
      changeId: intake.changeId,
      approach: 'Approach',
      references: [],
    })
    await pipeline.drivePlanStage({
      changeId: intake.changeId,
      tasks: [{ id: 't1', title: 'T', files: ['src/ser.c'], verify: ['make test'], rollback: 'git revert HEAD' }],
      allowlist: ['src/ser.c'],
    }, 'slash')
    await pipeline.enterImplementStage(intake.changeId, 'slash')
    return intake.changeId
  }

  it('reads an empty workspace as no active change and default fail-closed config', async () => {
    const { root, clean } = await workspace()
    try {
      expect(readGuardWorkflowState(root)).toEqual({ active: false, intakeConfirmed: false, allowlist: [] })
      expect(loadGuardConfig(root)).toEqual({ secretScan: 'required', protectedPaths: [] })
      const guard = createBafToolGuard({ workspaceRoot: root })
      const denial = guard(exec('write', { file_path: join(root, 'src', 'x.c'), content: '' }))
      expect(denial).toContain('intake_confirmation_required')
    } finally {
      await clean()
    }
  })

  // Drives a real workspace to implement (git+fs heavy); under full-suite
  // parallel load the default 5s budget intermittently expires (hunt
  // 2026-09-20: 5048ms).
  it('adjudicates against a real on-disk projection driven to implement', { timeout: 60_000 }, async () => {
    const { root, clean } = await workspace()
    try {
      const changeId = await driveToImplement(root)
      const snapshot = readGuardWorkflowState(root)
      expect(snapshot.active).toBe(true)
      expect(snapshot.changeId).toBe(changeId)
      expect(snapshot.stage).toBe('implement')
      expect(snapshot.intakeConfirmed).toBe(true)
      expect(snapshot.allowlist).toEqual(['src/ser.c'])

      const guard = createBafToolGuard({ workspaceRoot: root })
      expect(guard(exec('write', { file_path: join(root, 'src', 'ser.c'), content: 'int x;' }))).toBeUndefined()
      expect(guard(exec('edit', {
        file_path: join(root, 'src', 'other.c'), old_string: 'a', new_string: 'b',
      }))).toContain('scope_exceeded')
      // Doc writes stay legal inside the change dir.
      expect(guard(exec('write', {
        file_path: join(root, 'openspec', 'changes', changeId, 'design.md'), content: 'notes',
      }))).toBeUndefined()
    } finally {
      await clean()
    }
  })

  // §22.19 ranking — session 7.jsonl R3: a twin change minted beside a
  // running one was "fresher" (updatedAt), so the guard demanded ITS
  // confirmation while the model wrote the running change's artifacts.
  // The unified ranking is write-path → session focus → highest seq.
  describe('§22.19 unified change ranking', () => {
    /** A change driven to implement + a fresher twin parked at intake. */
    async function seededTwin() {
      const { root, clean } = await workspace()
      const changeId = await driveToImplement(root)
      const store = new ProjectionStore({ workspaceRoot: root })
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'twin requirement stated later (fresher updatedAt, higher seq)',
        workspace: { root },
      })
      resetFocusCache()
      return { root, clean, changeId, twinId: intake.changeId }
    }

    it('a write inside a change dir adjudicates against THAT change, not the fresher twin', { timeout: 60_000 }, async () => {
      const { root, clean, changeId } = await seededTwin()
      try {
        // Old ranking (updatedAt freshest) picked the twin → the doc write
        // died on intake_confirmation_required. Rule 1 selects the change
        // the write targets → legal doc write.
        expect(readGuardWorkflowState(root).changeId).toBe(changeId)
        const guard = createBafToolGuard({ workspaceRoot: root })
        expect(guard(exec('write', {
          file_path: join(root, 'openspec', 'changes', changeId, 'design.md'), content: 'notes',
        }))).toBeUndefined()
      } finally {
        await clean()
      }
    })

    it('the session focus wins for writes outside every change dir', { timeout: 60_000 }, async () => {
      const { root, clean, changeId } = await seededTwin()
      try {
        focusFor(root).set(changeId)
        // src/other.c is outside A's allowlist → scope_exceeded against A;
        // against the twin it would be intake_confirmation_required. The
        // denial names which change was adjudicated.
        const guard = createBafToolGuard({ workspaceRoot: root })
        expect(guard(exec('edit', {
          file_path: join(root, 'src', 'other.c'), old_string: 'a', new_string: 'b',
        }))).toContain('scope_exceeded')
      } finally {
        resetFocusCache()
        await clean()
      }
    })

    it('without path or focus the seq ranking wins over freshest updatedAt', { timeout: 60_000 }, async () => {
      const { root, clean, changeId, twinId } = await seededTwin()
      try {
        // `seq` is per-change (the twin's log has seq 1; the driven change
        // sits at seq ~15), so the §22.19 fallback picks the PROGRESSED
        // change — the old updatedAt-freshest sort picked the twin and
        // demanded its confirmation instead (session 7.jsonl R3).
        const snapshot = readGuardWorkflowState(root)
        expect(snapshot.changeId).toBe(changeId)
        expect(twinId).not.toBe(changeId)
      } finally {
        await clean()
      }
    })
  })

  it('loads the guard section from .baf/baseline.yml when present', async () => {
    const { root, clean } = await workspace()
    try {
      await mkdir(join(root, '.baf'), { recursive: true })
      const baseline = await loadBaselineFile(FIXTURE_BASELINE)
      const customized = {
        ...baseline,
        guard: { ...baseline.guard, protectedPaths: ['vendor/**'] },
      }
      await writeFile(join(root, GUARD_BASELINE_PATH), JSON.stringify(customized), 'utf8')
      expect(loadGuardConfig(root)).toEqual({ secretScan: 'required', protectedPaths: ['vendor/**'] })
      const guard = createBafToolGuard({ workspaceRoot: root })
      expect(guard(exec('write', { file_path: join(root, 'vendor', 'x.c'), content: '' })))
        .toContain('protected_path')
    } finally {
      await clean()
    }
  })
})

describe('GuardPolicy actions (verify wiring)', () => {
  it('verify action reports structural reason codes over touched paths', async () => {
    const ctx = new Context()
    await ctx.plugin(BafGuard, {})
    const root = await mkdtemp(join(tmpdir(), 'baf-policy-'))
    try {
      const policy = ctx.bafGuard.policy(root)
      const baseline = { guard: { secretScan: 'required' as const, protectedPaths: [], requireHumanConfirmation: [] } }
      const outsideAbs = join(tmpdir(), 'baf-outside', 'x.c')
      const report = await policy.check({
        workspace: { root },
        baseline: baseline as never,
        paths: ['../outside.c', outsideAbs, 'src/x.c'],
        action: 'verify',
      }, new AbortController().signal)
      expect(report.allowed).toBe(false)
      expect(report.reasonCodes).toContain('path_traversal')
      expect(report.reasonCodes).toContain('workspace_escape')
      const clean = await policy.check({
        workspace: { root },
        baseline: baseline as never,
        paths: ['src/x.c'],
        action: 'verify',
      }, new AbortController().signal)
      expect(clean).toEqual({ allowed: true, reasonCodes: [] })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('secret-scan action reads touched files and reports secret_detected', async () => {
    const ctx = new Context()
    await ctx.plugin(BafGuard, {})
    const root = await mkdtemp(join(tmpdir(), 'baf-scan-'))
    try {
      await mkdir(join(root, 'src'), { recursive: true })
      await writeFile(join(root, 'src', 'leak.c'), 'key = "AKIAIOSFODNN7EXAMPLE"\n', 'utf8')
      await writeFile(join(root, 'src', 'clean.c'), 'int x;\n', 'utf8')
      const policy = ctx.bafGuard.policy(root)
      const baseline = {
        guard: { secretScan: 'required' as const, protectedPaths: [], requireHumanConfirmation: [] },
      }
      const bad = await policy.check({ workspace: { root }, baseline: baseline as never, paths: ['src/leak.c'], action: 'secret-scan' }, new AbortController().signal)
      expect(bad.allowed).toBe(false)
      expect(bad.reasonCodes).toContain('secret_detected')
      const good = await policy.check({ workspace: { root }, baseline: baseline as never, paths: ['src/clean.c'], action: 'secret-scan' }, new AbortController().signal)
      expect(good).toEqual({ allowed: true, reasonCodes: [] })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects unknown actions fail-closed', async () => {
    const ctx = new Context()
    await ctx.plugin(BafGuard, {})
    const policy = ctx.bafGuard.policy('W:\\x')
    const report = await policy.check({
      workspace: { root: 'W:\\x' },
      baseline: {} as never,
      paths: [],
      action: 'nonsense',
    }, new AbortController().signal)
    expect(report).toEqual({ allowed: false, reasonCodes: ['invalid_transition'] })
  })
})

describe('install row wiring contract', () => {
  it('registers agent/created + agent/disposed + teardown via the agents service', () => {
    const handlers = new Map<string, unknown>()
    const ctx = {
      agents: { list: (): [] => [] },
      on: vi.fn((event: string, handler: unknown) => {
        handlers.set(event, handler)
        return () => handlers.delete(event)
      }),
      effect: vi.fn(),
      logger: { warn: vi.fn() },
    }
    expect(installName).toBe('baf-guard-install')
    expect(inject).toEqual(['agents'])
    apply(ctx as never)
    expect(handlers.has('agent/created')).toBe(true)
    expect(handlers.has('agent/disposed')).toBe(true)
    expect(ctx.effect).toHaveBeenCalledTimes(1)
  })
})

describe('secret scanner primitives', () => {
  it('labels known credential shapes', () => {
    expect(scanTextSecrets('AKIAIOSFODNN7EXAMPLE')).toEqual(['aws-access-key'])
    expect(scanTextSecrets(`ghp_${'a'.repeat(36)}`)).toEqual(['github-token'])
    expect(scanTextSecrets('-----BEGIN RSA PRIVATE KEY-----')).toEqual(['private-key'])
    expect(scanTextSecrets('int x = 42;')).toEqual([])
  })
})

// recordTouched/completeTask are exercised by the disk-state suite's chain
// drivers; imported here to keep the dependency explicit.
void recordTouched
void completeTask
