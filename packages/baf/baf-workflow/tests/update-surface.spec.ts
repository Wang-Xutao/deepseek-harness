/**
 * §11.8/9.6 child-side update surface — the in-child half of the desktop
 * update loop (`update-surface.ts`), pinned to the SIMPLIFIED two-verb face
 * (2026-10-03): `/baf-update` = 当前状态 + 最新检查 +（有更新时）弹窗选择
 * 升级/取消，`/baf-update-rollback` = 热回滚。
 *
 * Pinned behaviors:
 *   - outside the desktop host (no `BAF_DSH_UPDATE_STATE`) every verb is an
 *     explanation card, never a thrown error;
 *   - `runUpdate` renders 当前状态 + fresh check, pops the ask channel when
 *     something is available, applies only on 立即升级 / autoApply;
 *   - cancel / no-ask leaves a report-only card (no apply request written);
 *   - an unanswered request times out with `ok:false`;
 *   - `rollback` refuses non-hot scopes locally before writing any file.
 *
 * The fake "desktop main" is an interval that watches `update-request.json`
 * and answers in `update-response.json` — the same contract `main.ts`
 * `watchUpdateRequests()` implements.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readInstallerHandoff,
  readUpdateState,
  requestDesktopUpdate,
  runUpdate,
  runUpdateRollback,
  type UpdateAsk,
} from '../src/update-surface.ts'

const ENV_KEY = 'BAF_DSH_UPDATE_STATE'
const savedEnv = process.env[ENV_KEY]

// Static-key deletes: `process.env[ENV_KEY]` trips no-dynamic-delete, and the
// repo's existing env-restoration specs use the literal member form.
function setEnvState(path: string | undefined): void {
  if (path === undefined) delete process.env.BAF_DSH_UPDATE_STATE
  else process.env.BAF_DSH_UPDATE_STATE = path
}

afterEach(() => {
  setEnvState(savedEnv)
})

function tempStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'baf-update-surface-'))
  const statePath = join(dir, 'update-state.json')
  writeFileSync(statePath, '{}\n', 'utf8')
  setEnvState(statePath)
  return dir
}

type FakeRequest = { id: string; command: string; scope?: string }

/**
 * Minimal fake desktop main: watch the request file, answer with the given
 * response body (id filled from the request). Records every request seen so
 * tests can assert apply was never dispatched. Returns a stop() function.
 */
function fakeDesktop(
  dir: string,
  makeResponse: (request: FakeRequest) => Record<string, unknown>,
): { stop: () => void; seen: FakeRequest[] } {
  const requestPath = join(dir, 'update-request.json')
  const responsePath = join(dir, 'update-response.json')
  const seen: FakeRequest[] = []
  const timer = setInterval(() => {
    let body: string
    try {
      body = readFileSync(requestPath, 'utf8')
    } catch {
      return
    }
    try {
      const request = JSON.parse(body) as FakeRequest
      seen.push(request)
      // The real main consumes the request file (rmSync) — mirror that or
      // this 100ms interval would answer the same request forever.
      rmSync(requestPath, { force: true })
      writeFileSync(responsePath, `${JSON.stringify({ ...makeResponse(request), id: request.id })}\n`, 'utf8')
    } catch {
      // Unparseable request — the real main also just refuses it.
    }
  }, 100)
  return { stop: () => clearInterval(timer), seen }
}

/** check→available; apply→ok with one applied scope. */
function availableThenApplied(request: FakeRequest): Record<string, unknown> {
  if (request.command === 'check') {
    // The real main's check rewrites the state file too — mirror that so the
    // card's 当前状态 section reflects the fresh verdict.
    const statePath = process.env.BAF_DSH_UPDATE_STATE as string
    writeFileSync(statePath, JSON.stringify({
      lastCheckAt: '2026-10-03T08:30:00.000Z',
      lastCheckStatus: 'available',
      tag: 'baf-dsh-stable',
      releaseEpoch: 43,
      keyId: 'baf-test-2026q4',
      summaryZh: '插件 0.0.23 → 0.0.24',
      plans: [
        { scope: 'plugin', action: 'apply', currentVersion: '0.0.23', targetVersion: '0.0.24', required: false, restartRequired: true, reason: 'channel newer' },
        { scope: 'harness', action: 'none', currentVersion: '0.0.23', targetVersion: '0.0.23', required: false, restartRequired: false, reason: '已是最新' },
      ],
    }), 'utf8')
    return {
      command: 'check',
      ok: true,
      check: { status: 'available', checkedAt: '2026-10-03T08:30:00.000Z', summaryZh: '插件 0.0.23 → 0.0.24' },
    }
  }
  return {
    command: 'apply',
    ok: true,
    apply: {
      ok: true,
      launchedInstaller: false,
      restartedChild: true,
      scopes: [{ scope: 'plugin', action: 'apply', ok: true }],
      versions: { bafDsh: '0.0.23', dsh: '0.1.10', bafPlugin: '0.0.24' },
    },
  }
}

const askReturning: (choice: 'upgrade' | 'cancel') => UpdateAsk = choice => async () => choice

