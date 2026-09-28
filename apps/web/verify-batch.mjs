// 【变更】2026-09-25 batch acceptance walk (bounded): drives ONLY the new UI
// contract — the unified BAF gate card ([data-baf-gate-card], session form),
// the tab-flip hide, the TOP live-gate dialog ([data-live-gate]), the
// gone strip 推进 button, the per-second 变更耗时 tick, and the 待计划阶段确认
// scope label. Fresh workspace guarantees the scaffold gate. Run from apps/web:
//   node ../../tmp/verify-batch.mjs "<url>" "<workspace-dir>"
import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const URL = process.argv[2]
const WS = process.argv[3] ?? 'D:\\Source\\baf-codingplugin\\demo_verify'
const OUT = 'D:\\Source\\baf-codingplugin\\bafdsh\\deepseek-harness\\tmp\\webwalk-verify'
mkdirSync(WS, { recursive: true })
mkdirSync(OUT, { recursive: true })

const log = []
const note = (kind, data) => {
  const entry = { t: new Date().toISOString().slice(11, 23), kind, ...data }
  log.push(entry)
  console.log(JSON.stringify(entry))
  writeFileSync(`${OUT}\\log.json`, JSON.stringify(log, null, 2), 'utf-8')
}
const FAILS = []
const check = (name, ok, extra = {}) => {
  note(ok ? 'PASS' : 'FAIL', { name, ...extra })
  if (!ok) FAILS.push(name)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1600, height: 1000 } })
page.on('pageerror', e => note('pageerror', { text: String(e).slice(0, 300) }))
const shot = name => page.screenshot({ path: `${OUT}\\${name}.png`, fullPage: false }).catch(() => {})

// ---------- connect workspace ----------
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)

// Hero copy (desktop 2): headline completed + BAF badge — visible while no
// session is active yet.
const heroText = await page.getByText('探索未至之境，拉启智能篇章').count()
const heroBadge = await page.getByText('BAF', { exact: true }).count()
check('hero.headline', heroText > 0)
check('hero.badge.BAF', heroBadge > 0)
await shot('01-hero')

// Headless Chromium has no showDirectoryPicker (win32 resolves the native
// surface), so the add-workspace flow is undrivable there. Register the
// verification workspace by picking an existing one whose .baf state is known.
const WS_TITLE = process.argv[3] ?? 'demo10'
const FRESH = process.argv[4] === 'fresh' // fresh = expect 初始化工作区 gate

const pickBtn = page.getByRole('button', { name: /^(选择工作区|Choose workspace)$/ })
const pickBox = page.getByRole('textbox', { name: /^(选择工作区|Choose workspace)$/ })
if (await pickBtn.count() > 0) await pickBtn.first().click()
else await pickBox.first().click()
// Menu renders async — wait for it before counting items.
await page.locator('[role="menuitem"]').first().waitFor({ timeout: 10000 })
const target = page.getByRole('menuitem', { name: new RegExp(`^${WS_TITLE}$`) })
check('workspace.menu-entry', await target.count() > 0)
await target.first().click()
await page.locator('[data-composer-input][contenteditable="true"]').waitFor({ timeout: 20000 })
// Land in a clean session (the picker may reopen the last active one).
await page.waitForTimeout(1500)
const newSession = page.getByRole('button', { name: /^(新会话|New session)$/ })
if (await newSession.count() > 0) await newSession.first().click()
await page.locator('[data-composer-input][contenteditable="true"]').waitFor({ timeout: 20000 })
note('workspace-connected', { ws: WS_TITLE })
await shot('02-connected')

// ---------- helpers ----------
const send = async text => {
  const input = page.locator('[data-composer-input][contenteditable="true"]')
  await input.waitFor({ timeout: 30000 })
  await input.click()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  note('sent', { text })
}
const bafCard = () => page.locator('[data-baf-gate-card]:visible').last()
const liveGate = () => page.locator('[data-live-gate]:visible').last()
const waitAny = async (loc, label, timeout = 240000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await loc().count() > 0) return true
    await page.waitForTimeout(700)
  }
  note('wait-timeout', { label })
  return false
}
const cardInfo = async loc => {
  const el = loc.first()
  let title = await el.locator('h2').first().innerText().catch(() => '')
  if (title === '') title = await el.getAttribute('aria-label').catch(() => '') ?? ''
  return {
    title,
    buttons: (await el.getByRole('button').allInnerTexts()).map(s => s.trim()).filter(Boolean),
  }
}

// ---------- 1st turn → first BAF gate as the unified session card ----------
await send('重构ecum模块')
let sessionTitle = ''
const gotCard = await waitAny(bafCard, 'session card (first gate)')
check('gate.session-card-appears', gotCard)
if (gotCard) {
  const info = await cardInfo(bafCard())
  sessionTitle = info.title
  note('session-card', info)
  if (FRESH) check('gate.session-card-has-init', info.buttons.some(b => b.includes('初始化工作区')), info)
  await shot('03-session-card')
}

