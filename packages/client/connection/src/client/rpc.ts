/** Browser caller for generic Connection unary RPC channels. */

import {
  RpcId,
  type ClientRequest,
  type RpcId as RpcIdType,
} from '../rpc.ts'
import type { ClientConnectionRpc, ConnectionRpcResult } from '../rpc.ts'
import { randomUuid } from './random-uuid.ts'

const INTERNAL_BASE = 'http://dsh.internal'
const CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/

/** Transport-level retry budget for socket drops; HTTP errors fall through untouched. */
const TRANSPORT_RETRY_ATTEMPTS = 3
/** Initial backoff between transport retries; each attempt multiplies by its index. */
const TRANSPORT_RETRY_BACKOFF_MS = 120

/** `fetch` only throws `TypeError: Failed to fetch` for socket-level failures. */
function isTransportFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false
  // Chromium prefixes vary across versions; the message is the source of truth.
  return /failed to fetch/i.test(error.message)
}

/** Sleep that honors an optional AbortSignal, resolving early on abort. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) return Promise.reject(new DOMException('aborted', 'AbortError'))
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => { resolve() }, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
  })
}

/** Transport this caller posts through; same signature as the global `fetch`. */
export type RpcFetch = (input: URL, init: RequestInit) => Promise<Response>

/** Worker-local opener for decoded Gateway Remote streams. */
export type RpcStreamOpen = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
) => AsyncIterable<unknown>

/**
 * Create the browser-backed generic RPC caller.
 * @param doFetch - transport override; defaults to the page's global fetch.
 * @param openStream - optional worker-local Gateway stream carrier.
 * @returns caller that owns request correlation and response-envelope validation.
 */
export function createWebConnectionRpc(doFetch?: RpcFetch, openStream?: RpcStreamOpen): ClientConnectionRpc {
  const send: RpcFetch = doFetch ?? ((input, init) => globalThis.fetch(input, init))
  return {
    async call(channel, endpoint, payload, signal) {
      assertTarget(channel, endpoint)
      const rpcId = RpcId(randomUuid())
      const message: ClientRequest = {
        type: 'client-request',
        rpcId,
        method: endpoint,
        payload,
      }
      // A `TypeError: Failed to fetch` from the global fetch means the socket
      // was torn down before a response arrived (host child process reload,
      // window navigation, transient disconnect). The SPA re-tries that
      // exact same call; without this loop every transient disconnect during
      // a long read (e.g. native directory picker, agent-preset list) lands
      // as a permanent error in the UI.
      let lastError: unknown
      for (let attempt = 0; attempt < TRANSPORT_RETRY_ATTEMPTS; attempt++) {
        try {
          const response = await send(
            new URL(`${channel}/${endpoint}`, resolveBase()),
            {
              method: 'POST',
              // Send the Host-issued browser-session cookie; without this Chromium
              // omits the cookie on a same-origin POST and the Host Connection
              // answers every RPC with 401, surfacing as `Failed to fetch` in the
              // renderer because the SPA then re-fetches during a transient 401.
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(message),
              ...signal === undefined ? {} : { signal },
            },
          )
          if (!response.ok) {
            throw new Error(`transport failure for ${channel}/${endpoint}: HTTP ${response.status}`)
          }
          const full = parseConnectionResponse(await response.json())
          if (full.rpcId !== rpcId) {
            throw new Error(`rpcId mismatch for ${endpoint}: sent ${rpcId}, got ${full.rpcId}`)
          }
          return full.result
        } catch (error) {
          if (!isTransportFailure(error) || signal?.aborted === true) throw error
          lastError = error
          if (attempt + 1 < TRANSPORT_RETRY_ATTEMPTS) {
            await delay(TRANSPORT_RETRY_BACKOFF_MS * (attempt + 1), signal)
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error(`transport failure for ${channel}/${endpoint}`)
    },
    ...openStream === undefined ? {} : {
      open(channel, endpoint, payload, signal) {
        assertTarget(channel, endpoint)
        if (channel !== '/api') {
          throw new Error(`connection: worker-local streams require the /api channel, got ${JSON.stringify(channel)}`)
        }
        return openStream(endpoint, payload, signal)
      },
    },
  }
}

function parseConnectionResponse(value: unknown): {
  readonly rpcId: RpcIdType
  readonly result: ConnectionRpcResult<unknown>
} {
  if (!isRecord(value) || value.type !== 'server-response' || typeof value.rpcId !== 'string') {
    throw new TypeError('connection: invalid server-response envelope')
  }
  const result = value.result
  if (!isRecord(result)) throw new TypeError('connection: invalid server-response result')
  if (result.ok === true) {
    return {
      rpcId: RpcId(value.rpcId),
      result: { ok: true, value: result.value },
    }
  }
  if (result.ok !== false || !isRecord(result.error)) {
    throw new TypeError('connection: invalid server-response result')
  }
  const error = result.error
  if (typeof error.code !== 'string' || typeof error.message !== 'string' || !isRecord(error.details)) {
    throw new TypeError('connection: invalid server-response failure')
  }
  return {
    rpcId: RpcId(value.rpcId),
    result: {
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    },
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveBase(): string {
  const location = (globalThis as { location?: { origin?: string } }).location
  return location?.origin !== undefined && location.origin !== 'null' ? location.origin : INTERNAL_BASE
}

function assertTarget(channel: string, endpoint: string): void {
  const segments = endpoint.split('/')
  if (!CHANNEL_PATTERN.test(channel)
    || segments.some(segment =>
      segment === '' || segment === '.' || segment === '..' || !ENDPOINT_SEGMENT_PATTERN.test(segment))) {
    throw new Error(`connection: invalid RPC target ${JSON.stringify(`${channel}/${endpoint}`)}`)
  }
}
