// @vitest-environment jsdom
/**
 * 【变更】2026-10-27 (批次三十一): the 工作流图's drift affordances.
 *
 * Three facts the customer asked for, asserted on the components themselves:
 * - the graph's toolbar carries the flow's operating buttons and nothing else —
 *   the change's identity tag left it, the 「同步」button moved into the
 *   out-of-sync notice, and the 「推进」button arrived LEFT of 「暂停」/「继续」;
 * - a stage whose document no longer matches its upstream wears the stale
 *   badge, so the graph says where the documents disagree;
 * - the left rail's documents carry their drift tag — 已修改 / 待同步 / 已同步.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

afterEach(cleanup)
import { FlowCanvas } from '../src/client/FlowCanvas.tsx'
import { FlowNotice } from '../src/client/FlowNotice.tsx'
import { ArtifactRail, artifactDriftTags, artifactName, workspaceRelativePath } from '../src/client/flow-parts.tsx'
import { buildClientTemplateTabView } from '../src/client/graph-template.ts'
import { zh } from '../src/client/locales.ts'

/** The real Chinese copy — the tags are product text, not keys. */
const t = (key: keyof typeof zh): string => zh[key]

describe('工作流图 · the drift affordances (批次三十一)', () => {
  it('carries 推进 left of 暂停, and no 同步 button', () => {
    render(
      <FlowCanvas
        view={buildClientTemplateTabView()}
        selected={null}
        onActivate={() => undefined}
        onOpenArtifact={() => undefined}
        controls={{
          paused: false,
          onTogglePause: () => undefined,
          advanceReady: true,
          onAdvance: () => undefined,
        }}
        t={t}
      />,
    )
    const advance = screen.getByTestId('flow-advance')
    const pause = screen.getByTestId('flow-toggle-pause')
    expect(advance.textContent).toBe('推进')
    expect(pause.textContent).toBe('暂停')
    // The advance sits LEFT of the pause button.
    expect(
      advance.compareDocumentPosition(pause) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // The 同步 action belongs to the out-of-sync notice, not to the toolbar.
    expect(screen.queryByTestId('flow-sync-artifacts')).toBeNull()
    // The change's identity tag left the toolbar.
    expect(screen.queryByTestId('flow-change-tag')).toBeNull()
  })

  it('keeps the advance button in place but disabled when the change cannot advance', () => {
    // 【变更】2026-10-30 (用户问题 3 补充): the button used to VANISH, leaving
    // an empty slot in the toolbar that read as a missing button. It keeps its
    // place now, disabled, and its title says what is missing.
    render(
      <FlowCanvas
        view={buildClientTemplateTabView()}
        selected={null}
        onActivate={() => undefined}
        onOpenArtifact={() => undefined}
        controls={{
          paused: false,
          onTogglePause: () => undefined,
          advanceReady: false,
          onAdvance: () => undefined,
        }}
        t={t}
      />,
    )
    const advance = screen.getByTestId('flow-advance') as HTMLButtonElement
    expect(advance.disabled).toBe(true)
    expect(screen.getByTestId('flow-toggle-pause')).toBeTruthy()
  })

  it('marks the stage whose document no longer matches its upstream', () => {
    render(
      <FlowCanvas
        view={buildClientTemplateTabView()}
        selected={null}
        onActivate={() => undefined}
        onOpenArtifact={() => undefined}
        driftNodes={['design']}
        t={t}
      />,
    )
    expect(screen.getByTestId('flow-node-drift-design').textContent).toBe('过期阶段')
    expect(screen.queryByTestId('flow-node-drift-plan')).toBeNull()
  })
})

describe('工作流图 · the 暂停/继续 control (批次三十三)', () => {
  it('reads 暂停 on the brake and 继续 when the brake holds', () => {
    const { rerender } = render(
      <FlowCanvas
        view={buildClientTemplateTabView()}
        selected={null}
        onActivate={() => undefined}
        onOpenArtifact={() => undefined}
        controls={{
          paused: false,
          onTogglePause: () => undefined,
          advanceReady: true,
          onAdvance: () => undefined,
        }}
        t={t}
      />,
    )
    expect(screen.getByTestId('flow-toggle-pause').textContent).toBe('暂停')
    rerender(
      <FlowCanvas
        view={buildClientTemplateTabView()}
        selected={null}
        onActivate={() => undefined}
        onOpenArtifact={() => undefined}
        controls={{
          paused: true,
          onTogglePause: () => undefined,
          advanceReady: false,
          onAdvance: () => undefined,
        }}
        t={t}
      />,
    )
    expect(screen.getByTestId('flow-toggle-pause').textContent).toBe('继续')
  })

  it('carries a glyph on the control — the button says what it does', () => {
    render(
      <FlowCanvas
        view={buildClientTemplateTabView()}
        selected={null}
        onActivate={() => undefined}
        onOpenArtifact={() => undefined}
        controls={{
          paused: false,
          onTogglePause: () => undefined,
          advanceReady: true,
          onAdvance: () => undefined,
        }}
        t={t}
      />,
    )
    const pause = screen.getByTestId('flow-toggle-pause')
    expect(pause.querySelector('svg')).not.toBeNull()
  })
})

describe('工作流图 · the flow notice (批次三十三)', () => {
  it('renders a titled card instead of one raw line', () => {
    render(
      <FlowNotice
        notice={{ kind: 'warn', title: '继续操作未能生效', text: 'plan 裁决门未通过' }}
        testId="flow-pause-notice"
      />,
    )
    const notice = screen.getByTestId('flow-pause-notice')
    expect(notice.textContent).toContain('继续操作未能生效')
    expect(notice.textContent).toContain('plan 裁决门未通过')
  })

  it('shows a spinner while the sync is on its way', () => {
    const { container } = render(
      <FlowNotice
        notice={{ kind: 'syncing', title: '正在同步', text: '模型正按最新上游重写过期的产物' }}
        testId="flow-sync-notice"
      />,
    )
    expect(screen.getByTestId('flow-sync-notice').textContent).toContain('正在同步')
    expect(container.querySelector('span[class*="Spinner"]')).not.toBeNull()
  })
})

describe('工作流图 · the artifact labels and paths (批次三十四)', () => {
  // 【变更】2026-10-29 (批次三十六 · 用户问题 5): the chip names the document
  // by its FILE NAME again — the three-character labels (立项书 / 澄清稿 …)
  // are gone from the graph.
  it('names every document by its file name', () => {
    expect(artifactName('openspec/changes/c1/proposal.md')).toBe('proposal.md')
    expect(artifactName('openspec/changes/c1/clarify.md')).toBe('clarify.md')
    expect(artifactName('openspec/changes/c1/design.md')).toBe('design.md')
    expect(artifactName('openspec/changes/c1/plan.md')).toBe('plan.md')
    expect(artifactName('openspec/changes/c1/tasks.md')).toBe('tasks.md')
    expect(artifactName('openspec/changes/c1/plan.json')).toBe('plan.json')
    expect(artifactName('openspec/changes/c1/checklist.md')).toBe('checklist.md')
    expect(artifactName('openspec/changes/c1/verify.md')).toBe('verify.md')
    // An absolute path keeps its file name too.
    expect(artifactName('D:/ws/demo/openspec/changes/c1/design.md')).toBe('design.md')
  })

  // 【变更】2026-10-29 (批次三十六 · 用户问题 5): the 阶段产物 state chips are
  // three characters each and read right-aligned.
  // 【变更】2026-10-29 (批次三十七 · 用户问题 6): the six-state document ladder
  // joins the chip family — every label stays three characters.
  it('keeps every 阶段产物 state chip at three characters', () => {
    for (const state of ['missing', 'template', 'planned', 'filled', 'completed', 'updated', 'stale', 'clipped'] as const) {
      expect(zh[`artifact.state.${state}` as keyof typeof zh].length).toBe(3)
    }
    expect(zh['artifact.state.missing' as keyof typeof zh]).toBe('未生成')
    expect(zh['artifact.state.template' as keyof typeof zh]).toBe('未填写')
    expect(zh['artifact.state.filled' as keyof typeof zh]).toBe('已填写')
    // 【变更】2026-10-30 (用户问题 4): 「已完成」→「已锁定」——这一档是「客户
    // 已确认、文档被锁死」，不是「这件事做完了」。
    expect(zh['artifact.state.completed' as keyof typeof zh]).toBe('已锁定')
    expect(zh['artifact.state.updated' as keyof typeof zh]).toBe('已更新')
    expect(zh['artifact.state.stale' as keyof typeof zh]).toBe('待更新')
    expect(zh['artifact.drift.modified' as keyof typeof zh]).toBe('已修改')
    expect(zh['artifact.drift.pending' as keyof typeof zh]).toBe('待同步')
  })

  it('turns an absolute artifact path into a workspace-relative one', () => {
    expect(workspaceRelativePath('D:/ws/demo', 'D:/ws/demo/openspec/changes/c1/design.md'))
      .toBe('openspec/changes/c1/design.md')
    // A path outside the workspace is left alone — the reader refuses it.
    expect(workspaceRelativePath('D:/ws/demo', 'C:/other/design.md')).toBe('C:/other/design.md')
    // A relative path stays relative.
    expect(workspaceRelativePath('D:/ws/demo', 'openspec/changes/c1/design.md'))
      .toBe('openspec/changes/c1/design.md')
  })
})

describe('工作流图 · the document drift tags (批次三十一)', () => {  const rows = [
  { file: 'proposal.md', path: 'openspec/changes/c1/proposal.md', state: 'filled' as const, missing: [] },
  { file: 'design.md', path: 'openspec/changes/c1/design.md', state: 'filled' as const, missing: [] },
  { file: 'plan.md', path: 'openspec/changes/c1/plan.md', state: 'missing' as const, missing: [] },
]

it('tags the edited document 已修改 and the stale one 待同步', () => {
  const drift = [{ file: 'design.md', sourceFile: 'proposal.md' }]
  render(
    <ArtifactRail rows={rows} driftTags={artifactDriftTags(drift, false)} t={t} />,
  )
  expect(screen.getByTestId('artifact-drift-tag-proposal.md').textContent).toBe('已修改')
  expect(screen.getByTestId('artifact-drift-tag-design.md').textContent).toBe('待同步')
  // A document that is not part of the drift carries no tag.
  expect(screen.queryByTestId('artifact-drift-tag-plan.md')).toBeNull()
})

it('reads 已同步 while the sync order is rewriting the stale document', () => {
  const drift = [{ file: 'design.md', sourceFile: 'proposal.md' }]
  render(
    <ArtifactRail rows={rows} driftTags={artifactDriftTags(drift, true)} t={t} />,
  )
  expect(screen.getByTestId('artifact-drift-tag-design.md').textContent).toBe('已同步')
  // The upstream document keeps its own tag — it was edited, not rewritten.
  expect(screen.getByTestId('artifact-drift-tag-proposal.md').textContent).toBe('已修改')
})

it('keeps the stale role when one document is both edited and stale', () => {
  const drift = [
    { file: 'design.md', sourceFile: 'proposal.md' },
    { file: 'proposal.md', sourceFile: 'clarify.md' },
  ]
  const tags = artifactDriftTags(drift, false)
  expect(tags['proposal.md']).toBe('pending')
  expect(tags['clarify.md']).toBe('modified')
})

it('tags nothing when no document is out of sync', () => {
  expect(artifactDriftTags([], false)).toEqual({})
})
})