describe('update-surface（9.6 简化两指令面）', () => {
  it('outside the desktop host every verb answers an explanation card', async () => {
    setEnvState(undefined)
    expect(readUpdateState()).toBeUndefined()
    expect(readInstallerHandoff()).toBeUndefined()

    const update = await runUpdate(askReturning('upgrade'))
    expect(update.ok).toBe(false)
    expect(update.text).toContain('桌面宿主')

    const rollback = await runUpdateRollback(undefined)
    expect(rollback.ok).toBe(false)
    expect(rollback.text).toContain('桌面宿主')
  })

  it('up-to-date: reports 已是最新 without popping or applying', async () => {
    const dir = tempStateDir()
    const desktop = fakeDesktop(dir, request => ({
      command: request.command,
      ok: true,
      ...(request.command === 'check'
        ? { check: { status: 'up-to-date', checkedAt: '2026-10-03T08:00:00.000Z' } }
        : {}),
    }))
    try {
      let popped = 0
      const r = await runUpdate(async () => { popped += 1; return 'cancel' })
      expect(r.ok).toBe(true)
      expect(r.text).toContain('已是最新')
      expect(popped).toBe(0)
      expect(desktop.seen.every(req => req.command === 'check')).toBe(true)
    } finally {
      desktop.stop()
    }
  })

  it('available + 立即升级: pops once, applies, renders per-scope outcome', async () => {
    const dir = tempStateDir()
    const desktop = fakeDesktop(dir, availableThenApplied)
    try {
      let popped = 0
      const r = await runUpdate(async () => { popped += 1; return 'upgrade' })
      expect(popped).toBe(1)
      expect(r.ok).toBe(true)
      expect(r.text).toContain('检查并升级桌面 · 升级完成')
      expect(r.text).toContain('插件（应用更新）：成功')
      expect(r.text).toContain('插件：0.0.24')
      const commands = desktop.seen.map(req => req.command)
      expect(commands).toEqual(['check', 'apply'])
    } finally {
      desktop.stop()
    }
  })

  it('available + 暂不升级: report-only card, apply never dispatched', async () => {
    const dir = tempStateDir()
    const desktop = fakeDesktop(dir, availableThenApplied)
    try {
      const r = await runUpdate(askReturning('cancel'))
      expect(r.ok).toBe(true)
      expect(r.text).toContain('有可用更新（未升级）')
      expect(r.text).toContain('暂不升级')
      expect(r.text).toContain('0.0.23 → 0.0.24')
      expect(desktop.seen.map(req => req.command)).toEqual(['check'])
    } finally {
      desktop.stop()
    }
  })

  it('available + no ask channel (CLI): reports the upgrade hint', async () => {
    const dir = tempStateDir()
    const desktop = fakeDesktop(dir, availableThenApplied)
    try {
      const r = await runUpdate(undefined)
      expect(r.ok).toBe(true)
      expect(r.text).toContain('有可用更新（未升级）')
      expect(r.text).toContain('baf update --apply')
      expect(desktop.seen.map(req => req.command)).toEqual(['check'])
    } finally {
      desktop.stop()
    }
  })

  it('autoApply skips the dialog and dispatches apply directly', async () => {
    const dir = tempStateDir()
    const desktop = fakeDesktop(dir, availableThenApplied)
    try {
      let popped = 0
      const r = await runUpdate(async () => { popped += 1; return 'cancel' }, { autoApply: true })
      expect(popped).toBe(0)
      expect(r.ok).toBe(true)
      expect(r.text).toContain('升级完成')
      expect(desktop.seen.map(req => req.command)).toEqual(['check', 'apply'])
    } finally {
      desktop.stop()
    }
  })

  it('failed check maps to an error card (never throws)', async () => {
    const dir = tempStateDir()
    const desktop = fakeDesktop(dir, request => ({
      command: request.command,
      ok: false,
      error: '网络不可用',
    }))
    try {
      const r = await runUpdate(askReturning('upgrade'))
      expect(r.ok).toBe(false)
      expect(r.text).toContain('检查失败')
      expect(r.text).toContain('网络不可用')
      expect(desktop.seen.map(req => req.command)).toEqual(['check'])
    } finally {
      desktop.stop()
    }
  })

  it('an unanswered request times out with ok:false', async () => {
    tempStateDir()
    const r = await requestDesktopUpdate('check', undefined, 1_100)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('未响应')
  }, 15_000)

  it('rollback refuses non-hot scopes locally without writing a request', async () => {
    const dir = tempStateDir()
    const r = await runUpdateRollback('baseline')
    expect(r.ok).toBe(false)
    expect(r.text).toContain('不支持该 scope')
    expect(() => readFileSync(join(dir, 'update-request.json'), 'utf8')).toThrow()
  })

  it('rollback passes the scope through to the desktop', async () => {
    const dir = tempStateDir()
    let seenScope: string | undefined
    const desktop = fakeDesktop(dir, (request) => {
      seenScope = request.scope
      return {
        command: request.command,
        ok: true,
        rollback: { scope: request.scope ?? 'plugin', ok: true, fromVersion: '0.0.24', toVersion: '0.0.23' },
      }
    })
    try {
      const r = await runUpdateRollback('runtime')
      expect(r.ok).toBe(true)
      expect(r.text).toContain('回滚更新 · 完成')
      expect(r.text).toContain('回到版本：0.0.23')
      expect(seenScope).toBe('runtime')
    } finally {
      desktop.stop()
    }
  })

  it('status section renders the installer handoff when one is pending', async () => {
    const dir = tempStateDir()
    mkdirSync(join(dir, 'updates'), { recursive: true })
    writeFileSync(join(dir, 'updates', 'installer-handoff.json'), JSON.stringify({
      targetVersion: '0.0.24',
      tag: 'baf-dsh-v0.0.24',
      pendingPlugin: '0.0.24',
    }), 'utf8')
    const desktop = fakeDesktop(dir, request => ({
      command: request.command,
      ok: true,
      ...(request.command === 'check'
        ? { check: { status: 'up-to-date', checkedAt: '2026-10-03T09:00:00.000Z' } }
        : {}),
    }))
    try {
      const r = await runUpdate(undefined)
      expect(r.ok).toBe(true)
      expect(r.text).toContain('安装器交接')
      expect(r.text).toContain('待应用插件：0.0.24')
    } finally {
      desktop.stop()
    }
  })
})
