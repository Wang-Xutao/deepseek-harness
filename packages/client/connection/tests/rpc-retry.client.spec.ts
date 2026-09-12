/** Retry semantics for the browser RPC carrier: socket-level failures re-issue, HTTP errors do not. */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebConnectionRpc } from '../src/client/rpc.ts'

interface Envelope {
  readonly type: 'server-response'
  readonly rpcId: string
  readonly result: { ok: true; value: unknown } | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } }
}

const CHANNEL = '/api'
const ENDPOINT = 'ping'

function envelope(rpcId: string, value: unknown): Envelope {
  return { type: 'server-response', rpcId, result: { ok: true, value } }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createWebConnectionRpc transport retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('retries through transient `TypeError: Failed to fetch` then succeeds', async () => {
    let calls = 0
    const fetcher = vi.fn(async (_url: URL, init?: RequestInit): Promise<Response> => {
      calls++
      if (calls < 3) throw new TypeError('Failed to fetch')
      const request = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(envelope(request.rpcId, { ok: calls })), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const rpc = createWebConnectionRpc(fetcher)
    const promise = rpc.call(CHANNEL, ENDPOINT, { hi: 1 })
    await vi.runAllTimersAsync()
    const result = await promise
    expect(calls).toBe(3)
    expect(result.ok).toBe(true)
  })

  it('gives up after the retry budget and rethrows the last transport failure', async () => {
    const fetcher = vi.fn(async (): Promise<Response> => {
      throw new TypeError('Failed to fetch')
    })
    const rpc = createWebConnectionRpc(fetcher)
    const promise = rpc.call(CHANNEL, ENDPOINT, { hi: 1 })
    promise.catch(() => { /* surface only as rejection */ })
    await vi.runAllTimersAsync()
    await expect(promise).rejects.toThrow(/failed to fetch/i)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('does not retry HTTP error responses', async () => {
    const fetcher = vi.fn(async (): Promise<Response> => new Response('nope', { status: 502 }))
    const rpc = createWebConnectionRpc(fetcher)
    const promise = rpc.call(CHANNEL, ENDPOINT, { hi: 1 })
    promise.catch(() => { /* surface only as rejection */ })
    await expect(promise).rejects.toThrow(/HTTP 502/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-transport TypeError', async () => {
    const fetcher = vi.fn(async (): Promise<Response> => {
      throw new TypeError('some other failure')
    })
    const rpc = createWebConnectionRpc(fetcher)
    const promise = rpc.call(CHANNEL, ENDPOINT, { hi: 1 })
    promise.catch(() => { /* surface only as rejection */ })
    await expect(promise).rejects.toThrow('some other failure')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('sends `credentials: include` on the POST so the session cookie reaches the host', async () => {
    const fetcher = vi.fn(async (_url: URL, init?: RequestInit): Promise<Response> => {
      const request = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(envelope(request.rpcId, { ok: true })), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const rpc = createWebConnectionRpc(fetcher)
    const promise = rpc.call(CHANNEL, ENDPOINT, { hi: 1 })
    await vi.runAllTimersAsync()
    await promise
    const init = fetcher.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.credentials).toBe('include')
    expect(init?.method).toBe('POST')
  })
})
