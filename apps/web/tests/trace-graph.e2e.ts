// Web e2e: 轨迹图 tab over the navigation-panes seeded session (replay).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page, Response } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFailed } from 'vitest'
import {
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const NAV_SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/navigation-panes', import.meta.url))
const SEED = join(NAV_SNAPSHOT_DIR, 'seed.jsonl')
const MODE = webSnapshotMode()
const SEED_ID = 'trace-graph-web-e2e'

async function baselineResponse(
  page: Page,
  method: 'session.list' | 'workspace.list',
): Promise<Response> {
  return page.waitForResponse(response => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname === `/api/${method}`
  ), { timeout: 30_000 })
}

async function assertBaselineSucceeded(response: Response, method: string): Promise<void> {
  expect(response.ok(), `${method} baseline HTTP response`).toBe(true)
  const body = await response.json() as { result?: { ok?: unknown } }
  expect(body.result?.ok, `${method} baseline RPC result`).toBe(true)
}

async function ensureSeedOpen(page: Page): Promise<void> {
  const welcome = page.locator('[class*="onboardingOverlay"]')
  if (await welcome.count() > 0) {
    await welcome.getByRole('button').click()
    await welcome.waitFor({ state: 'detached', timeout: 15_000 })
  }
  const chat = page.getByRole('tab', { name: 'Chat', exact: true })
  const searchButton = page.getByRole('button', { name: 'Search sessions' })
  if (await searchButton.getAttribute('aria-expanded') !== 'true') await searchButton.click()
  const search = page.getByPlaceholder('Search sessions', { exact: false })
  if (await chat.count() === 0) {
    await search.fill('WATERFALL')
    const result = page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem')
    await expect.poll(() => result.count(), { timeout: 15_000 }).toBe(1)
    await result.click()
    await chat.waitFor({ timeout: 15_000 })
  }
  await chat.click()
  await page.getByText('FIRST_DONE', { exact: true }).waitFor({ timeout: 15_000 })
  if (await search.inputValue() !== '') {
    await search.fill('')
    await expect.poll(() => search.inputValue(), { timeout: 5_000 }).toBe('')
  }
}

describe.skipIf(MODE === 'record')('web e2e: 轨迹图 tab over seeded navigation session', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole> = { warnings: [], pageErrors: [] }

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    const sessionCwd = join(scaffold.workspaceCwd, 'workspace')
    await mkdir(sessionCwd, { recursive: true })
    await writeFile(join(sessionCwd, 'nav-a.md'), '# alpha nav\n')
    await writeFile(join(sessionCwd, 'nav-b.md'), '# beta nav\n')
    const raw = await readFile(SEED, 'utf8')
    await seedSession(scaffold, raw, SEED_ID)
    browser = await chromium.launch()
  }, 120_000)

  beforeEach(async () => {
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    const sessionBaseline = baselineResponse(page, 'session.list')
    const workspaceBaseline = baselineResponse(page, 'workspace.list')
    const [, sessionResponse, workspaceResponse] = await promise.all([
      page.goto(scaffold.baseUrl, { waitUntil: 'load' }),
      sessionBaseline,
      workspaceBaseline,
    ])
    await Promise.all([
      assertBaselineSucceeded(sessionResponse, 'session.list'),
      assertBaselineSucceeded(workspaceResponse, 'workspace.list'),
    ])
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await ensureSeedOpen(page)
  }, 60_000)

  afterEach(async () => {
    expect(tripwire.pageErrors, 'pageerror').toEqual([])
    await page?.close()
  })

  afterAll(async () => {
    await browser?.close()
    await scaffold?.dispose()
  })

  onTestFailed(async () => {
    if (page !== undefined) await saveFailureShot(page, 'trace-graph')
  })

  it('opens the Trace Graph tab, shows stats, and switches turns', async () => {
    const tab = page.getByRole('tab', { name: 'Trace Graph', exact: true })
    await expect(tab).toBeVisible({ timeout: 15_000 })
    await tab.click()
    await expect(page.locator('[data-trace-graph-view]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-trace-graph-stats]')).toContainText('Model calls')
    await expect(page.locator('[data-trace-graph-stats]')).toContainText('Tool calls')
    const turns = page.locator('[data-trace-graph-turns] [role="option"]')
    await expect.poll(() => turns.count(), { timeout: 15_000 }).toBeGreaterThan(0)
    await turns.first().click()
    await expect(page.locator('[data-trace-graph-pipeline]')).toBeVisible()
    await expect(page.locator('[data-trace-graph-step]').first()).toBeVisible({ timeout: 15_000 })
  }, 60_000)
})
