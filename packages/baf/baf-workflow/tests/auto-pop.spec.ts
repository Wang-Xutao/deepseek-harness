/**
 * §22.17 J auto-pop unit tests: the platform-guaranteed trigger behind
 * 「直接描述需求，分类卡自动弹出」.
 *
 * The row subscribes `session/event` on the host plane. These tests drive
 * the captured listener with synthetic `user/message` events against real
 * temp workspaces and a fake `userQuestions` service — no Cordis runtime.
 * Everything else (the classify dialog itself, the path options, the
 * bug-field draft) is pinned in `gate-dialog.spec.ts`.
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import { apply } from '../src/auto-pop.ts'
import { peekParkedRequirement, resetParkedRequirements } from '../src/requirement-park.ts'
import { ProjectionStore } from '../src/projection.ts'

const execFileAsync = promisify(execFile)

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** A `userQuestions` service double that records asks and replays canned answers. */
function serviceWith(replies: AskUserQuestionAnswer[]): {
  calls: AskUserQuestionRequest[]
  ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>
} {
  const calls: AskUserQuestionRequest[] = []
  let n = 0
  return {
    calls,
    async ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
      calls.push(request)
      const reply = replies[n]
      n += 1
      if (reply === undefined) throw Object.assign(new Error('no reply'), { code: 'NO_PROVIDER' })
      return reply
    },
  }
}

function selected(label: string): AskUserQuestionAnswer {
  return { answers: [{ id: 'x', selected: [label] }] }
}

/** Install the row against a fake host ctx and return the captured listener. */
function install(service: unknown): {
  emit: (session: unknown, event: unknown) => void
  ctx: Context
  logs: string[]
} {
  const listeners = new Map<string, (session: unknown, event: unknown) => void>()
  // Collect row log lines so a stuck fire-and-forget chain says WHERE it
  // stopped instead of surfacing as a bare poll timeout.
  const logs: string[] = []
  const agent = {
    session: { header: { cwd: 'replaced-per-test' } },
    ctx: { get: (name: string) => (name === 'userQuestions' ? service : undefined) },
  }
  const ctx = {
    on: (name: string, fn: (session: unknown, event: unknown) => void) => {
      listeners.set(name, fn)
    },
    agents: { get: () => agent },
    logger: {
      info: (line: string) => { logs.push(`info: ${line}`) },
      warn: (line: string) => { logs.push(`warn: ${line}`) },
    },
    get: () => undefined,
  } as unknown as Context
  apply(ctx)
  const emit = (session: unknown, event: unknown): void => {
    listeners.get('session/event')?.(session, event)
  }
  return { emit, ctx, logs }
}

/** Workspace fixture: baseline + git repo (the go.spec recipe). */
async function setup(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-auto-pop-'))
  await initWorkspace(root)
  return root
}

/** Write the baseline + git anchor into an existing (possibly bare) dir. */
async function initWorkspace(root: string): Promise<void> {
  await mkdir(join(root, '.baf'), { recursive: true })
  await writeFile(
    join(root, '.baf', 'baseline.yml'),
    await readFile(FIXTURE_BASELINE, 'utf8'),
    'utf8',
  )
  await execFileAsync('git', ['init', '-q'], { cwd: root })
  await execFileAsync('git', [
    '-c', 'user.email=baf@test', '-c', 'user.name=baf', '-c', 'commit.gpgsign=false',
    'commit', '-q', '--allow-empty', '-m', 'init',
  ], { cwd: root })
}

/** One synthetic user/message event. */
function userMessage(text: string, sourceKind = 'user'): unknown {
  return {
    type: 'user/message',
    data: { source: { kind: sourceKind }, content: [{ type: 'text', text }] },
  }
}

/** Let fire-and-forget async chains settle. */
const settle = async (): Promise<void> => new Promise(resolve => setTimeout(resolve, 150))

/**
 * Poll until the confirm chain (fire-and-forget under load) reaches the
 * confirmed intake — a fixed settle is flaky on a loaded parallel run.
 */
async function waitForConfirmed(root: string, logs: string[], timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const index = await new ProjectionStore({ workspaceRoot: root }).readIndex()
    const active = index.changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
    if (active[0] !== undefined
      && (await new ProjectionStore({ workspaceRoot: root }).readStatus(active[0].changeId))
        .intake?.confirmation === 'confirmed') {
      return
    }
    if (Date.now() > deadline) {
      throw new Error(`auto-pop confirm chain did not settle in time; row logs:\n${logs.join('\n')}`)
    }
    await settle()
  }
}

