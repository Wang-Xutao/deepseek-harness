/**
 * §22.19 ask-queue unit tests: the single-flight popup chain.
 *
 * Session 7.jsonl R2 — the client shows one interaction per session and a
 * later equal-precedence ask replaces the visible one, so two uncoordinated
 * BAF asks meant the second dialog covered the first before the customer
 * clicked. These tests pin the queue's three guards: strict per-session
 * serialization, key dedupe (the orchestrator/gate-ask/auto-pop convergence),
 * head-of-queue moot retirement, and abort chaining — plus the
 * `askGateDialogQueued` outcome mapping.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { enqueueAsk, resetAskQueue, type AskOutcome } from '../src/ask-queue.ts'
import { askGateDialogQueued } from '../src/gate-dialog.ts'

/** Deferred manual promise. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  resetAskQueue()
})

describe('§22.19 enqueueAsk — per-session single flight', () => {
  it('serializes two asks on one session (the second never overlaps the first)', async () => {
    const first = deferred<string>()
    const order: string[] = []
    const a = enqueueAsk({
      sessionId: 's1',
      key: 'a',
      run: async () => {
        order.push('a-start')
        return first.promise
      },
    })
    const b = enqueueAsk({
      sessionId: 's1',
      key: 'b',
      run: async () => {
        order.push('b-start')
        return 'b'
      },
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['a-start'])
    first.resolve('a')
    expect(await a).toEqual({ kind: 'answered', value: 'a' } satisfies AskOutcome<string>)
    expect(await b).toEqual({ kind: 'answered', value: 'b' } satisfies AskOutcome<string>)
    expect(order).toEqual(['a-start', 'b-start'])
  })

  it('drops a concurrent same-key ask as duplicate and runs the pop once', async () => {
    const held = deferred<string>()
    const calls: number[] = []
    const first = enqueueAsk({
      sessionId: 's1',
      key: 'gate:x:1',
      run: async () => {
        calls.push(1)
        return held.promise
      },
    })
    const second = enqueueAsk({
      sessionId: 's1',
      key: 'gate:x:1',
      run: async () => {
        calls.push(2)
        return 'never'
      },
    })
    expect(await second).toEqual({ kind: 'dropped', reason: 'duplicate' })
    held.resolve('answered')
    expect(await first).toEqual({ kind: 'answered', value: 'answered' })
    expect(calls).toEqual([1])
  })

  it('frees the key after the entry settles — a later same-key ask runs', async () => {
    const first = await enqueueAsk({ sessionId: 's1', key: 'k', run: async () => 'one' })
    expect(first).toEqual({ kind: 'answered', value: 'one' })
    const second = await enqueueAsk({ sessionId: 's1', key: 'k', run: async () => 'two' })
    expect(second).toEqual({ kind: 'answered', value: 'two' })
  })

  it('retires a moot entry at queue head without popping', async () => {
    const first = deferred<string>()
    const a = enqueueAsk({ sessionId: 's1', key: 'a', run: () => first.promise })
    let moot = false
    const b = enqueueAsk({
      sessionId: 's1',
      key: 'b',
      isMoot: () => moot,
      run: async () => 'should-not-run',
    })
    moot = true
    first.resolve('a')
    expect(await a).toEqual({ kind: 'answered', value: 'a' })
    expect(await b).toEqual({ kind: 'dropped', reason: 'moot' })
  })

  it('drops an entry whose signal aborted while it waited', async () => {
    const first = deferred<string>()
    const a = enqueueAsk({ sessionId: 's1', key: 'a', run: () => first.promise })
    const controller = new AbortController()
    const b = enqueueAsk({
      sessionId: 's1',
      key: 'b',
      signal: controller.signal,
      run: async () => 'should-not-run',
    })
    controller.abort()
    first.resolve('a')
    expect(await a).toEqual({ kind: 'answered', value: 'a' })
    expect(await b).toEqual({ kind: 'dropped', reason: 'aborted' })
  })

  it('bridges an in-flight abort to the run controller', async () => {
    const external = new AbortController()
    let observed: AbortSignal | undefined
    const done = deferred<string>()
    const entry = enqueueAsk({
      sessionId: 's1',
      key: 'a',
      signal: external.signal,
      run: (controller) => {
        observed = controller.signal
        return done.promise
      },
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(observed?.aborted).toBe(false)
    external.abort()
    expect(observed?.aborted).toBe(true)
    done.resolve('ok')
    expect(await entry).toEqual({ kind: 'answered', value: 'ok' })
  })

  it('never blocks one session behind another (per-session chains)', async () => {
    const first = deferred<string>()
    const a = enqueueAsk({ sessionId: 's1', key: 'a', run: () => first.promise })
    const b = enqueueAsk({ sessionId: 's2', key: 'a', run: async () => 'cross-session' })
    expect(await b).toEqual({ kind: 'answered', value: 'cross-session' })
    first.resolve('a')
    expect(await a).toEqual({ kind: 'answered', value: 'a' })
  })
})

describe('§22.19 askGateDialogQueued — outcome mapping', () => {
  /** Minimal userQuestions double that answers after one tick. */
  const service = {
    async ask() {
      return { answers: [{ id: 'design-confirm', selected: ['确认设计，进入计划'] }] }
    },
  }

  it('flows an answered dialog through and maps drops to paused', async () => {
    const agent = { session: { header: { id: 'sess-1' } } }
    const first = await askGateDialogQueued(service, agent as never, { gateId: 'design-confirm' })
    expect(first.kind).toBe('answered')

    // Occupying entry that never settles, same key → duplicate → paused.
    const held = deferred<string>()
    const occupying = enqueueAsk({
      sessionId: 'sess-1',
      key: 'gate:design-confirm:',
      run: () => held.promise,
    })
    const second = await askGateDialogQueued(service, agent as never, { gateId: 'design-confirm' })
    expect(second).toEqual({ kind: 'paused', reason: 'dismissed' })
    held.resolve('x')
    expect(await occupying).toEqual({ kind: 'answered', value: 'x' })
  })
})
