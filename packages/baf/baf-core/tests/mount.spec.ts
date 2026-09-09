/**
 * BafCore Cordis registration.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import BafCore, { BAF_VERSION } from '../src/index.ts'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'baseline', 'baseline.yml')

describe('BafCore service', () => {
  it('registers on the context and loads a baseline', async () => {
    const ctx = new Context()
    await ctx.plugin(BafCore, { bafVersion: BAF_VERSION })
    expect(ctx.bafCore.version()).toBe(BAF_VERSION)
    expect(ctx.bafCore.doctor().adapters.openspec).toBe('unavailable')
    expect(ctx.bafCore.help().length).toBeGreaterThan(0)
    await ctx.bafCore.loadBaseline(FIXTURE)
    expect(ctx.bafCore.currentBaseline()?.baselineId).toBe('baf-baseline-c-2026.1')
    expect(ctx.bafCore.status().baselineLoaded).toBe(true)
  })
})
