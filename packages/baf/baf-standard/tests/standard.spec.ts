/**
 * StandardBaselineProvider tests: summary projection from the baseline
 * standard section, placeholder handling, and the no-embedded-values rule.
 */

import { describe, expect, it } from 'vitest'
import type { BaselineManifest } from '@deepseek-ai/dsh-baf-core'
import {
  hasStandardArea,
  renderStandardPrompt,
  STANDARD_AREAS,
  summarizeStandard,
} from '../src/provider.ts'

function fixtureBaseline(standard: { mattPocockRulesRef: string }): BaselineManifest {
  return {
    schema: 1,
    baselineId: 'baf-baseline-c-test',
    bafCompatibility: { min: '0.1.0', max: '0.x' },
    workflow: {
      default: 'go',
      requireOpenSpec: true,
      bugFixPath: { allowed: true, maxScope: 'small-local', requireRegressionTest: true },
    },
    routeProfile: {
      default: { provider: 'p', model: 'm' },
      allowed: [{ provider: 'p', model: 'm', capabilities: ['coding'], fallbackGroup: 'g' }],
      phases: {
        intake: { provider: 'p', model: 'm' },
        open: { provider: 'p', model: 'm' },
        clarify: { provider: 'p', model: 'm' },
        design: { provider: 'p', model: 'm' },
        plan: { provider: 'p', model: 'm' },
        implement: { provider: 'p', model: 'm' },
        verify: { provider: 'p', model: 'm' },
        archive: { provider: 'p', model: 'm' },
      },
      fallbackPolicy: { mode: 'approved-only', groups: { g: [{ provider: 'p', model: 'm' }] } },
    },
    openspec: {
      cli: 'openspec',
      version: 'latest',
      root: 'openspec',
      changeRoot: 'openspec/changes',
      validate: { args: [] },
    },
    standard,
    stack: {
      language: 'c',
      compiler: 'gcc',
      build: 'make',
      test: 'ctest',
      coverage: { required: true, minimum: 'project-config' },
      analyzers: [],
    },
    guard: {
      secretScan: 'required',
      protectedPaths: [],
      requireHumanConfirmation: ['archive'],
    },
  }
}

describe('standard baseline provider', () => {
  it('projects the baseline standard section into a ready summary', () => {
    const summary = summarizeStandard(fixtureBaseline({ mattPocockRulesRef: 'https://rules.example.com/c-standard.md' }))
    expect(summary.schema).toBe(1)
    expect(summary.baselineId).toBe('baf-baseline-c-test')
    expect(summary.available).toBe(true)
    expect(summary.availability).toBe('ready')
    expect(summary.reasonCodes).toEqual([])
    expect(summary.sourceRef).toBe('https://rules.example.com/c-standard.md')
    expect(summary.areas).toHaveLength(STANDARD_AREAS.length)
    expect(summary.areas[0]).toEqual({
      id: 'project-charter',
      titleKey: 'baf.standard.area.project-charter',
      sourceRef: 'https://rules.example.com/c-standard.md#project-charter',
    })
  })

  it('marks placeholder references as policy_missing without inventing values', () => {
    const summary = summarizeStandard(fixtureBaseline({ mattPocockRulesRef: '<enterprise-tbd>' }))
    expect(summary.available).toBe(false)
    expect(summary.availability).toBe('policy_missing')
    expect(summary.reasonCodes).toEqual(['policy_missing'])
    // Areas still project the placeholder ref verbatim, with no anchors.
    expect(summary.areas.every(area => area.sourceRef === '<enterprise-tbd>')).toBe(true)
    expect(summary.promptLines.join('\n')).toContain('policy_missing')
    expect(summary.promptLines.join('\n')).not.toContain('#')
  })

  it('embeds no rule values: prompt lines carry only refs and area ids', () => {
    const ref = 'https://rules.example.com/c-standard.md'
    const summary = summarizeStandard(fixtureBaseline({ mattPocockRulesRef: ref }))
    const text = renderStandardPrompt(summary)
    expect(text).toContain(ref)
    expect(text).toContain('project-charter')
    // Areas project pointers only: id/titleKey/sourceRef, no content field.
    for (const area of summary.areas) {
      expect(Object.keys(area).sort()).toEqual(['id', 'sourceRef', 'titleKey'])
    }
    // Prompt lines reference the source; none carries rule text of its own.
    expect(summary.promptLines.some(line => line.includes(ref))).toBe(true)
  })

  it('answers area membership for plan validation', () => {
    const summary = summarizeStandard(fixtureBaseline({ mattPocockRulesRef: 'ref' }))
    expect(hasStandardArea(summary, 'error-handling')).toBe(true)
    expect(hasStandardArea(summary, 'nope')).toBe(false)
  })
})
