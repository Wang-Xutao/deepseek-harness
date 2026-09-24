/**
 * §22.19 R5: persistent projection stores + the forwarded push event.
 *
 * The Remote now keeps ONE ProjectionStore per workspace for its lifetime
 * (`createProjectionStorePool`) and fans every appended event in that
 * workspace into `ctx.emit('baf-workflow/projection-appended', {cwd,
 * changeId})` — api-remotes forwards that event to the web client, where
 * the Tab refreshes in real time (session 7.jsonl R5: the pull-only Tab sat
 * on a dead「已放弃」view while the chat minted a new change).
 *
 * These tests drive the pool against a fake emit surface with REAL temp
 * workspaces. The decisive case is the cross-instance one: the appends come
 * from a store the pool never created (the drives construct their own —
 * `beginIntake`, `driveGo`, the orchestrator), so this spec also pins the
 * §22.19 projection-bus change from per-instance to process-global
 * per-workspace (packages/baf/baf-workflow/src/projection.ts).
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { createWorkflowService, ProjectionStore } from '@deepseek-ai/dsh-baf-workflow'
import { createProjectionStorePool } from '../src/index.ts'

const FIXTURE_BASELINE = join(process.cwd(), 'packages/baf/baf-core/tests/fixtures/baseline/baseline.yml')

/** One recorded forwarded event. */
interface Emitted {
  readonly event: string
  readonly payload: { readonly cwd: string; readonly changeId: string }
}

/** A minimal host ctx double that records every emit. */
function emitRecorder(): { ctx: Context; events: Emitted[] } {
  const events: Emitted[] = []
  const ctx = {
    emit: (event: string, payload: { cwd: string; changeId: string }) => {
      events.push({ event, payload })
    },
  } as unknown as Context
  return { ctx, events }
}

/** Workspace fixture with a baseline (the remote-source.host.spec recipe). */
async function setupWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-broadcast-'))
  await mkdir(join(root, '.baf'), { recursive: true })
  await mkdir(join(root, 'openspec', 'changes'), { recursive: true })
  const baseline = await loadBaselineFile(FIXTURE_BASELINE)
  await writeFile(join(root, '.baf', 'baseline.yml'), JSON.stringify(baseline), 'utf8')
  return root
}

/** Roots created by this spec (Windows rm flakiness tolerances included). */
const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
  }
})

describe('§22.19 R5: projection store pool + forwarded push event', () => {
  it('storeFor returns the SAME store instance for one cwd (single subscription)', async () => {
    const root = await setupWorkspace()
    roots.push(root)
    const { ctx } = emitRecorder()
    const pool = createProjectionStorePool(ctx)
    expect(pool.storeFor(root)).toBe(pool.storeFor(root))
    // A differently-spelled root (trailing separator) still pools once on
    // Windows — two subscriptions for one workspace would double-poke.
    expect(pool.storeFor(`${root}${root.endsWith('/') ? '' : '\\'}`)).toBe(pool.storeFor(root))
  })

  it('an append through ANOTHER store instance (the drives\' shape) forwards {cwd, changeId}', async () => {
    const root = await setupWorkspace()
    roots.push(root)
    const { ctx, events } = emitRecorder()
    const pool = createProjectionStorePool(ctx)
    pool.storeFor(root) // arm the subscriber

    // The drive shape: its own short-lived store, invisible to the pool.
    const driveStore = new ProjectionStore({ workspaceRoot: root })
    const service = createWorkflowService({ store: driveStore })
    const { intake } = await service.intake({
      description: 'feat: add export public API',
      workspace: { root },
    })

    // §13 R8 used to be per-instance — the pool would have heard nothing.
    // Since §22.19 the bus is process-global per workspace: every appended
    // event (intake mints several) pokes the pool's subscriber.
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[0]?.event).toBe('baf-workflow/projection-appended')
    expect(events[0]?.payload.cwd).toBe(root)
    expect(events[0]?.payload.changeId).toBe(intake.changeId)
    for (const emitted of events) {
      expect(emitted.payload.changeId).toBe(intake.changeId)
    }
  })

  it('another workspace\'s appends stay silent (cwd isolation)', async () => {
    const root = await setupWorkspace()
    const other = await setupWorkspace()
    roots.push(root, other)
    const { ctx, events } = emitRecorder()
    const pool = createProjectionStorePool(ctx)
    pool.storeFor(root)

    const otherStore = new ProjectionStore({ workspaceRoot: other })
    await createWorkflowService({ store: otherStore }).intake({
      description: 'fix: unrelated workspace change',
      workspace: { root: other },
    })

    expect(events).toHaveLength(0)
  })

  it('dispose drops the subscription and the cache', async () => {
    const root = await setupWorkspace()
    roots.push(root)
    const { ctx, events } = emitRecorder()
    const pool = createProjectionStorePool(ctx)
    const armed = pool.storeFor(root)
    pool.dispose()

    const driveStore = new ProjectionStore({ workspaceRoot: root })
    await createWorkflowService({ store: driveStore }).intake({
      description: 'feat: after dispose',
      workspace: { root },
    })
    expect(events).toHaveLength(0)

    // After dispose the pool re-arms fresh on the next storeFor call.
    expect(pool.storeFor(root)).not.toBe(armed)
  })
})
