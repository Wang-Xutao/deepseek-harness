/**
 * The conversation Tab label copy.
 *
 * 【变更】2026-10-06 (问题 1): the「工作流」Tab is renamed「工作流图」(en
 * 'Workflow graph') — the tab shows the workflow GRAPH; the settings row that
 * gates it follows ('工作流图'), and its description quotes the new name.
 */
import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'

describe('workflow tab locale', () => {
  it('labels the conversation tab 工作流图 (zh) / Workflow graph (en)', () => {
    expect(zh['view.workflow']).toBe('工作流图')
    expect(en['view.workflow']).toBe('Workflow graph')
  })

  it('titles the settings row 工作流图 and its description quotes the new tab name', () => {
    expect(zh['settings.workflowTab.title']).toBe('工作流图')
    expect(en['settings.workflowTab.title']).toBe('Workflow graph tab')
    expect(zh['settings.workflowTab.description']).toContain('工作流图')
    expect(en['settings.workflowTab.description']).toContain('Workflow graph')
  })
})
