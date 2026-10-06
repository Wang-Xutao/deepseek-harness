/**
 * Template skeletons (抓手 2, 2026-10-06 问题 4 · OpenSpec × Matt 融合): the
 * design/tasks TODO lines name the workspace rules source — a structural hint
 * only, deliberately NOT a gate condition.
 */
import { describe, expect, it } from 'vitest'
import { clarifyTemplate, designTemplate, tasksTemplate } from '../src/templates.ts'

describe('openspec templates · rules-source anchors (问题 4 抓手 2)', () => {
  it('design TODO asks deviations to cite the rules source anchor', () => {
    const text = designTemplate('CHG-1')
    expect(text).toContain('mattPocockRulesRef')
    expect(text).toContain('.baf/standards/default-rules.md')
    expect(text).toContain('anchor')
  })

  it('tasks TODO points test tasks at the testing-discipline anchor', () => {
    const text = tasksTemplate('CHG-1')
    expect(text).toContain('testing-discipline')
    expect(text).toContain('regression test first')
  })
})

describe('openspec templates · grill-me asking discipline (九点批 问题 1 轻量融入)', () => {
  it('clarify TODO carries the one-blocking-question-at-a-time discipline', () => {
    const text = clarifyTemplate('CHG-1')
    // Style guidance only — the clarify GATE still judges the document shape
    // (DOC_REQUIREMENTS_ZH.clarify), never these lines.
    expect(text).toContain('Asking discipline (grill-me style)')
    expect(text).toContain('ONE blocking question at a time')
    expect(text).toContain('recommended default')
    expect(text).toContain('deferred')
    expect(text).toContain('blocking\nlist is empty')
    // The skeleton fields it disciplines stay intact.
    expect(text).toContain('## Blocking questions')
    expect(text).toContain('- Decided / Deferred / Out-of-scope:')
  })
})
