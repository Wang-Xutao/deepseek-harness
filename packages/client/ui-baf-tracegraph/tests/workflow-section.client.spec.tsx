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
  it('renders seven tabs — 指令集 between 确认门 and 企业规范, 变更总览 last — and filters slot contributions per active panel', () => {
    const renderSlot = vi.fn((_name: string, _owner: object, opts?: { only?: string }) => (
      <span data-testid={`slot-${opts?.only ?? 'all'}`} />
    ))
    render(<WorkflowSection t={t as never} renderSlot={renderSlot as never} />)

    // 【变更】2026-10-21 (指令集): the commands tab rides index 3, between
    // 确认门 (gates) and 企业规范 (standard) — the customer-named position.
    // 【变更】2026-10-24 (批次十八 2.3): 变更总览 is the LAST tab (客户指定位置).
    expect([...document.querySelectorAll('[role="tab"]')].map(tab => tab.getAttribute('data-testid'))).toEqual([
      'workflow-tab-general',
      'workflow-tab-project',
      'workflow-tab-gates',
      'workflow-tab-commands',
      'workflow-tab-standard',
      'workflow-tab-quality',
      'workflow-tab-changes',
    ])

    expect(renderSlot).toHaveBeenCalledWith('settings.workflow.item', {}, { only: 'trace-graph' })
    expect(renderSlot).toHaveBeenCalledWith('settings.workflow.item', {}, { only: 'workflow-tab' })

    fireEvent.click(screen.getByTestId('workflow-tab-commands'))
    expect(renderSlot).toHaveBeenCalledWith('settings.workflow.item', {}, { only: 'baf-standard-commands' })
    fireEvent.click(screen.getByTestId('workflow-tab-gates'))
    expect(renderSlot).toHaveBeenCalledWith('settings.workflow.item', {}, { only: 'baf-gates-overview' })
    fireEvent.click(screen.getByTestId('workflow-tab-changes'))
    expect(renderSlot).toHaveBeenCalledWith('settings.workflow.item', {}, { only: 'baf-change-overview' })
  })
})
