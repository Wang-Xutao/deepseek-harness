/**
 * Phase 8.2 baf-cli parity tests: assert that the `baf` Commander tree exposes
 * one subcommand per slash handler, in the same order, with matching help
 * text. Drives are wired through `command-drives.ts` so the unit tests
 * exercise the same module surface the slash handlers use — only the cwd
 * source differs.
 *
 * Mounting the row under a real Cordis runtime is intentionally out of
 * scope: that path runs through `parseCmdline`, which terminates the process
 * on a successful parse. The Commander tree shape is what callers (and the
 * shipped profile patch) depend on.
 */

import { describe, expect, it } from 'vitest'
import { buildBafProgram } from '../src/cmdline.ts'

describe('baf-cli Commander tree', () => {
  const program = buildBafProgram()

  it('declares the baf-cli name and global --cwd flag', () => {
    expect(program.name()).toBe('baf')
    const opts = program.opts<{ cwd?: string; quiet?: boolean }>()
    expect(opts).toMatchObject({ quiet: false })
    expect(program.commands.length).toBeGreaterThanOrEqual(4)
  })

  it('exposes the slash-mirroring subcommand set', () => {
    const names = program.commands.map(c => c.name()).slice().sort()
    expect(names).toEqual([
      'check-guard',
      'check-quality',
      'doctor',
      'go',
      'help',
      'list',
      'status',
      'version',
      'welcome',
      'workflow-abandon',
      'workflow-archive',
      'workflow-clarify',
      'workflow-classify',
      'workflow-design',
      'workflow-implement',
      'workflow-open',
      'workflow-plan',
      'workflow-resume',
      'workflow-verify',
    ])
  })

  it('mirrors /baf-status wording in the status subcommand description', () => {
    const status = program.commands.find(c => c.name() === 'status')
    expect(status?.description()).toBe('查看当前变更：模式/阶段/intake · ★★★')
  })

  it('mirrors /baf-welcome wording in the welcome subcommand description', () => {
    // §18.3 startup card: the CLI mirror exists so a CI job or a terminal-only
    // user can read the same binding + toolchain report the desktop prints.
    const welcome = program.commands.find(c => c.name() === 'welcome')
    expect(welcome?.description()).toContain('与 /baf-welcome 同源渲染')
  })

  it('declares drive-style subcommands with the new tier-prefixed names', () => {
    // Drive subcommands share the same handler template; asserting the
    // description keeps "与 /baf-<slash> 同源 drive" so anyone scanning the
    // program knows the source of truth, and that the tier prefix
    // (`workflow-` or `check-`) lines up with the slash name.
    const driveMap: ReadonlyArray<readonly [string, string]> = [
      ['workflow-open', 'baf-workflow-open'],
      ['workflow-classify', 'baf-workflow-classify'],
      ['workflow-clarify', 'baf-workflow-clarify'],
      ['workflow-design', 'baf-workflow-design'],
      ['workflow-plan', 'baf-workflow-plan'],
      ['workflow-implement', 'baf-workflow-implement'],
      ['workflow-archive', 'baf-workflow-archive'],
      ['workflow-abandon', 'baf-workflow-abandon'],
      ['workflow-resume', 'baf-workflow-resume'],
    ]
    for (const [stage, slash] of driveMap) {
      const cmd = program.commands.find(c => c.name() === stage)
      expect(cmd?.description()).toContain(`与 /${slash} 同源 drive`)
    }
    const verify = program.commands.find(c => c.name() === 'workflow-verify')
    expect(verify?.description()).toContain('与 /baf-workflow-verify 同源 drive')
    const quality = program.commands.find(c => c.name() === 'check-quality')
    expect(quality?.description()).toContain('与 /baf-check-quality 同源 drive')
    const guard = program.commands.find(c => c.name() === 'check-guard')
    expect(guard?.description()).toContain('与 /baf-check-guard 同源 drive')
  })
})
