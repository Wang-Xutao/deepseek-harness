/**
 * Pure pipeline fold: turn summaries and REQUEST→RESPONSE→TOOL rows from a
 * Trajectory-shaped snapshot.
 */
import { describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/trajectory-contract.ts'
import {
  deriveTraceGraphPipeline, deriveTraceGraphTurns, formatTraceGraphDuration,
  formatTraceGraphTokens, traceGraphTurnTotalTokens,
} from '../src/client/pipeline.ts'

const EMPTY_TIMINGS: ConversationSnapshot['turnTimings'] = new Map()

function snapshot(partial: Partial<TrajectorySnapshot> = {}): TrajectorySnapshot {
  return {
    eventNodes: [],
    eventLocations: new Map(),
    requests: [],
    callSchemas: new Map(),
    partial: null,
    runningCalls: [],
    ...partial,
  }
}

describe('trace-graph pipeline fold', () => {
  it('builds turn summaries from assistant steps and marks failures', () => {
    const trajectory = snapshot({
      eventNodes: [
        {
          kind: 'assistant',
          seq: 10,
          time: 1_000,
          turn: 1,
          step: 1,
          blocks: [
            { kind: 'text', text: 'hello' },
            { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{"cmd":"ls"}' },
          ],
          requestConfig: { provider: 'deepseek', model: 'flash' },
          timing: { stepStartTime: 900, firstTokenTime: 950, completedTime: 1_000 },
        },
        {
          kind: 'tool-result',
          seq: 11,
          time: 1_200,
          callId: 'c1',
          call: { name: 'bash', argsRaw: '{"cmd":"ls"}' },
          callTime: 1_050,
          content: [{ type: 'text', text: 'ok' }],
          isError: true,
          callView: null,
          resultView: null,
          subCalls: [],
        },
        {
          kind: 'turn-error',
          seq: 12,
          time: 1_300,
          turn: 1,
          step: 1,
          message: 'boom',
        },
      ],
    })
    const turns = deriveTraceGraphTurns(trajectory, EMPTY_TIMINGS, new Map([[1, 12]]), false)
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({
      turn: 1,
      modelCalls: 1,
      toolCalls: 1,
      status: 'failed',
    })
  })

  it('rolls token usage and a per-turn duration into each summary', () => {
    const trajectory = snapshot({
      eventNodes: [
        {
          kind: 'assistant',
          seq: 20,
          time: 2_000,
          turn: 2,
          step: 1,
          blocks: [{ kind: 'text', text: 'hi' }],
          usage: { inputTokens: 100, cacheReadTokens: 30, outputTokens: 40, reasoningTokens: 5 },
          requestConfig: { provider: 'deepseek', model: 'flash' },
          timing: { stepStartTime: 1_000, firstTokenTime: 1_500, completedTime: 2_000 },
        },
        {
          kind: 'assistant',
          seq: 21,
          time: 4_000,
          turn: 2,
          step: 2,
          blocks: [{ kind: 'text', text: 'bye' }],
          usage: { inputTokens: 200, outputTokens: 20 },
          requestConfig: { provider: 'deepseek', model: 'flash' },
          timing: { stepStartTime: 3_000, firstTokenTime: 3_500, completedTime: 4_000 },
        },
      ],
      requests: [],
    })
    const turns = deriveTraceGraphTurns(trajectory, EMPTY_TIMINGS, new Map([[2, 21]]), false)
    expect(turns).toHaveLength(1)
    expect(turns[0]!.usage).toEqual({ input: 300, cacheRead: 30, output: 60, reasoning: 5 })
    expect(turns[0]!.durationMs).toBe(3_000)
    expect(traceGraphTurnTotalTokens(turns[0]!.usage)).toBe(395)
  })

  it('builds a REQUEST/RESPONSE/TOOL pipeline for one turn', () => {
    const trajectory = snapshot({
      eventNodes: [
        {
          kind: 'assistant',
          seq: 20,
          time: 2_000,
          turn: 2,
          step: 3,
          blocks: [
            { kind: 'reasoning', text: 'think' },
            { kind: 'tool-call', callId: 't1', name: 'read', argsRaw: '{"path":"a"}' },
          ],
          usage: { inputTokens: 10, cacheReadTokens: 2, outputTokens: 4 },
          requestConfig: { provider: 'deepseek', model: 'flash' },
          timing: { stepStartTime: 1_500, firstTokenTime: 1_600, completedTime: 2_000 },
        },
        {
          kind: 'tool-result',
          seq: 21,
          time: 2_100,
          callId: 't1',
          call: { name: 'read', argsRaw: '{"path":"a"}' },
          callTime: 2_010,
          content: [{ type: 'text', text: 'file' }],
          isError: false,
          callView: null,
          resultView: null,
          subCalls: [],
        },
      ],
      requests: [{
        purpose: 'assistant',
        turn: 2,
        step: 3,
        startSeq: 19,
        startedAt: 1_500,
        completedAt: 2_000,
        status: 'complete',
        prompt: {
          config: { provider: 'deepseek', model: 'flash' },
          system: 'sys',
          tools: [{ name: 'read', description: '', parameters: { type: 'object' } } as never],
        },
      }],
    })
    const steps = deriveTraceGraphPipeline(trajectory, 2)
    expect(steps).toHaveLength(1)
    expect(steps[0]!.request).toMatchObject({
      model: 'flash',
      provider: 'deepseek',
      systemCount: 1,
      toolCount: 1,
    })
    expect(steps[0]!.response.reasoningPreview).toContain('think')
    expect(steps[0]!.tools).toHaveLength(1)
    expect(steps[0]!.tools[0]).toMatchObject({ name: 'read', isError: false })
    expect(steps[0]!.usage).toEqual({ input: 10, cacheRead: 2, output: 4 })
  })

  it('formats durations compactly', () => {
    expect(formatTraceGraphDuration(0)).toBe('0s')
    expect(formatTraceGraphDuration(1_500)).toBe('1.5s')
    expect(formatTraceGraphDuration(125_000)).toBe('2m5s')
  })

  it('formats token counts as compact K/M', () => {
    expect(formatTraceGraphTokens(0)).toBe('0')
    expect(formatTraceGraphTokens(800)).toBe('800')
    expect(formatTraceGraphTokens(12_300)).toBe('12K')
    expect(formatTraceGraphTokens(1_540_000)).toBe('1.5M')
  })
})
