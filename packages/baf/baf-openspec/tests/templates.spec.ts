/**
 * Template skeletons (抓手 2, 2026-10-06 问题 4 · OpenSpec × Matt 融合): the
 * design/tasks TODO lines name the workspace rules source — a structural hint
 * only, deliberately NOT a gate condition.
 */
import { describe, expect, it } from 'vitest'
import { designTemplate, tasksTemplate } from '../src/templates.ts'

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
