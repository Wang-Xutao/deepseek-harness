/**
 * StandardBaselineProvider: structured summary of the baseline `standard`
 * section for prompt injection, plan validation, and guard reference.
 *
 * Design rule (enterprise-workflow §12.7.2, §15): the provider NEVER embeds
 * concrete rule values. It only projects what the baseline carries — the
 * rules source reference — plus a stable catalog of rule-area ids whose
 * content is defined by the referenced enterprise source. A placeholder
 * reference means the policy is missing, and the summary must say so instead
 * of improvising defaults.
 * @module @deepseek-ai/dsh-baf-standard/provider
 */

import type { BaselineManifest } from '@deepseek-ai/dsh-baf-core'

/** Baseline placeholder value enterprises must replace. */
export const STANDARD_PLACEHOLDER = '<enterprise-tbd>'

/**
 * Stable rule-area catalog. Ids and anchors are part of the provider
 * contract; the CONTENT behind each area lives in the referenced enterprise
 * rules source, never in this package.
 */
export interface StandardArea {
  /** Stable area id used by plan validation and guard messages. */
  readonly id: string
  /** i18n key (rendered by the host UI), not display text. */
  readonly titleKey: string
  /** Anchor appended to the baseline rules reference. */
  readonly anchor: string
}

export const STANDARD_AREAS: readonly StandardArea[] = [
  { id: 'project-charter', titleKey: 'baf.standard.area.project-charter', anchor: 'project-charter' },
  { id: 'coding-style', titleKey: 'baf.standard.area.coding-style', anchor: 'coding-style' },
  { id: 'interfaces', titleKey: 'baf.standard.area.interfaces', anchor: 'interfaces' },
  { id: 'error-handling', titleKey: 'baf.standard.area.error-handling', anchor: 'error-handling' },
  { id: 'logging', titleKey: 'baf.standard.area.logging', anchor: 'logging' },
  { id: 'documentation', titleKey: 'baf.standard.area.documentation', anchor: 'documentation' },
  { id: 'branch-commit', titleKey: 'baf.standard.area.branch-commit', anchor: 'branch-commit' },
  { id: 'testing-discipline', titleKey: 'baf.standard.area.testing-discipline', anchor: 'testing-discipline' },
]

/** Availability of the standard policy for this baseline. */
export type StandardAvailability = 'ready' | 'policy_missing'

/** Structured summary of the baseline standard section. */
export interface StandardSummary {
  readonly schema: 1
  readonly baselineId: string
  /** Raw rules source reference from the baseline. */
  readonly sourceRef: string
  /** False when the reference is still an enterprise placeholder. */
  readonly available: boolean
  readonly availability: StandardAvailability
  /** Empty when ready, ['policy_missing'] otherwise. */
  readonly reasonCodes: readonly string[]
  /** Rule-area projections with source pointers, no content. */
  readonly areas: readonly {
    readonly id: string
    readonly titleKey: string
    readonly sourceRef: string
  }[]
  /** Prompt-injection lines (also available via renderStandardPrompt). */
  readonly promptLines: readonly string[]
}

function isPlaceholder(ref: string): boolean {
  return ref.trim() === STANDARD_PLACEHOLDER
}

/**
 * Project a baseline into a standard summary. Pure: no I/O, no defaults.
 * @param baseline - validated baseline manifest.
 * @returns structured summary with area pointers and prompt lines.
 */
export function summarizeStandard(baseline: BaselineManifest): StandardSummary {
  const sourceRef = baseline.standard.mattPocockRulesRef
  const placeholder = isPlaceholder(sourceRef)
  const availability: StandardAvailability = placeholder ? 'policy_missing' : 'ready'
  const areas = STANDARD_AREAS.map(area => ({
    id: area.id,
    titleKey: area.titleKey,
    sourceRef: placeholder ? sourceRef : `${sourceRef}#${area.anchor}`,
  }))
  const promptLines = placeholder
    ? [
      `BAF standard: policy_missing (baseline ${baseline.baselineId}).`,
      'The baseline standard.mattPocockRulesRef is an enterprise placeholder; no rule values are loaded.',
      'Do not improvise coding-standard rules; treat standard enforcement as not configured.',
    ]
    : [
      `BAF standard: baseline ${baseline.baselineId}.`,
      `Rules source: ${sourceRef}.`,
      `Rule areas: ${STANDARD_AREAS.map(area => area.id).join(', ')}.`,
      'Follow the referenced enterprise rules source for each area; this system carries no inline rule text.',
    ]
  return {
    schema: 1,
    baselineId: baseline.baselineId,
    sourceRef,
    available: !placeholder,
    availability,
    reasonCodes: placeholder ? ['policy_missing'] : [],
    areas,
    promptLines,
  }
}

/**
 * Render the summary as a prompt block for injection.
 * @param summary - output of {@link summarizeStandard}.
 * @returns multi-line prompt text.
 */
export function renderStandardPrompt(summary: StandardSummary): string {
  return summary.promptLines.join('\n')
}

/**
 * Check a rule-area id against the summary (plan validation helper).
 * @param summary - output of {@link summarizeStandard}.
 * @param areaId - area id to check.
 * @returns true when the area exists in the catalog.
 */
export function hasStandardArea(summary: StandardSummary, areaId: string): boolean {
  return summary.areas.some(area => area.id === areaId)
}
