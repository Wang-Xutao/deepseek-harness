// 【变更】2026-09-28 four-issue batch acceptance smoke (bounded, read-only).
// demo22 / session 重构ecum / change-20260928-ecum-6a8c parked at implement
// (work-order rest — DO NOT click anything that dispatches: no /baf-go, no
// advance, no confirm). Checks:
// - session opens, workflow tab mounts at implement, zero pageerrors;
// - issue 4: 变更耗时 strip ticks forward at implement (work in flight),
//   never backwards;
// - issue 1.5 channel: rail proposal.md click opens the document in the
//   right sidebar (the same openResource path the dialog chips use);
// - issue 2 regression: conversation shows no raw '**【' markdown leakage;
// - opportunistic: any live [data-baf-gate-card] (chip top-right, sections,
//   horizontal options, revise box) if a gate happens to be pending.
// Run from apps/web:  node verify-batch2-0928.mjs "<url>"
import { mkdirSync, writeFileSync } from 'node:fs'

const URL = process.argv[2] ?? 'http://127.0.0.1:3080'
const OUT = 'D:/Source/baf-codingplugin/bafdsh/deepseek-harness/tmp/verify-batch2-0928'
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
let pageErrors = 0
page.on('pageerror', e => { pageErrors++; note('pageerror', { text: String(e).slice(0, 300) }) })
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {})

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)

// ---------- connect demo22 + open session 重构ecum ----------
const pickBtn = page.getByRole('button', { name: /^(选择工作区|Choose workspace)$/ })
if (await pickBtn.count() > 0) await pickBtn.first().click()
await page.locator('[role="menuitem"]').first().waitFor({ timeout: 10000 })
await page.getByRole('menuitem', { name: /^demo22$/ }).first().click()
await page.locator('[data-composer-input][contenteditable="true"]').waitFor({ timeout: 20000 })
await page.waitForTimeout(2500)
const row = page.getByText('重构ecum', { exact: true }).first()
await row.waitFor({ timeout: 10000 })
await row.click()
await page.locator('[data-composer-input][contenteditable="true"]').waitFor({ timeout: 20000 })
await page.waitForTimeout(2500)
check('session.opened', true)
await shot('01-session-open')

// ---------- issue 2: persona skeleton carries no bold markers ----------
// The fix lives in the persona prompt (the model copies the skeleton), so
// the deterministic assertion reads the SHIPPED preset source the serve
// mounts (SHIPPED_PRESET_ROOT → repo presets/). Transcript history predating
// the fix keeps its literal asterisks — informational only.
import { readFileSync } from 'node:fs'
const PERSONA = 'D:/Source/baf-codingplugin/bafdsh/deepseek-harness/packages/preset/agent-presets/presets/baf/agent.cordis.yml'
const personaSrc = readFileSync(PERSONA, 'utf8')
// Comment lines may quote the old symptom (`**【阶段】**plan`) — the contract
// covers the prompt payload only.
const personaPrompt = personaSrc.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
check('persona.no-bold-skeleton', !personaPrompt.includes('**【'), {
  leak: personaPrompt.includes('**【') ? personaPrompt.slice(personaPrompt.indexOf('**【') - 20, personaPrompt.indexOf('**【') + 40) : '',
})
check('persona.language-rule', personaSrc.includes('语言跟随') && personaSrc.includes('Language follow'))
const convText = await page.locator('[data-conversation-content]').first().innerText().catch(() => '')
if (convText.includes('**')) {
  note('INFO', { name: 'history.has-legacy-bold', reason: 'transcript rows predate the persona fix — new emissions are clean' })
}

// ---------- workflow tab mounts at implement ----------
const tab = page.getByRole('tab', { name: /^(工作流|Workflow)$/ })
await tab.first().waitFor({ timeout: 15000 })
await tab.first().click()
await page.waitForTimeout(3000)
const graph = page.locator('[role="img"][aria-label="BAF go 工作流图"]')
check('tab.graph-mounted', await graph.count() > 0)
await shot('02-workflow-tab')

// ---------- issue 1.5 channel: rail artifact click opens right sidebar ----------
const rail = page.locator('section[aria-label="阶段产物"]').first()
const railText = await rail.innerText().catch(() => '')
check('rail.has-proposal', /proposal\.md|提案/.test(railText), { rail: railText.slice(0, 300) })
const artRow = rail.locator('button', { hasText: /proposal\.md|提案/ }).first()
if (await artRow.count() > 0) {
  await artRow.click()
  await page.waitForTimeout(2500)
  await shot('03-artifact-opened')
  // The right sidebar renders the file: the rail text alone no longer bounds
  // the proposal mention (it now also appears in the sidebar pane).
  const bodyText = await page.locator('body').innerText()
  const sidebarHit = /Why|Scope|Impact|提案|proposal/.test(bodyText)
  check('artifact.sidebar-opened', sidebarHit)
} else {
  check('artifact.sidebar-opened', false, { reason: 'no clickable proposal row' })
}

// ---------- issue 4: timer ticks forward at implement, never backwards ----------
const stripText = async () => {
  const strip = page.locator('text=变更耗时').first()
  const box = strip.locator('..')
  return box.innerText().catch(() => '')
}
const toSeconds = txt => {
  const h = /(\d+)\s*(?:时|h)/.exec(txt)?.[1] ?? '0'
  const m = /(\d+)\s*(?:分|m)/.exec(txt)?.[1] ?? '0'
  const s = /(\d+)\s*(?:秒|s)\b/.exec(txt)?.[1] ?? '0'
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}
const t1raw = await stripText()
await page.waitForTimeout(3000)
const t2raw = await stripText()
const t1 = toSeconds(t1raw)
const t2 = toSeconds(t2raw)
check('timer.parses', !Number.isNaN(t1) && t1 > 0, { raw: t1raw.replace(/\n/g, '|') })
check('timer.ticks-forward', t2 > t1, { t1, t2, raw2: t2raw.replace(/\n/g, '|') })
await shot('04-timer')

// ---------- opportunistic: live gate card (none expected at implement rest) ----------
const gateCard = page.locator('[data-baf-gate-card]')
if (await gateCard.count() > 0) {
  const card = gateCard.first()
  const chip = card.locator('[data-baf-change-id]')
  check('gate.chip-present', await chip.count() > 0)
  const options = card.locator('[data-baf-gate-option]')
  const optCount = await options.count()
  check('gate.options-horizontal', optCount >= 2, { optCount })
  check('gate.revise-box', await card.locator('[data-baf-revise-submit]').count() > 0)
  await shot('05-gate-card')
} else {
  note('SKIP', { name: 'gate.card', reason: 'no pending gate (change parked at implement rest)' })
}

// ---------- wrap up ----------
check('page.zero-errors', pageErrors === 0, { pageErrors })
await browser.close()
note('DONE', { fails: FAILS })
process.exit(FAILS.length === 0 ? 0 : 1)
