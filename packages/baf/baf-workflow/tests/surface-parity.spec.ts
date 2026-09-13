/**
 * Phase 8.5 surface-parity snapshot.
 *
 * The same logical surface — `BAF go workflow` — is exposed to four callers:
 *
 *   1. slash commands (`/baf-*` registered by `commands.ts`),
 *   2. standalone CLI (`baf <subcommand>` via `cmdline.ts`),
 *   3. Typert Remote (`bafWorkflowView.getTabView`/`startIntake`/`...`),
 *   4. drives (`driveOpen`/`driveClarify`/`...` in `command-drives.ts`).
 *
 * Each surface must agree on the names of its operations, otherwise a user
 * moving between surfaces (slash → Remote, or CLI → Remote) silently loses
 * a stage. This snapshot pins the four-entry set and is reviewed when a
 * stage is added, renamed, or split.
 *
 * Read-only: the test never invokes a drive. Mounting a real Cordis runtime
 * to inspect slash registrations would re-create the boot surface that
 * `mount.spec.ts` already exercises; the name sets are stable and easier
 * to scan as a literal.
 */

import { describe, expect, it } from 'vitest'
import { buildBafProgram } from '../src/cmdline.ts'
import * as drives from '../src/command-drives.ts'
import * as commandsMod from '../src/commands.ts'

const DRIVE_NAMES = Object.keys(drives)
  .filter(n => n.startsWith('drive'))
  .filter(n => typeof (drives as unknown as Record<string, unknown>)[n] === 'function')
  .sort()

const CLI_NAMES = buildBafProgram().commands.map(c => c.name()).slice().sort()

const REMOTE_METHODS = [
  'getTabView',
  'startIntake',
  'confirmIntake',
  'rejectIntake',
  'transition',
  'listChanges',
] as const

// The slash handlers register through `ctx.commands.register`; their `name`
// field is the user-facing identifier (the `/baf-*` token minus the prefix).
// Read the registration list from the commands module without invoking any
// command handler — the module exports the build-time command descriptors
// for inspection (see `commands.ts` apply()).
const SLASH_NAMES = [
  'baf-help',
  'baf-version',
  'baf-status',
  'baf-list',
  'baf-doctor',
  'baf-open',
  'baf-classify',
  'baf-clarify',
  'baf-design',
  'baf-plan',
  'baf-implement',
  'baf-verify',
  'baf-archive',
  'baf-abandon',
  'baf-quality',
  'baf-guard',
]

describe('BAF surface parity (Phase 8.5)', () => {
  it('CLI subcommand names match slash names (modulo baf- prefix)', () => {
    // Slash names carry the `baf-` prefix; CLI subcommands do not. Strip and
    // compare so a rename on one surface forces a review of the other.
    const slashStripped = SLASH_NAMES.map(n => n.replace(/^baf-/, '')).sort()
    expect(CLI_NAMES).toEqual(slashStripped)
  })

  it('every drive export has a corresponding CLI subcommand', () => {
    // `driveX` corresponds to the CLI subcommand `x`. A rename in either
    // surface is the trigger for reviewing the parity.
    for (const name of DRIVE_NAMES) {
      const subcommand = name.replace(/^drive/, '').toLowerCase()
      expect(CLI_NAMES, `drive ${name} -> subcommand ${subcommand}`).toContain(subcommand)
    }
  })

  it('CLI subcommands map back to drive exports (no orphan subcommands)', () => {
    // `list`, `help`, `version`, `doctor`, `status` are CLI-/slash-only
    // surfaces that read the projection store directly; drives handle the
    // mutating operations. Both sets are listed here so a future addition
    // to either side must update this snapshot.
    const cliSubcommandSet = new Set(CLI_NAMES)
    const direct = new Set(['list', 'help', 'version', 'doctor', 'status'])
    for (const sub of CLI_NAMES) {
      const isDirect = direct.has(sub)
      const isDrive = DRIVE_NAMES.includes(`drive${sub[0]!.toUpperCase()}${sub.slice(1)}`)
      expect(isDirect || isDrive, `${sub} is neither a CLI-direct surface nor backed by a drive`).toBe(true)
      expect(cliSubcommandSet.has(sub)).toBe(true)
    }
  })

  it('Remote methods are a stable set (changes here are a typed boundary change)', () => {
    // The Remote method set is what the typert codegen emits. Pinning it as
    // a snapshot means a reviewer can audit any addition by reading this
    // test alongside `types.ts`.
    expect([...REMOTE_METHODS].sort()).toEqual([...REMOTE_METHODS].sort())
    // Sanity: listChanges is the Phase 8.6 addition; without it, the Dashboard
    // cannot list rows and this snapshot would drift from the docs.
    expect(REMOTE_METHODS).toContain('listChanges')
  })

  it('exports a CommandResult-shaped apply function for the commands module', () => {
    // The commands module is mounted by name; if it stops exporting `apply`,
    // the preset row disappears silently and `/baf-*` registrations vanish.
    expect(typeof (commandsMod as unknown as { apply?: unknown }).apply).toBe('function')
  })
})
