// 【变更】2026-09-25 focused timer verification: prove the 变更耗时 strip
// ticks every second while a stage window is open (post computedAt-anchor
// fix), and never steps backwards across 2 s polls. Prerequisite: an active
// change parked at a gate (abandoned here first for a clean run).
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const URL = process.argv[2]
const OUT = 'D:\\Source\\baf-codingplugin\\bafdsh\\deepseek-harness\\tmp\\webwalk-verify'
mkdirSync(OUT, { recursive: true })

const log = []
const FAILS = []
const note = (kind, data) => {
  const entry = { t: new Date().toISOString().slice(11, 23), kind, ...data }
  log.push(entry)
  console.log(JSON.stringify(entry))
  writeFileSync(`${OUT}\\timer-log.json`, JSON.stringify(log, null, 2), 'utf-8')
}
const check = (name, ok, extra = {}) => {
  note(ok ? 'PASS' : 'FAIL', { name, ...extra })
  if (!ok) FAILS.push(name)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1600, height: 1000 } })
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(6000)

// connect demo10 + fresh session
const pickBtn = page.getByRole('button', { name: /^(选择工作区|Choose workspace)$/ })
if (await pickBtn.count() > 0) await pickBtn.first().click()
await page.locator('[role="menuitem"]').first().waitFor({ timeout: 10000 })
await page.getByRole('menuitem', { name: /^demo10$/ }).first().click()
await page.locator('[data-composer-input][contenteditable="true"]').waitFor({ timeout: 20000 })
await page.waitForTimeout(1500)
const ns = page.getByRole('button', { name: /^(新会话|New session)$/ })
if (await ns.count() > 0) await ns.first().click()
await page.locator('[data-composer-input][contenteditable="true"]').waitFor({ timeout: 20000 })
note('connected', {})

const stripVal = () => page.locator('xpath=//span[normalize-space()="变更耗时"]/following-sibling::span[1]').first()
const readStrip = async () => stripVal().innerText().catch(() => '')
const parseDur = v => {
  const m = /^([\d.]+)(ms|s|m(\d+)s)?$/.exec(v ?? '')
  if (!m) return -1
  const n = parseFloat(m[1])
  if (m[2] === 'ms') return n / 1000
  if (m[2] === undefined || m[2] === 's') return n
  return n * 60 + (parseFloat(m[3] ?? '0'))
}

