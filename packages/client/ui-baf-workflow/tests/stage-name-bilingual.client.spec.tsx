// @vitest-environment jsdom
/**
 * 【变更】2026-10-28 (批次三十五 · 用户问题 1/2): the stage NAMES are
 * bilingual — 中文在前，英文在后 on ONE line, the 确认门配置流程图's card
 * anatomy (the 确认门配置流程图 renders its node cards exactly this way).
 *
 * The zh label stays locale-owned (`node.*`); the English name is a plain
 * constant (`flow-parts.NODE_EN`), the same pattern the 确认门配置流程图 uses.
 * Asserted on the components themselves: the 会话工作流图's stage card and
 * the 变更总览's per-change detail.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

afterEach(cleanup)
import { FlowCanvas } from '../src/client/FlowCanvas.tsx'
import { buildClientTemplateTabView } from '../src/client/graph-template.ts'
import { NODE_EN, StageSummaryCard } from '../src/client/flow-parts.tsx'
import { zh } from '../src/client/locales.ts'

/** The real Chinese copy — the names are product text, not keys. */
const t = (key: keyof typeof zh): string => zh[key]

describe('会话工作流图 · the bilingual stage names (批次三十五)', () => {
  it('prints the zh name and the English name on ONE line', () => {
    render(
      <FlowCanvas
        view={buildClientTemplateTabView()}
        selected={null}
        onActivate={() => undefined}
        onOpenArtifact={() => undefined}
        t={t}
      />,
    )
    const name = screen.getByTestId('flow-node-name-design')
    expect(name.textContent).toContain('设计')
    expect(name.textContent).toContain('Design')
    // The English rides INLINE inside the name element, right after the zh.
    expect(name.querySelector('span[class*="nodeNameEn"]')?.textContent).toBe('Design')
    // The zh label comes first.
    expect(name.firstChild?.textContent).toBe('设计')
  })

  it('names every stage of the main chain bilingually', () => {
    render(
      <FlowCanvas
        view={buildClientTemplateTabView()}
        selected={null}
        onActivate={() => undefined}
        onOpenArtifact={() => undefined}
        t={t}
      />,
    )
    for (const [id, en] of Object.entries(NODE_EN)) {
      const name = screen.queryByTestId(`flow-node-name-${id}`)
      if (name === null) continue
      expect(name.textContent).toContain(en)
    }
  })

  it('keeps the status badge beside the name, not inside it', () => {
    render(
      <FlowCanvas
        view={buildClientTemplateTabView()}
        selected={null}
        onActivate={() => undefined}
        onOpenArtifact={() => undefined}
        t={t}
      />,
    )
    const name = screen.getByTestId('flow-node-name-design')
    expect(name.textContent).not.toContain('空闲')
  })
})

describe('阶段详情 · the bilingual stage name card (批次三十五)', () => {
  it('prints the zh name and the English name on ONE line', () => {
    render(
      <StageSummaryCard
        name="设计"
        node={{
          id: 'design',
          status: 'in-progress',
          catalog: {
            id: 'design', titleKey: 'node.design', purpose: 'p', prerequisites: [], actions: [],
            artifacts: [], completion: [], failure: [], entries: [],
          },
          onPath: true,
          transitionsIn: [],
          transitionsOut: [],
        }}
        t={t}
      />,
    )
    const name = screen.getByTestId('stage-summary-name')
    expect(name.textContent).toContain('设计')
    expect(name.textContent).toContain('Design')
    expect(name.querySelector('span[class*="nodeNameEn"]')?.textContent).toBe('Design')
  })

  it('names a terminal stage bilingually when the caller names it', () => {
    render(
      <StageSummaryCard name="完成" nameEn={NODE_EN.completed} t={t} />,
    )
    const name = screen.getByTestId('stage-summary-name')
    expect(name.textContent).toContain('完成')
    expect(name.textContent).toContain('Completed')
  })
})
