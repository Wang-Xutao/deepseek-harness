/**
 * 【变更】2026-10-25 (批次二十五 2): the「格式化输入」model path's route
 * resolution.
 *
 * The user reported the model path as「没有效果」. Two causes lived here: the
 * resolver read the agent's LIVE OPTIONS (the deployment's default model)
 * before the session's own selection, and it had no answer for a session
 * sitting on the BAF「自动」pseudo entry — a pseudo route is not a provider.
 *
 * These specs pin the order the agent loop itself uses (recorded selection →
 * live options → last request header), the per-step route resolver's part in
 * it, and the cold-log last resort.
 */

import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import { AUTO_MODEL, AUTO_PROVIDER } from '@deepseek-ai/dsh-baf-workflow'
import { DRAFT_FORMAT_SYSTEM, resolveDraftRoute } from '../src/index.ts'

/** One route a candidate may carry. */
interface Route {
  readonly provider: string
  readonly model: string
}

/** The pieces of a host context the resolver reads. */
interface Fixture {
  /** The live session (undefined when the session is not live). */
  readonly session?: Session
  /** The `modelSelection` projection's view. */
  readonly selection?: { readonly lastUsed: Route | null; readonly next: Route | null }
  /** The agent's live route options. */
  readonly options?: Route
  /** The session's last request header. */
  readonly header?: Route
  /** The cold log's last header epoch. */
  readonly logged?: Route
  /** The per-step route resolver's answer for the auto pseudo entry. */
  readonly resolvedAuto?: Route
}

/** A ctx double serving one fixture. */
function ctxOf(fixture: Fixture): Context {
  const session = fixture.session
  const ctx = {
    sessions: {
      get: () => session,
    },
    sessionProjections: {
      snapshot: () => ({
        asOfSeq: -1,
        values: fixture.selection === undefined ? {} : { modelSelection: fixture.selection },
      }),
    },
    agents: {
      get: () => fixture.options === undefined ? undefined : { options: fixture.options },
    },
    sessionQuery: {
      observeSession: async () => ({
        events: fixture.logged === undefined
          ? []
          : [{ type: 'request/header', data: { header: { config: fixture.logged } } }],
        [Symbol.dispose]: () => {},
      }),
    },
    get: (name: string) => {
      if (name !== 'stepRouteResolver' || fixture.resolvedAuto === undefined) return undefined
      return {
        resolveStepRoute: (_session: Session, route: Route) =>
          route.provider === AUTO_PROVIDER && route.model === AUTO_MODEL
            ? fixture.resolvedAuto
            : route,
      }
    },
  } as unknown as Context
  return ctx
}

/** A live session double carrying one request header. */
function sessionWith(header?: Route): Session {
  return {
    header: { id: 'sess-1' },
    requestHeader: () => (header === undefined ? undefined : { config: header }),
  } as unknown as Session
}

const SESSION_ID = 'sess-1' as SessionId

describe('resolveDraftRoute (批次二十五 2)', () => {
  it('prefers the session\'s recorded selection over the live route options', async () => {
    const ctx = ctxOf({
      session: sessionWith(),
      selection: { lastUsed: { provider: 'p-old', model: 'm-old' }, next: { provider: 'p-picked', model: 'm-picked' } },
      options: { provider: 'p-default', model: 'm-default' },
    })
    expect(await resolveDraftRoute(ctx, SESSION_ID)).toEqual({ provider: 'p-picked', model: 'm-picked' })
  })

  it('falls back to the last used selection when no new one is pending', async () => {
    const ctx = ctxOf({
      session: sessionWith(),
      selection: { lastUsed: { provider: 'p-used', model: 'm-used' }, next: null },
      options: { provider: 'p-default', model: 'm-default' },
    })
    expect(await resolveDraftRoute(ctx, SESSION_ID)).toEqual({ provider: 'p-used', model: 'm-used' })
  })

  it('falls back to the live route options when no selection was recorded', async () => {
    const ctx = ctxOf({
      session: sessionWith(),
      selection: { lastUsed: null, next: null },
      options: { provider: 'p-default', model: 'm-default' },
    })
    expect(await resolveDraftRoute(ctx, SESSION_ID)).toEqual({ provider: 'p-default', model: 'm-default' })
  })

  it('falls back to the last request header when neither a selection nor options exist', async () => {
    const ctx = ctxOf({
      session: sessionWith({ provider: 'p-header', model: 'm-header' }),
    })
    expect(await resolveDraftRoute(ctx, SESSION_ID)).toEqual({ provider: 'p-header', model: 'm-header' })
  })

  it('maps the auto pseudo entry through the per-step route resolver', async () => {
    const ctx = ctxOf({
      session: sessionWith(),
      selection: { lastUsed: null, next: { provider: AUTO_PROVIDER, model: AUTO_MODEL } },
      options: { provider: AUTO_PROVIDER, model: AUTO_MODEL },
      resolvedAuto: { provider: 'p-tier', model: 'm-tier' },
    })
    expect(await resolveDraftRoute(ctx, SESSION_ID)).toEqual({ provider: 'p-tier', model: 'm-tier' })
  })

  it('never answers with the auto pseudo entry itself', async () => {
    const ctx = ctxOf({
      session: sessionWith(),
      selection: { lastUsed: null, next: { provider: AUTO_PROVIDER, model: AUTO_MODEL } },
      options: { provider: AUTO_PROVIDER, model: AUTO_MODEL },
      header: { provider: AUTO_PROVIDER, model: AUTO_MODEL },
      logged: { provider: AUTO_PROVIDER, model: AUTO_MODEL },
    })
    expect(await resolveDraftRoute(ctx, SESSION_ID)).toBeUndefined()
  })

  it('falls back to the cold log when the session is gone', async () => {
    const ctx = ctxOf({ logged: { provider: 'p-log', model: 'm-log' } })
    expect(await resolveDraftRoute(ctx, SESSION_ID)).toEqual({ provider: 'p-log', model: 'm-log' })
  })

  it('answers nothing when the session carries no route at all', async () => {
    const ctx = ctxOf({})
    expect(await resolveDraftRoute(ctx, SESSION_ID)).toBeUndefined()
  })
})

describe('the draft optimization prompt (批次二十五 2)', () => {
  it('asks for content optimization, not only for structure', () => {
    expect(DRAFT_FORMAT_SYSTEM).toContain('内容优化')
    expect(DRAFT_FORMAT_SYSTEM).toContain('结构化')
  })

  it('keeps the hard ban on inventing facts', () => {
    expect(DRAFT_FORMAT_SYSTEM).toContain('绝不添加草稿中不存在的事实')
  })

  it('no longer forbids the rewording the optimizer must do', () => {
    expect(DRAFT_FORMAT_SYSTEM).not.toContain('只调整结构与断句')
    expect(DRAFT_FORMAT_SYSTEM).not.toContain('不改写、不润色')
  })
})