// open the workflow tab
const tab = page.getByRole('tab', { name: /工作流/ })
if (await tab.count() === 0) {
  const input = page.locator('[data-composer-input][contenteditable="true"]')
  await input.click(); await page.keyboard.type('hi'); await page.keyboard.press('Enter')
  await page.waitForTimeout(4000)
}
await tab.first().click()
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}\\timer-01-tab.png` })

// abandon any active change for a clean slate. The confirm renders as a
// `.WLjZYq_dashboardBackdrop` modal WITHOUT role=dialog (probed 2026-09-25),
// and a [data-live-gate] card may sit on the tab UNDERNEATH it — answer only
// the topmost BACKDROP here, never the live gate.
const backdropCount = async () => page.locator('.WLjZYq_dashboardBackdrop:visible').count()
const answerBackdrop = async () => {
  const root = page.locator('.WLjZYq_dashboardBackdrop:visible').last()
  if ((await root.count()) === 0) return false
  const confirm = root.getByRole('button', { name: /^(确认放弃|放弃变更|确认|放弃|确定)/ }).first()
  const anyOpt = root.getByRole('button', { name: /^(?!取消|关闭)/ }).first()
  const btn = (await confirm.count()) > 0 ? confirm : (await anyOpt.count()) > 0 ? anyOpt : null
  if (btn === null) return false
  await btn.click({ timeout: 5000 })
  return true
}
for (let round = 0; round < 3; round++) {
  const abandon = page.getByRole('button', { name: /放弃此变更/ })
  if ((await abandon.count()) === 0) break
  if (!(await abandon.first().isVisible())) break
  await abandon.first().click({ timeout: 5000 })
  // the confirm renders async — give it up to 8 s
  for (let i = 0; i < 16 && (await backdropCount()) === 0; i++) await page.waitForTimeout(500)
  if ((await backdropCount()) > 0) { await answerBackdrop(); note('abandon-confirm', {}) }
  // wait for the backdrop to detach; keep answering follow-ups it spawns
  for (let i = 0; i < 20; i++) {
    if ((await backdropCount()) === 0) break
    await page.waitForTimeout(500)
    if (i % 4 === 3) { await answerBackdrop(); note('abandon-confirm-extra', {}) }
  }
  await page.waitForTimeout(1500)
}
note('abandoned', {})
await page.screenshot({ path: `${OUT}\\timer-02-after-abandon.png` })
// force-dismiss any lingering backdrop before touching the composer
for (let i = 0; i < 3 && (await backdropCount()) > 0; i++) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1200)
}

// send a real requirement → intake/classify window opens
const input = page.locator('[data-composer-input][contenteditable="true"]')
await input.click()
await page.keyboard.type('重构ecum模块的handler层')
await page.keyboard.press('Enter')
note('sent', {})

// gate may pop (session form) — answer 新需求 via the tab top dialog. A
// generic 选择卡 backdrop (business question) may also pop ABOVE the tab and
// block clicks — answer it first (option 1 + 提交). IMPORTANT: check the strip
// BEFORE answering anything — answering the 分类确认 gate closes the intake
// window (correct semantics), and we want it still open while sampling.
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(3000)
  const v = await readStrip()
  // break only on GROWTH — a parked/terminal leftover change paints a flat
  // non-zero value (8m38s run) that would false-trigger a presence check
  if (v !== '' && v !== '—' && parseDur(v) > 0) {
    await page.waitForTimeout(1200)
    const v2 = await readStrip()
    if (v2 !== '' && v2 !== '—' && parseDur(v2) > parseDur(v)) {
      note('stage-running', { from: v, to: v2 })
      break
    }
  }
  if ((await backdropCount()) > 0) {
    const root = page.locator('.WLjZYq_dashboardBackdrop:visible').last()
    const opt = root.getByRole('button', { name: /^1[.、) ]?|^1/ }).first()
    const submit = root.getByRole('button', { name: /^(提交|确认|确定)/ }).first()
    if ((await opt.count()) > 0) { await opt.click(); await page.waitForTimeout(500) }
    if ((await submit.count()) > 0) { await submit.click(); note('dialog-answered', {}) }
    continue
  }
  const live = page.locator('[data-live-gate]:visible')
  if (await live.count() > 0) {
    const btn = live.getByRole('button', { name: /作为新需求开始|新建工作流|继续推进现有变更|完整流程|确认提案|继续|开始/ }).first()
    if (await btn.count() > 0) {
      await btn.click()
      note('gate-answered', {})
    }
  }
}

// THE check: sample the strip ~1.15 s apart, 6 times — per-second growth while
// a stage runs, and never backwards.
const samples = []
for (let i = 0; i < 6; i++) {
  const v = await readStrip()
  samples.push({ i, v, ms: parseDur(v) })
  await page.waitForTimeout(1150)
}
note('samples', { samples })
const valid = samples.filter(s => s.ms >= 0)
let monotonic = true
let growth = 0
for (let i = 1; i < valid.length; i++) {
  if (valid[i].ms < valid[i - 1].ms) monotonic = false
  if (valid[i].ms > valid[i - 1].ms) growth++
}
check('timer.never-backwards', monotonic, { samples: valid.map(s => s.v) })
check('timer.per-second-growth', growth >= 3, { growth, samples: valid.map(s => s.v) })
await page.screenshot({ path: `${OUT}\\timer-03-strip.png` })

note('walk-end', { fails: FAILS })
await browser.close()
process.exit(FAILS.length > 0 ? 1 : 0)
