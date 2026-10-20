// @vitest-environment jsdom
/** Workflow tab host — renders slot ids per tab.
 * 【变更】2026-10-19 (主页面三改 3): rendered by WorkflowPage on the main
 * stage now; the standalone render keeps exercising the tab logic directly. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

afterEach(cleanup)
import { WorkflowSection } from '../src/client/WorkflowSection.tsx'

function t(key: string): string {
  return key
}

describe('WorkflowSection tabs', () => {
  it('renders five tabs and filters slot contributions per active panel', () => {
    const renderSlot = vi.fn((_name: string, _owner: object, opts?: { only?: string }) => (
      <span data-testid={`slot-${opts?.only ?? 'all'}`} />
    ))
    render(<WorkflowSection t={t as never} renderSlot={renderSlot as never} />)

    expect(screen.getByTestId('workflow-tab-general')).toBeDefined()
    expect(screen.getByTestId('workflow-tab-project')).toBeDefined()
    expect(screen.getByTestId('workflow-tab-gates')).toBeDefined()
    expect(screen.getByTestId('workflow-tab-standard')).toBeDefined()
    expect(screen.getByTestId('workflow-tab-quality')).toBeDefined()

    expect(renderSlot).toHaveBeenCalledWith('settings.workflow.item', {}, { only: 'trace-graph' })
    expect(renderSlot).toHaveBeenCalledWith('settings.workflow.item', {}, { only: 'workflow-tab' })

    fireEvent.click(screen.getByTestId('workflow-tab-gates'))
    expect(renderSlot).toHaveBeenCalledWith('settings.workflow.item', {}, { only: 'baf-gates-overview' })
  })
})