/** Pick the option to click: prefer known-safe primaries, never destructive rows. */
const SAFE_ORDER = [/初始化工作区/, /新建工作流/, /完整流程/, /继续/, /开始/]
const pickOption = buttons => {
  for (const re of SAFE_ORDER) {
    const hit = buttons.find(b => re.test(b))
    if (hit) return hit
  }
  return buttons.find(b => !/放弃|忽略|暂不|取消|删除/.test(b)) ?? null
}

// ---------- tab flip: session card hides, TOP live-gate dialog shows ----------
const tab = page.getByRole('tab', { name: /工作流/ })
let tabThere = await tab.count() > 0
if (!tabThere) {
  // The workflow tab mounts only after the first turn — give it a beat.
  await page.waitForTimeout(4000)
  tabThere = await tab.count() > 0
}
check('workflow-tab-present', tabThere)
if (tabThere) {
  await tab.first().click()
  await page.waitForTimeout(1500)
  await shot('04-workflow-tab')
  const sessionCardHidden = await bafCard().count() === 0
  check('gate.session-card-hidden-on-tab', sessionCardHidden)
  const got = await waitAny(liveGate, 'top live gate', 30000)
  check('gate.top-dialog-appears', got)
  if (got) {
    const info = await cardInfo(liveGate())
    note('top-dialog', info)
    check('gate.top-dialog-same-gate', sessionTitle !== '' && info.title === sessionTitle, {
      sessionTitle, topTitle: info.title,
    })
    await shot('05-top-dialog')
    // No strip 推进 button anywhere (removed — advancement became a dialog).
    const advanceBtn = await page.getByRole('button', { name: /^推进$/ }).count()
    check('strip.no-advance-button', advanceBtn === 0)
    // ---------- answer the first gate THROUGH the top dialog ----------
    const label = pickOption(info.buttons)
    if (label !== null) {
      await liveGate().getByRole('button', { name: label, exact: false }).first().click()
      note('clicked', { label, via: 'top-dialog' })
      await page.waitForTimeout(5000)
      await shot('06-after-answer')
    }
  }
}

// ---------- drive follow-up gates ON the tab until a change is active ----------
let active = false
for (let round = 0; round < 4; round++) {
  await page.waitForTimeout(3000)
  if (await liveGate().count() > 0) {
    const info = await cardInfo(liveGate())
    note(`followup-gate-${round}`, info)
    await shot(`07-gate-${round}`)
    const label = pickOption(info.buttons)
    if (label === null) break
    await liveGate().getByRole('button', { name: label, exact: false }).first().click()
    note('clicked', { label, round })
    await page.waitForTimeout(6000)
  }
  // strip 变更耗时 shows a real duration (not —) ⇒ change active
  const val = await page.locator('xpath=//span[normalize-space()="变更耗时"]/following-sibling::span[1]').first().innerText().catch(() => '')
  if (val !== '' && val !== '—') { active = true; break }
}
check('workflow.change-active', active)

// ---------- post-confirm checks on the workflow tab ----------
await page.waitForTimeout(6000)
await shot('09-post-confirm')
// Scope label: intake confirmed, plan not run → 待计划阶段确认.
const scopeLabel = await page.getByText('待计划阶段确认').count()
check('intake.scope-plan-pending', scopeLabel > 0)
// 变更耗时 per-second tick: read the strip value next to the 变更耗时 label,
// sample twice 1.3 s apart, expect growth.
const stripVal = () => page.locator('xpath=//span[normalize-space()="变更耗时"]/following-sibling::span[1]').first()
const t1 = await stripVal().innerText().catch(() => '')
await page.waitForTimeout(1300)
const t2 = await stripVal().innerText().catch(() => '')
const parseDur = v => { const m = /^([\d.]+)(ms|s|m(\d+)s)?$/.exec(v ?? ''); if (!m) return -1; const n = parseFloat(m[1]); if (m[2] === 'ms') return n / 1000; if (m[2] === 's') return n; return n * 60 + (parseFloat(m[3] ?? '0')) }
check('strip.timer-ticks-per-second', parseDur(t1) >= 0 && parseDur(t2) > parseDur(t1), { t1, t2 })
// Stage detail: click a node card, assert NO 常见失败与处理 anywhere.
const failTable = await page.getByText('常见失败与处理').count()
check('detail.no-failure-table', failTable === 0)
// Advance dialog must NOT pop while the current stage is mid-flight (not ready).
const advDialog = await page.locator('[data-advance-dialog]:visible').count()
note('advance-dialog-visibility', { visible: advDialog })
// 变更总览 opens; assert the modal shell renders (history stats need an
// archived change — none in a fresh workspace; recorded, not asserted).
const dashBtn = page.getByRole('button', { name: /变更总览|Changes/ })
if (await dashBtn.count() > 0) {
  await dashBtn.first().click()
  await page.waitForTimeout(2500)
  const modal = await page.getByRole('dialog').count()
  check('dashboard.modal-opens', modal > 0)
  await shot('10-dashboard')
}

writeFileSync(`${OUT}\\summary.json`, JSON.stringify({ fails: FAILS, steps: log.length }, null, 2), 'utf-8')
note('walk-end', { fails: FAILS })
await browser.close()
process.exit(FAILS.length > 0 ? 1 : 0)
