/**
 * Adapter stubs return structured unavailable outcomes.
 */

import { describe, expect, it } from 'vitest'
import { createUnavailableAdapters } from '../src/adapters.ts'
import { parseBaselineManifest, BAF_VERSION } from '../src/index.ts'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'baseline', 'baseline.yml')

describe('unavailable adapters', () => {
  it('report openspec/stack as unavailable and block guard', async () => {
    const adapters = createUnavailableAdapters()
    const workspace = { root: '/tmp/ws' }
    expect(await adapters.openspec.detect({ workspace })).toMatchObject({ available: false })
    expect(await adapters.stack.detect({ workspace })).toMatchObject({ available: false })

    const open = await adapters.openspec.open({ changeId: 'c', title: 't', workspace })
    expect(open.status).toBe('unavailable')
    expect(open.diagnostics[0]?.code).toBe('tool_unavailable')

    const baseline = parseBaselineManifest(loadYaml(await readFile(FIXTURE, 'utf8')), BAF_VERSION)
    const guard = await adapters.guard.check({
      workspace,
      baseline,
      paths: ['a.c'],
      action: 'write',
    }, new AbortController().signal)
    expect(guard.allowed).toBe(false)
    expect(guard.reasonCodes).toContain('tool_unavailable')
  })

  it('leaves workflow methods unimplemented until Phase 4', async () => {
    const adapters = createUnavailableAdapters()
    await expect(adapters.workflow.status({ changeId: 'c', workspace: { root: '/tmp' } }))
      .rejects.toThrow(/Phase 4/)
  })
})
