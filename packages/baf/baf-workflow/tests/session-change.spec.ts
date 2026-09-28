import { describe, expect, it } from 'vitest'
import {
  bindSessionChange,
  deriveSessionChangeFromEvents,
  resetSessionChangeCache,
  sessionChangeFor,
  type SessionChangeEventLike,
} from '../src/session-change.ts'

describe('session→change binding (用户问题 7)', () => {
  it('binds and reads back per (cwd, sessionId)', () => {
    try {
      bindSessionChange('D:/ws', 's1', 'change-a')
      bindSessionChange('D:/ws', 's2', 'change-b')
      bindSessionChange('D:/other', 's1', 'change-c')
      expect(sessionChangeFor('D:/ws', 's1')).toBe('change-a')
      expect(sessionChangeFor('D:/ws', 's2')).toBe('change-b')
      expect(sessionChangeFor('D:/other', 's1')).toBe('change-c')
      expect(sessionChangeFor('D:/ws', 's3')).toBeUndefined()
    } finally {
      resetSessionChangeCache()
    }
  })
})

describe('deriveSessionChangeFromEvents (cold-log recovery)', () => {
  it('reads the changeId off a go-dispatch work order', () => {
    const events: SessionChangeEventLike[] = [
      { type: 'turn/start', data: {} },
      {
        type: 'user/message',
        data: {
          role: 'user',
          content: [{ type: 'text', text: '【BAF 工单 · /baf-go 派单】…' }],
          source: { kind: 'baf-workflow', form: 'go-dispatch', changeId: 'change-20260928-x', node: 'plan', missing: [] },
        },
      },
    ]
    expect(deriveSessionChangeFromEvents(events)).toBe('change-20260928-x')
  })

  it('reads the changeId off baf/route-resolved audit events', () => {
    const events: SessionChangeEventLike[] = [
      { type: 'baf/route-resolved', data: { provider: 'p', model: 'm', source: 'policy', phase: 'implement', at: 't', sessionId: 's1', changeId: 'change-r' } },
      { type: 'baf/route-resolved', data: { provider: 'p', model: 'm', source: 'policy', phase: 'implement', at: 't', sessionId: 's1' } },
    ]
    expect(deriveSessionChangeFromEvents(events)).toBe('change-r')
  })

  it('parses baf_gate_ask tool-call arguments for the changeId', () => {
    const events: SessionChangeEventLike[] = [
      {
        type: 'assistant/message',
        data: {
          role: 'assistant',
          content: [
            { type: 'text', text: '汇报' },
            { type: 'tool-call', id: 'c1', name: 'baf_gate_ask', arguments: '{"gateId":"abandon","changeId":"change-g"}' },
          ],
        },
      },
    ]
    expect(deriveSessionChangeFromEvents(events)).toBe('change-g')
  })

  it('tolerates malformed gate arguments and foreign tool calls', () => {
    const events: SessionChangeEventLike[] = [
      {
        type: 'assistant/message',
        data: {
          content: [
            { type: 'tool-call', id: 'c1', name: 'baf_gate_ask', arguments: '{not json' },
            { type: 'tool-call', id: 'c2', name: 'bash', arguments: '{"changeId":"not-a-signal"}' },
          ],
        },
      },
      { type: 'user/message', data: { role: 'user', content: [], source: { kind: 'user' } } },
    ]
    expect(deriveSessionChangeFromEvents(events)).toBeUndefined()
  })

  it('the LAST mention in log order wins (a later drive rebinds)', () => {
    const events: SessionChangeEventLike[] = [
      { type: 'baf/route-resolved', data: { sessionId: 's1', changeId: 'change-early' } },
      {
        type: 'user/message',
        data: { source: { kind: 'baf-workflow', form: 'go-dispatch', changeId: 'change-late', node: 'implement', missing: [] } },
      },
    ]
    expect(deriveSessionChangeFromEvents(events)).toBe('change-late')
  })

  it('a log with no driving signals stays undefined (chat sessions keep the fallback)', () => {
    const events: SessionChangeEventLike[] = [
      { type: 'turn/start', data: {} },
      { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: '你好' }], source: { kind: 'user' } } },
      { type: 'assistant/message', data: { content: [{ type: 'text', text: '你好！' }], usage: {} } },
    ]
    expect(deriveSessionChangeFromEvents(events)).toBeUndefined()
  })
})
