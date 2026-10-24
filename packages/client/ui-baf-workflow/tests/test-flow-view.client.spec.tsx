// @vitest-environment jsdom
/**
 * 【变更】2026-10-24 (批次十九 2.1/2.2/2.3): the 测试流图 surface's brand
 * chip, its 全部运行 button and its report timestamps —
 *
 * 1. the top-left chip reads the BAF brand mark through the locale key
 *    (the SAME wordmark the 会话·工作流图 tab shows), not the page's own name;
 * 2. the 全部运行 label AND its glyph are white — the glyph paints with
 *    currentColor, so the stylesheet is the contract;
 * 3. every report timestamp prints `YYYY-MM-DD HH:mm:ss` in local time — the
 *    shared formatter's own contract plus the surface's use of it (the raw
 *    wire string must not survive anywhere on the page).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

import { TestFlowView } from '../src/client/TestFlowView.tsx'
import { formatTimestamp } from '../src/client/dashboard-format.ts'
import { zh, type WorkflowTabKey } from '../src/client/locales.ts'
import type {
  TestFlowStepId,
  WorkflowTabChainRunResult,
  WorkflowTabFileReadResult,
  WorkflowTabStageRunResult,
  WorkflowTabTestFlowStatus,
} from '../src/client/tab-types.ts'

afterEach(cleanup)

/** The surface's stylesheet — the contract for the white-on-brand surfaces. */
const sheet = readFileSync(resolve(import.meta.dirname, '../src/client/TestFlowView.module.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')

/** The zh dictionary, read by key (the shared vocabulary has no entry here). */
const dictionary: Record<string, string | undefined> = { ...zh }

/**
 * One rule's declarations.
 * @param selector - the class selector (no compound).
 * @returns the declaration list.
 */
function declarations(selector: string): string[] {
  // Anchored at a rule boundary: an unanchored match would read a compound
  // rule (`.runAllBtn:hover`) that merely contains the selector.
  const rule = new RegExp(`(?:^|\\})\\s*\\${selector}\\s*\\{([^{}]*)\\}`).exec(sheet)
  if (rule === null) throw new Error(`Stylesheet has no \`${selector}\` rule`)
  return (rule[1] ?? '').split(';').map(part => part.trim()).filter(Boolean)
}

/**
 * The expected local stamp — computed WITHOUT the formatter under test, so
 * the assertion pins the FORMAT and the local timezone, never a hardcoded
 * timezone-dependent literal.
 * @param wire - the wire timestamp.
 * @returns `YYYY-MM-DD HH:mm:ss` in local time.
 */
function localStamp(wire: string): string {
  const at = new Date(wire)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} `
    + `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

/** The wire timestamp the fixture carries (an ISO instant with a Z offset). */
const REPORT_AT = '2026-10-21T10:00:00Z'

/** A workspace whose reports both carry {@link REPORT_AT}. */
function readyStatus(): WorkflowTabTestFlowStatus {
  return {
    status: 'ready',
    coverage: { line: 83.3, minimum: 80, passed: true, generatedAt: REPORT_AT },
    staticAnalysis: { errors: 0, passed: true, generatedAt: REPORT_AT },
  }
}

/** The props this surface reads; the slot's session kit is never touched. */
interface SurfaceProps {
  t: (key: WorkflowTabKey) => string
  refresh: () => Promise<WorkflowTabTestFlowStatus>
  openArtifact: (path: string) => void
  subscribe: (onChange: () => void) => () => void
  runStage: (stage: TestFlowStepId, arg: string) => Promise<WorkflowTabStageRunResult>
  runChain: (arg: string) => Promise<WorkflowTabChainRunResult>
  readFile: (path: string) => Promise<WorkflowTabFileReadResult>
  openWorkflowConfig: () => void
  viewRequest: null
  completeViewRequest: () => void
}

/**
 * Render the 测试流图 tab with a ready workspace.
 * @param status - the host payload.
 */
async function mount(status: WorkflowTabTestFlowStatus): Promise<void> {
  const props: SurfaceProps = {
    t: key => dictionary[key] ?? key,
    refresh: async () => status,
    openArtifact: () => {},
    subscribe: () => () => {},
    runStage: async () => ({ status: 'ready' }),
    runChain: async () => ({ status: 'ready', stages: [], durationMs: 0 }),
    readFile: async () => ({ status: 'missing' }),
    openWorkflowConfig: () => {},
    viewRequest: null,
    completeViewRequest: () => {},
  }
  // The slot hands the view the session kit beside these; the surface reads
  // only the slice above, so the fixture passes exactly that slice.
  await act(async () => {
    render(createElement(TestFlowView, props as never))
  })
}

describe('formatTimestamp (批次十九 2.3)', () => {
  it('renders a wire timestamp as local YYYY-MM-DD HH:mm:ss', () => {
    expect(formatTimestamp(REPORT_AT)).toBe(localStamp(REPORT_AT))
    expect(formatTimestamp(REPORT_AT)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('pads every component (an offset-less stamp reads as local time)', () => {
    expect(formatTimestamp('2026-01-02T03:04:05')).toBe('2026-01-02 03:04:05')
  })

  it('falls back to the raw string when the wire value cannot be parsed', () => {
    expect(formatTimestamp('not-a-timestamp')).toBe('not-a-timestamp')
  })

  it('prints an em dash when there is no timestamp at all', () => {
    expect(formatTimestamp(undefined)).toBe('—')
    expect(formatTimestamp('')).toBe('—')
  })
})

describe('测试流图 brand chip + 全部运行 (批次十九 2.1/2.2)', () => {
  it('the top-left chip reads the BAF brand mark, not the page name', async () => {
    await mount(readyStatus())
    const chip = screen.getByTestId('baf-test-flow-brand')
    expect(chip.textContent).toBe('BAF')
    expect(chip.textContent).not.toBe(zh['view.testFlow'])
  })

  it('the brand chip paints its wordmark white on the shared brand fill', () => {
    expect(declarations('.stripBrand')).toEqual(expect.arrayContaining([
      'color: #fff',
      'background: var(--wf-brand-fill)',
    ]))
  })

  it('the 全部运行 button paints its label white and carries the glyph', async () => {
    await mount(readyStatus())
    const button = screen.getByTestId('baf-test-flow-run-all')
    // The glyph is an SVG painting with currentColor — the button's colour
    // IS the glyph's colour.
    expect(button.querySelector('svg')).not.toBeNull()
    expect(declarations('.runAllBtn')).toEqual(expect.arrayContaining([
      'color: #fff',
      'background: var(--wf-brand-fill)',
    ]))
  })
})

describe('测试流图 report timestamps (批次十九 2.3)', () => {
  it('the strip\'s 报告时间 renders as YYYY-MM-DD HH:mm:ss', async () => {
    await mount(readyStatus())
    await waitFor(() => {
      expect(screen.getByTestId('baf-test-flow-report-at').textContent).toBe(localStamp(REPORT_AT))
    })
    expect(screen.getByTestId('baf-test-flow-report-at').textContent)
      .toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('no raw wire timestamp survives anywhere on the page', async () => {
    await mount(readyStatus())
    await waitFor(() => {
      expect(screen.getByTestId('baf-test-flow-report-at').textContent).not.toBe('—')
    })
    expect(document.body.textContent).not.toContain(REPORT_AT)
  })
})
