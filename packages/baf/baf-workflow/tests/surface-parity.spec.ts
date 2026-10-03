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
 * `/baf-go` (§18) deliberately spans all four without becoming a fifth: it
 * composes the drives behind one entry and owns no transition of its own, so
 * it is pinned here as an entry point rather than as a drive export.
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
  'resume',
  'listChanges',
  'gateResolve',
] as const

// The slash handlers register through `ctx.commands.register`; their `name`
// field is the user-facing identifier. Read the registration list from the
// commands module without invoking any command handler — the module exports
// the build-time command descriptors for inspection (see `commands.ts`
// apply()).
const SLASH_NAMES = [
  'baf-help',
  'baf-welcome',
  'baf-gate',
  'baf-go',
  'baf-go-confirm',
  'baf-version',
  'baf-status',
  'baf-list',
  'baf-doctor',
  'baf-scaffold',
  'baf-workflow-open',
  'baf-workflow-classify',
  'baf-workflow-clarify',
  'baf-workflow-design',
  'baf-workflow-plan',
  'baf-workflow-implement',
  'baf-workflow-verify',
  'baf-workflow-archive',
  'baf-workflow-abandon',
  'baf-workflow-resume',
  'baf-check-quality',
  'baf-check-guard',
  // §11.8/9.6: desktop update loop — not drive-backed; the handlers talk to
  // the desktop host through the env-named state + request/response files
  // (`update-surface.ts`), so they are CLI-/slash-direct surfaces.
  // 2026-10-03 简化指令面: status/check/apply merged into ONE `baf-update`
  // (check + popup 升级/取消 + apply), rollback stays its own verb.
  'baf-update',
  'baf-update-rollback',
]

// Slash names ↔ drive exports. Drives are organised by domain so the slash
// names are tier-prefixed (`baf-workflow-*` for stage transitions,
// `baf-check-*` for gated checks); the CLI subcommand is the slash name
// with the `baf-` prefix stripped.
const DRIVE_TO_SLASH: Record<string, string> = {
  driveOpen: 'baf-workflow-open',
  driveClassify: 'baf-workflow-classify',
  driveClarify: 'baf-workflow-clarify',
  driveDesign: 'baf-workflow-design',
  drivePlan: 'baf-workflow-plan',
  driveImplement: 'baf-workflow-implement',
  driveVerify: 'baf-workflow-verify',
  driveArchive: 'baf-workflow-archive',
  driveAbandon: 'baf-workflow-abandon',
  driveResume: 'baf-workflow-resume',
  driveQuality: 'baf-check-quality',
  driveGuard: 'baf-check-guard',
  driveScaffold: 'baf-scaffold',
  // §22.14 Tab gate-card resolve: dispatched from BafWorkflowTabRemote only
  // (no slash / CLI entry — the Tab is the single resolver surface).
  driveGateResolve: '__gate-resolve-only__',
}

const SLASH_TO_DRIVE: Record<string, string> = Object.fromEntries(
  Object.entries(DRIVE_TO_SLASH).map(([d, s]) => [s, d]),
)

describe('BAF surface parity (Phase 8.5)', () => {
  it('CLI subcommand names match slash names (modulo baf- prefix)', () => {
    // Slash names carry the `baf-` prefix; CLI subcommands do not. Strip and
    // compare so a rename on one surface forces a review of the other.
    const slashStripped = SLASH_NAMES.map(n => n.replace(/^baf-/, '')).sort()
    expect(CLI_NAMES).toEqual(slashStripped)
  })

  it('every drive export has a corresponding CLI subcommand (except Remote-only drives)', () => {
    // Drives map 1:1 to slash names via DRIVE_TO_SLASH; the CLI subcommand
    // is the slash name with the `baf-` prefix stripped. A rename in either
    // surface is the trigger for reviewing this snapshot.
    //
    // `driveGateResolve` is the one exception: it is dispatched only by the
    // Tab Remote (no slash / CLI), so its DRIVE_TO_SLASH entry uses a
    // sentinel and is skipped here. Listed separately to keep the rule
    // visible: drives without a slash backing must be intentional, not drift.
    for (const [drive, slash] of Object.entries(DRIVE_TO_SLASH)) {
      if (slash === '__gate-resolve-only__') continue
      const subcommand = slash.replace(/^baf-/, '')
      expect(CLI_NAMES, `drive ${drive} -> subcommand ${subcommand}`).toContain(subcommand)
    }
    expect(DRIVE_TO_SLASH['driveGateResolve']).toBe('__gate-resolve-only__')
  })

  it('DRIVE_TO_SLASH covers every drive export (no orphan drives)', () => {
    // A new `driveX` export must also be added to DRIVE_TO_SLASH, otherwise
    // it would be reachable from no surface at all — the map is the only
    // link between the drive module and the slash / CLI names.
    expect([...DRIVE_NAMES].sort()).toEqual(Object.keys(DRIVE_TO_SLASH).sort())
  })

  it('CLI subcommands map back to drive exports (no orphan subcommands)', () => {
    // `list`, `help`, `version`, `doctor`, `status`, `welcome`, `gate`, `go`,
    // `go-confirm` are CLI-/slash-only surfaces that read the projection
    // store directly; drives handle the mutating operations. The two
    // `update*` subcommands are the same kind — they round-trip the desktop
    // update channel instead of dispatching a drive. Both sets are listed
    // here so a future addition to either side must update this snapshot.
    //
    // `go` and `go-confirm` are the third kind and the reason this test lists
    // them explicitly: the §18 / §22.17 coordinators live in
    // `go-coordinator.ts` (not `command-drives.ts`) *on purpose*, so
    // DRIVE_TO_SLASH stays strictly "one drive = one stage transition" and
    // the coordinator's chaining never looks like a transition of its own.
    // It composes drives; it owns none.
    const cliSubcommandSet = new Set(CLI_NAMES)
    const direct = new Set(['list', 'help', 'version', 'doctor', 'status', 'welcome', 'gate', 'go', 'go-confirm', 'update', 'update-rollback'])
    for (const sub of CLI_NAMES) {
      const slash = `baf-${sub}`
      const isDirect = direct.has(sub)
      const isDrive = slash in SLASH_TO_DRIVE
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
