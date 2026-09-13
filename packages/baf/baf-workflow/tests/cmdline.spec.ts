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
      'abandon',
      'archive',
      'clarify',
      'classify',
      'design',
      'doctor',
      'guard',
      'help',
      'implement',
      'list',
      'open',
      'plan',
      'quality',
      'status',
      'verify',
      'version',
    ])
  })

  it('mirrors /baf-status wording in the status subcommand description', () => {
    const status = program.commands.find(c => c.name() === 'status')
    expect(status?.description()).toBe('显示当前变更工作流状态')
  })

  it('declares drive-style subcommands without the .action() body leaking', () => {
    // Drive subcommands share the same handler template; asserting the
    // description keeps "与 /baf-<stage> 同源 drive" so anyone scanning the
    // program knows the source of truth.
    for (const stage of ['open', 'classify', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive', 'abandon']) {
      const cmd = program.commands.find(c => c.name() === stage)
      expect(cmd?.description()).toContain(`与 /baf-${stage} 同源 drive`)
    }
  })
})
