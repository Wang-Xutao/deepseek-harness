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
import { ArtifactRail, artifactDriftTags } from '../src/client/flow-parts.tsx'
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

  it('offers no advance when the change cannot advance', () => {
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
    expect(screen.queryByTestId('flow-advance')).toBeNull()
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

describe('工作流图 · the document drift tags (批次三十一)', () => {
  const rows = [
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