async function activeCount(root: string): Promise<number> {
  const index = await new ProjectionStore({ workspaceRoot: root }).readIndex()
  return index.changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned').length
}

describe('§22.17 J state-driven auto-pop', () => {
  // The happy-path test polls a fire-and-forget chain; on a loaded parallel
  // run the default 5s test timeout can fire long before the chain settles.
  // Budget generously — the fast path returns in well under a second.
  it('a genuine requirement in an idle workspace pops pre-question → classify → confirm', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      // Pre-question 开始, then the classify dialog's 完整流程 confirm.
      const service = serviceWith([selected('作为新需求开始'), selected('确认 · 完整流程')])
      const { emit, logs } = install(service)
      emit({ header: { id: 'sess-1', cwd: root } }, userMessage('给报表模块加一个导出公网 API'))
      // Pre-question must be asked immediately; the confirm chain follows.
      const deadline = Date.now() + 60_000
      while (service.calls.length < 2 && Date.now() < deadline) await settle()
      expect(service.calls).toHaveLength(2)
      expect(service.calls[0]?.questions[0]?.id).toBe('baf-auto-pop')
      expect(service.calls[1]?.questions[0]?.question).toBe('需求分类待确认')
      expect(service.calls[1]?.questions[0]?.detail).toContain('系统初步判断')
      expect(await activeCount(root)).toBe(1)
      await waitForConfirmed(root, logs)
    } finally {
      // Fire-and-forget chain may still hold a handle on a loaded parallel
      // run (Windows ENOTEMPTY); cleanup noise must not fail the assertions.
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('「只是聊天」 mints nothing', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      const service = serviceWith([selected('只是聊天，不开始')])
      const { emit } = install(service)
      emit({ header: { id: 'sess-1', cwd: root } }, userMessage('今天天气怎么样，聊两句'))
      // Poll for the pre-question like the happy-path test above — the fixed
      // 150ms settle loses the race on a loaded parallel full-suite run.
      const deadline = Date.now() + 60_000
      while (service.calls.length < 1 && Date.now() < deadline) await settle()
      expect(service.calls).toHaveLength(1)
      expect(await activeCount(root)).toBe(0)
    } finally {
      // Fire-and-forget chain may still hold a handle on a loaded parallel
      // run (Windows ENOTEMPTY); cleanup noise must not fail the assertions.
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('slash input, short greetings, and non-user sources never pop', async () => {
    const root = await setup()
    try {
      const service = serviceWith([])
      const { emit } = install(service)
      emit({ header: { id: 's1', cwd: root } }, userMessage('/baf-help 查看命令'))
      emit({ header: { id: 's2', cwd: root } }, userMessage('你好'))
      emit({ header: { id: 's3', cwd: root } }, userMessage('插件注入的一条很长很长很长的消息', 'plugin'))
      await settle()
      expect(service.calls).toHaveLength(0)
      expect(await activeCount(root)).toBe(0)
    } finally {
      // Fire-and-forget chain may still hold a handle on a loaded parallel
      // run (Windows ENOTEMPTY); cleanup noise must not fail the assertions.
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('uninitialized workspaces and busy workspaces never pop', async () => {
    resetParkedRequirements()
    const bare = await mkdtemp(join(tmpdir(), 'baf-auto-pop-'))
    const busy = await setup()
    try {
      const service = serviceWith([])
      const { emit } = install(service)
      emit({ header: { id: 's1', cwd: bare } }, userMessage('给报表模块加一个导出公网 API'))
      await settle()
      expect(service.calls).toHaveLength(0)
      // 【变更】2026-09-23 (demo2 issue #1): the pre-scaffold statement is
      // parked — the continuation surfaces it after the workspace initializes.
      expect(peekParkedRequirement('s1')).toBe('给报表模块加一个导出公网 API')
      // Busy: an unconfirmed intake is an active change.
      const store = new ProjectionStore({ workspaceRoot: busy })
      const { createWorkflowService } = await import('../src/workflow-service.ts')
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'feat: add export public API for reports',
        workspace: { root: busy },
        affectedScopeHint: 'public-api',
      })
      expect(intake.changeId).toBeTruthy()
      emit({ header: { id: 's2', cwd: busy } }, userMessage('再做一个全新的需求吧'))
      await settle()
      expect(service.calls).toHaveLength(0)
    } finally {
      await rm(bare, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
      await rm(busy, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a requirement stated before initialization does not burn the offer (pristine first-run)', async () => {
    // 2026-09-22 web walk 04:39: on a pristine workspace the FIRST message
    // landed before the scaffold, consumed the session's single offer in a
    // state where it could never pop, and the promised 分类卡 never appeared.
    // The offer must survive until the workspace is initialized.
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-auto-pop-'))
    try {
      const service = serviceWith([selected('只是聊天，不开始')])
      const { emit } = install(service)
      // Message #1 arrives pre-scaffold — nothing to offer yet, but the
      // statement is parked for the post-scaffold continuation.
      emit({ header: { id: 'sess-1', cwd: root } }, userMessage('给报表模块加一个导出公网 API'))
      await settle()
      expect(service.calls).toHaveLength(0)
      expect(peekParkedRequirement('sess-1')).toBe('给报表模块加一个导出公网 API')
      // The scaffold lands; the customer restates — now the pre-question pops
      // and the restated (initialized-workspace) message supersedes the park.
      await initWorkspace(root)
      emit({ header: { id: 'sess-1', cwd: root } }, userMessage('给报表模块加一个导出公网 API'))
      const deadline = Date.now() + 60_000
      while (service.calls.length < 1 && Date.now() < deadline) await settle()
      expect(service.calls).toHaveLength(1)
      expect(service.calls[0]?.questions[0]?.id).toBe('baf-auto-pop')
      expect(peekParkedRequirement('sess-1')).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('【变更】2026-09-29 (demo23 问题 2) every genuine message gets its own pre-question', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      // The old one-offer-per-session semantics left the session's second
      // statement unconfirmed — now each message pops its own pre-question.
      const service = serviceWith([selected('只是聊天，不开始'), selected('只是聊天，不开始')])
      const { emit } = install(service)
      emit({ header: { id: 'sess-1', cwd: root } }, userMessage('随便聊聊今天的工作安排'))
      const first = Date.now() + 60_000
      while (service.calls.length < 1 && Date.now() < first) await settle()
      emit({ header: { id: 'sess-1', cwd: root } }, userMessage('现在我要正式提一个新需求了'))
      const deadline = Date.now() + 60_000
      while (service.calls.length < 2 && Date.now() < deadline) await settle()
      expect(service.calls).toHaveLength(2)
      expect(service.calls[0]?.questions[0]?.id).toBe('baf-auto-pop')
      expect(service.calls[1]?.questions[0]?.id).toBe('baf-auto-pop')
      expect(await activeCount(root)).toBe(0)
    } finally {
      // Fire-and-forget chain may still hold a handle on a loaded parallel
      // run (Windows ENOTEMPTY); cleanup noise must not fail the assertions.
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('【变更】2026-09-29 (demo23 问题 2) a message typed while a dialog is pending does not stack another pre-question', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      // Latched ask: the first pre-question stays open until released, so the
      // second message arrives while the session still has a pending ask.
      let release: (answer: AskUserQuestionAnswer) => void = () => {}
      const gate = new Promise<AskUserQuestionAnswer>((resolve) => { release = resolve })
      const calls: AskUserQuestionRequest[] = []
      const service = {
        calls,
        ask: async (request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> => {
          calls.push(request)
          return await gate
        },
      }
      const { emit } = install(service)
      emit({ header: { id: 'sess-1', cwd: root } }, userMessage('第一句先弹个卡'))
      const popped = Date.now() + 60_000
      while (calls.length < 1 && Date.now() < popped) await settle()
      // Second message while the pre-question is still up — presumed context
      // for THAT dialog, not a fresh requirement to confirm.
      emit({ header: { id: 'sess-1', cwd: root } }, userMessage('趁卡还开着再补一句话'))
      await settle()
      await settle()
      expect(calls).toHaveLength(1)
      release(selected('只是聊天，不开始'))
      await settle()
      expect(await activeCount(root)).toBe(0)
    } finally {
      // Fire-and-forget chain may still hold a handle on a loaded parallel
      // run (Windows ENOTEMPTY); cleanup noise must not fail the assertions.
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })
})
