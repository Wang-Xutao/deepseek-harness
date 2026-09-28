// 【变更】2026-09-28 ten-issue batch acceptance smoke (bounded, read-only).
// Opens demo-21's two history sessions directly from the sidebar and checks:
// 3) bug-fix change rail carries checklist.md + 已裁剪 rows; 5) plain wheel
// pans the flow graph vertically; 4) 变更总览 rows show real token counts;
// 7) each session's workflow tab shows ITS OWN change graph (cold-log
// derivation); 1) any parked gate card sits in a centered dialog overlay.
// Run from apps/web:  node verify-batch-0928.mjs "<url>"
import { mkdirSync, writeFileSync } from 'node:fs'

const URL = process.argv[2] ?? 'http://127.0.0.1:3080'
const OUT = 'D:/Source/baf-codingplugin/bafdsh/deepseek-harness/tmp/verify-0928'
mkdirSync(OUT, { recursive: true })

const log = []
const note = (kind, data) => {
  const entry = { t: new Date().toISOString().slice(11, 23), kind, ...data }
  log.push(entry)
  console.log(JSON.stringify(entry))
  writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 2), 'utf-8')
}
const FAILS = []
const check = (name, ok, extra = {}) => {
  note(ok ? 'PASS' : 'FAIL', { name, ...extra })
  if (!ok) FAILS.push(name)
}

const { chromium } = await import('playwright')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1600, height: 1000 } })
page.on('pageerror', e => note('pageerror', { text: String(e).slice(0, 300) }))
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {})

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)

// ---------- helpers ----------
const openSession = async title => {
  // Sidebar rows come first in the DOM; .first() picks the sidebar copy when
  // the conversation area repeats the title.
  const row = page.getByText(title, { exact: true }).first()
  await row.waitFor({ timeout: 10000 })
  await row.click()
  await page.locator('[data-composer-input][contenteditable="true"]').waitFor({ timeout: 20000 })
  await page.waitForTimeout(2500)
}
const openWorkflowTab = async () => {
  const tab = page.getByRole('tab', { name: /^(工作流|Workflow)$/ })
  await tab.first().waitFor({ timeout: 15000 })
  await tab.first().click()
  await page.waitForTimeout(3000)
  const graph = page.locator('[role="img"][aria-label="BAF go 工作流图"]')
  if (await graph.count() === 0) return null
  return graph
}

// ---------- session A: 增加ECUM用法Demo (bug-fix change) ----------
await openSession('增加ECUM用法Demo')
await shot('01-session-ecum-demo')
const graphA = await openWorkflowTab()
check('tab.graph-mounted-A', graphA !== null)
if (graphA !== null) {
  await shot('02-workflow-A')
  // issue 3: rail parity — checklist row + bug-fix clipped rows
  var railTextA = await page.locator('section[aria-label="阶段产物"]').first().innerText().catch(() => '')
  check('rail.checklist-row', /checklist\.md/.test(railTextA), { rail: railTextA.slice(0, 500) })
  var clippedA = (railTextA.match(/已裁剪/g) ?? []).length
  check('rail.clipped-rows', clippedA >= 2, { clippedCount: clippedA })
  // issue 5: plain wheel pans vertically
  const worldTransform = async () => graphA.first().evaluate(node => {
    let cur = node
    while (cur !== null && !(cur instanceof HTMLElement && cur.style.transform !== '')) cur = cur.parentElement
    return cur?.style.transform ?? 'none'
  })
  const before = await worldTransform()
  await graphA.first().hover()
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(400)
  const after = await worldTransform()
  check('wheel.pans-vertically', before !== after, { before, after })
  await page.mouse.wheel(0, -600)
  await shot('03-rail-A')
}

// issue 1 (opportunistic): parked gate card renders as centered dialog
const overlay = page.locator('[data-baf-gate-card][role="dialog"]')
if (await overlay.count() > 0) {
  const box = await overlay.first().boundingBox()
  const vp = page.viewportSize()
  const centered = box !== null && vp !== null && Math.abs((box.x + box.width / 2) - vp.width / 2) < 40
  check('gate-card.centered-dialog', centered, { box, vp })
  await shot('04-gate-overlay')
} else {
  note('skip', { name: 'gate-card.centered-dialog', reason: 'no parked gate in this session' })
}

// ---------- issue 4: 变更总览 tokens ----------
const dashBtn = page.getByRole('button', { name: /^变更总览$/ })
if (await dashBtn.count() > 0) {
  await dashBtn.first().click()
  await page.waitForTimeout(3000)
  const dashText = await page.locator('[aria-label="变更总览"]').first().innerText()
    .catch(() => page.evaluate(() => document.body.innerText))
  const tokenCount = ([...dashText.matchAll(/\d+(?:\.\d+)?K/g)]).length
  check('dashboard.tokens-real', tokenCount > 0, { tokenCount, head: String(dashText).slice(0, 400) })
  await shot('05-dashboard')
  await page.keyboard.press('Escape').catch(() => {})
  await page.getByRole('button', { name: /^(关闭|Close)$/ }).first().click().catch(() => {})
  await page.waitForTimeout(800)
} else {
  note('skip', { name: 'dashboard.tokens-real', reason: '变更总览 button not found on this surface' })
}

// ---------- session B: 重构ECUM代码 — ITS OWN graph (issue 7) ----------
await openSession('重构ECUM代码')
await shot('06-session-refactor')
const graphB = await openWorkflowTab()
check('tab.graph-mounted-B', graphB !== null)
if (graphB !== null) {
  await shot('07-workflow-B')
  // The Tab prints no change id in visible text; the RAIL SHAPE discriminates:
  // session A drove the bug-fix change (bug-record.md + 已裁剪 rows), session B
  // drove the full-go change (proposal.md, no clipped rows). If B still showed
  // the workspace-ranked graph, its rail would repeat A's bug-fix shape.
  const railB = await page.locator('section[aria-label="阶段产物"]').first().innerText().catch(() => '')
  const clippedB = (railB.match(/已裁剪/g) ?? []).length
  check('session.bound-graph-differs',
    /proposal\.md/.test(railB) && clippedB === 0 && /bug-record\.md/.test(railTextA) && clippedA > 0,
    { railB: railB.slice(0, 500), clippedB, railA: railTextA.slice(0, 200), clippedA })
}

note('summary', { checks: log.filter(e => e.kind === 'PASS' || e.kind === 'FAIL').length, fails: FAILS })
await browser.close()
process.exit(FAILS.length > 0 ? 1 : 0)
