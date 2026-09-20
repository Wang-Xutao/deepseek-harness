/**
 * Baseline loader: fixture acceptance and structured rejection cases.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import {
  BAF_VERSION,
  BafError,
  loadBaselineFile,
  parseBaselineManifest,
  type BaselineManifest,
} from '../src/index.ts'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'baseline', 'baseline.yml')

async function fixtureRaw(): Promise<unknown> {
  return loadYaml(await readFile(FIXTURE, 'utf8'))
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

describe('baseline loader', () => {
  it('accepts the Phase 0 fixture against the package BAF version', async () => {
    const manifest = await loadBaselineFile(FIXTURE, BAF_VERSION)
    expect(manifest.baselineId).toBe('baf-baseline-c-2026.1')
    expect(manifest.stack.compiler).toBe('gcc')
    expect(manifest.openspec.version).toBe('latest')
    expect(manifest.stack.coverage.minimum).toBe('project-config')
  })

  it('rejects a missing required field as baseline_unavailable', async () => {
    const raw = clone(await fixtureRaw()) as Record<string, unknown>
    delete raw.openspec
    expect(() => parseBaselineManifest(raw, BAF_VERSION)).toThrow(BafError)
    try {
      parseBaselineManifest(raw, BAF_VERSION)
    } catch (error) {
      expect(error).toMatchObject({ code: 'baseline_unavailable' })
    }
  })

  it('rejects an incompatible BAF version as baseline_incompatible', async () => {
    const raw = clone(await fixtureRaw()) as BaselineManifest
    expect(() => parseBaselineManifest(raw, '9.0.0')).toThrow(BafError)
    try {
      parseBaselineManifest(raw, '9.0.0')
    } catch (error) {
      expect(error).toMatchObject({
        code: 'baseline_incompatible',
        details: expect.objectContaining({ bafVersion: '9.0.0', min: '0.1.0', max: '0.x' }),
      })
    }
  })

  it('rejects a phase route outside allowed', async () => {
    const raw = clone(await fixtureRaw()) as BaselineManifest
    raw.routeProfile.phases.implement = { provider: 'other', model: 'x' }
    expect(() => parseBaselineManifest(raw, BAF_VERSION)).toThrow(/not in routeProfile.allowed/)
    try {
      parseBaselineManifest(raw, BAF_VERSION)
    } catch (error) {
      expect(error).toMatchObject({ code: 'baseline_unavailable' })
    }
  })

  it('rejects a missing fallback group', async () => {
    const raw = clone(await fixtureRaw()) as BaselineManifest
    raw.routeProfile.fallbackPolicy.groups = {}
    expect(() => parseBaselineManifest(raw, BAF_VERSION)).toThrow(/fallback group/)
  })

  it('rejects an illegal bug-fix-path maxScope', async () => {
    const raw = clone(await fixtureRaw()) as Record<string, unknown>
    const workflow = raw.workflow as Record<string, unknown>
    const bugFixPath = workflow.bugFixPath as Record<string, unknown>
    bugFixPath.maxScope = 'unknown'
    expect(() => parseBaselineManifest(raw, BAF_VERSION)).toThrow(BafError)
    try {
      parseBaselineManifest(raw, BAF_VERSION)
    } catch (error) {
      expect(error).toMatchObject({ code: 'baseline_unavailable' })
    }
  })
})
