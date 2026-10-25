#!/usr/bin/env node
/**
 * 版本更新探针（常驻回归）。
 *
 * 探的是「有更新时用户到底看到什么、点下去到底发生什么」这条链：
 *   通道检查 → 应用内更新弹窗 → 设置按钮的更新标签 → 真正落地的更新。
 *
 * 产品代码一行不改：
 *  - 通道地址写死在产品里（api.github.com + 仓库坐标），所以探针起一个本地假
 *    GitHub API，用 NODE_OPTIONS=--require 把指向 api.github.com 的请求改写过去
 *    （overlay/scripts/verify-update-prompt-fetch.cjs）；
 *  - 签名：探针跑的是开发态外壳，签名策略允许显式跳过（BAF_UPDATE_ALLOW_UNSIGNED=1），
 *    所以探针不依赖本机那把未入库的测试私钥；打包态拒绝测试 key 是产品策略，
 *    不是探针要绕过的东西。
 *
 * 三种变体：
 *   optional  可选更新（桌面安装器）—— 弹窗、文案、分段、设置标签、稍后更新关闭
 *   forced    强制更新 —— 标题、不可关闭、退出按钮
 *   apply     可选更新真的落地（插件热替换）—— 下载 + sha256 校验 + 解压 + 原子换目录
 *
 * Usage: node overlay/scripts/verify-update-prompt.mjs [optional|forced|apply]
 *        [cdpPort=9241] [inspectPort=9242]
 *
 * 名字用 `verify-` 而不是 `probe-`：overlay/.gitignore 把 `scripts/probe-*` 当成
 * 一次性调试产物（留在磁盘、不入库），而 `scripts/verify-*.mjs` 是入库的常驻
 * 验证脚本 —— 这个探针既然要当常驻回归用，就该能被下一个人从仓库里跑起来。
 */
import { spawn, execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const overlayRoot = resolve(scriptDir, '..')
const repoRoot = resolve(overlayRoot, '..')
const desktopDir = join(overlayRoot, 'desktop')
const pluginDir = join(overlayRoot, 'plugin')
const OUT = join(scriptDir, 'out')
const WORK = join(repoRoot, 'tmp', 'verify-update-prompt')

const variant = process.argv[2] ?? 'optional'
const cdpPort = process.argv[3] ?? '9241'
const inspectPort = process.argv[4] ?? '9242'
if (!['optional', 'forced', 'apply'].includes(variant)) {
  console.error(`unknown variant: ${variant} (expected optional | forced | apply)`)
  process.exit(2)
}

mkdirSync(OUT, { recursive: true })
mkdirSync(WORK, { recursive: true })

const sleep = ms => new Promise(r => setTimeout(r, ms))
const productVersions = JSON.parse(readFileSync(join(desktopDir, 'resources', 'dsh', 'baf-product-versions.json'), 'utf8'))
const notes = JSON.parse(readFileSync(join(desktopDir, 'version-notes.json'), 'utf8'))
const pluginManifest = JSON.parse(readFileSync(join(pluginDir, 'plugin-manifest.json'), 'utf8'))

const out = { fail: [], skipped: [], info: {} }
const check = (ok, label, detail) => {
  if (!ok) out.fail.push(`${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
}

/**
 * The shell persists the releaseEpoch it last applied and refuses a manifest
 * below it, and a real channel ships a new manifest whenever it releases — so
 * the mock channel publishes a NEW epoch on every check instead of re-serving
 * one manifest forever. The counter lives on disk because the shell's applied-
 * epoch ledger lives in the user data, which also survives between runs; a
 * counter that restarted at zero would be below what the shell already applied.
 */
const EPOCH_BASE = 1000000
const epochFile = join(WORK, 'release-epoch.json')
let epochCounter = 0
try {
  epochCounter = Number.parseInt(readFileSync(epochFile, 'utf8'), 10) || 0
} catch { /* first run */ }

/**
 * Take the next release epoch for a served manifest.
 * @returns {number} an epoch larger than every epoch served before.
 */
function nextReleaseEpoch() {
  epochCounter += 1
  writeFileSync(epochFile, String(epochCounter), 'utf8')
  return EPOCH_BASE + epochCounter
}

/**
 * Bump a semver's patch part by one.
 * @param {string} version - the current version.
 * @returns {string} the next patch version.
 */
function bump(version) {
  const parts = String(version).split('.')
  const patch = Number.parseInt(parts[2] ?? '0', 10)
  parts[2] = String(Number.isFinite(patch) ? patch + 1 : 1)
  return parts.join('.')
}

/**
 * Pack the plugin with a bumped version into a real zip (the same recipe the
 * release packer uses), so the apply path downloads, verifies and extracts
 * genuine bytes.
 * @param {string} targetVersion - the version the packed plugin claims.
 * @returns {{ name: string, sha256: string, size: number, bytes: Buffer }} the artifact.
 */
function buildPluginArtifact(targetVersion) {
  const stage = join(WORK, 'plugin-stage')
  rmSync(stage, { recursive: true, force: true })
  cpSync(pluginDir, stage, { recursive: true })
  const manifest = JSON.parse(readFileSync(join(stage, 'plugin-manifest.json'), 'utf8'))
  manifest.version = targetVersion
  writeFileSync(join(stage, 'plugin-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const name = `baf-plugin-${targetVersion}.zip`
  const zipPath = join(WORK, name)
  rmSync(zipPath, { force: true })
  // bsdtar creates the zip from the extension; Windows' tar has no
  // --force-local, so the flag is left to the GNU tar path.
  const tarArgs = process.platform === 'win32'
    ? ['-a', '-cf', zipPath, '-C', stage, '.']
    : ['-a', '--force-local', '-cf', zipPath, '-C', stage, '.']
  const tar = spawnSync('tar', tarArgs, { stdio: 'inherit' })
  if (tar.status !== 0) throw new Error('tar failed to pack the plugin zip')
  const bytes = readFileSync(zipPath)
  return { name, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.byteLength, bytes }
}

const pluginArtifact = variant === 'apply' ? buildPluginArtifact(bump(pluginManifest.version)) : undefined

/**
 * Build the channel manifest for one variant.
 * @param {string} kind - the variant name.
 * @returns {object} the manifest object.
 */
function buildManifest(kind) {
  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + 90 * 24 * 60 * 60 * 1000)
  const manifest = {
    schema: 2,
    channel: 'stable',
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    releaseEpoch: EPOCH_BASE,
    tag: 'baf-dsh-v0.0.51',
    bafDsh: productVersions.bafDsh,
    dsh: productVersions.dsh,
    bafPlugin: productVersions.bafPlugin,
    bafPreset: pluginManifest.version,
    baseline: pluginManifest.baseline ?? 'std-c',
    presetSchema: pluginManifest.presetSchema ?? 1,
    minShell: productVersions.bafDsh,
    compatibility: { minDsh: productVersions.dsh, maxDsh: '*' },
    force: false,
    notesZh: notes.desktop?.notesZh ?? '',
    artifacts: {},
    systemResources: ['presets/baf'],
    rollback: { supported: true, minimumVersion: '0.0.1' },
    signature: { algorithm: 'ed25519', keyId: 'baf-test-2026q4', asset: 'manifest.sig' },
  }
  if (kind === 'apply') {
    manifest.bafPlugin = pluginArtifact.name.replace('baf-plugin-', '').replace('.zip', '')
    manifest.artifacts.plugin = {
      name: pluginArtifact.name,
      sha256: pluginArtifact.sha256,
      size: pluginArtifact.size,
    }
    return manifest
  }
  manifest.bafDsh = bump(productVersions.bafDsh)
  manifest.tag = `baf-dsh-v${manifest.bafDsh}`
  manifest.artifacts.shell = {
    name: `baf-dsh-Setup-${manifest.bafDsh}.exe`,
    sha256: 'a'.repeat(64),
    size: 1024,
  }
  if (kind === 'forced') {
    manifest.force = true
    manifest.minShell = manifest.bafDsh
  }
  return manifest
}

const manifest = buildManifest(variant)

/**
 * Serialize a manifest the way the channel serves it.
 * @param {number} epoch - the release epoch the manifest carries.
 * @returns {Buffer} the manifest bytes.
 */
function manifestBytes(epoch) {
  return Buffer.from(`${JSON.stringify({ ...manifest, releaseEpoch: epoch }, null, 2)}\n`, 'utf8')
}

/**
 * Serve the channel the way GitHub would.
 * @returns {Promise<{ base: string, hits: string[], close: () => Promise<void> }>} the server handle.
 */
async function startMockGithub() {
  const hits = []
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    hits.push(`${req.method} ${url.pathname}`)
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': type })
      res.end(body)
    }
    if (url.pathname.includes('/releases/tags/')) {
      const tag = decodeURIComponent(url.pathname.split('/releases/tags/')[1] ?? '')
      if (tag === 'baf-channel-stable') {
        send(200, JSON.stringify({
          tag_name: tag,
          assets: [
            { id: 1, name: 'manifest.json', browser_download_url: 'https://api.github.com/assets/manifest.json', url: 'https://api.github.com/assets/manifest.json', size: manifestBytes(EPOCH_BASE + epochCounter + 1).length },
            { id: 2, name: 'manifest.sig', browser_download_url: 'https://api.github.com/assets/manifest.sig', url: 'https://api.github.com/assets/manifest.sig', size: 64 },
          ],
        }))
        return
      }
      if (tag === manifest.tag) {
        const assets = pluginArtifact === undefined
          ? [{
              id: 3,
              name: manifest.artifacts.shell.name,
              browser_download_url: 'https://api.github.com/assets/setup.exe',
              url: 'https://api.github.com/assets/setup.exe',
              size: manifest.artifacts.shell.size,
            }]
          : [{
              id: 3,
              name: pluginArtifact.name,
              browser_download_url: `https://api.github.com/assets/${pluginArtifact.name}`,
              url: `https://api.github.com/assets/${pluginArtifact.name}`,
              size: pluginArtifact.size,
            }]
        send(200, JSON.stringify({ tag_name: tag, assets }))
        return
      }
      send(404, JSON.stringify({ message: 'Not Found' }))
      return
    }
    if (url.pathname === '/assets/manifest.json') {
      const body = Buffer.from(
        `${JSON.stringify({ ...manifest, releaseEpoch: nextReleaseEpoch() }, null, 2)}\n`,
        'utf8',
      )
      send(200, body, 'application/octet-stream')
      return
    }
    if (url.pathname === '/assets/manifest.sig') {
      send(200, Buffer.alloc(64, 0x1), 'application/octet-stream')
      return
    }
    if (url.pathname === '/assets/setup.exe') {
      send(200, Buffer.alloc(1024, 0x4d), 'application/octet-stream')
      return
    }
    if (pluginArtifact !== undefined && url.pathname === `/assets/${pluginArtifact.name}`) {
      send(200, pluginArtifact.bytes, 'application/octet-stream')
      return
    }
    send(404, JSON.stringify({ message: 'Not Found' }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    base: `http://127.0.0.1:${address.port}`,
    hits,
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

const mock = await startMockGithub()
console.log('mock github:', mock.base)

try { execFileSync('taskkill', ['/IM', 'electron.exe', '/F'], { stdio: 'ignore' }) } catch { /* nothing running */ }
try { execFileSync('taskkill', ['/IM', 'baf-dsh.exe', '/F'], { stdio: 'ignore' }) } catch { /* nothing running */ }

const userDataDir = join(WORK, `userdata-${variant}`)
rmSync(userDataDir, { recursive: true, force: true })
mkdirSync(userDataDir, { recursive: true })
const dialogLog = join(WORK, `native-dialog-${variant}.jsonl`)
rmSync(dialogLog, { force: true })

const electronExe = join(desktopDir, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!existsSync(electronExe)) {
  console.error(`electron not found: ${electronExe} (run pnpm install in overlay/desktop)`)
  await mock.close()
  process.exit(1)
}

const env = {
  ...process.env,
  NODE_OPTIONS: `--require ${join(scriptDir, 'verify-update-prompt-fetch.cjs')}`,
  BAF_MOCK_GH_BASE: mock.base,
  // Dev build + explicit opt-out: the probe carries no private key, and the
  // packaged build still refuses test keys (that policy is not the probe's to
  // relax).
  BAF_UPDATE_ALLOW_UNSIGNED: '1',
  BAF_DIALOG_LOG: dialogLog,
  ELECTRON_ENABLE_LOGGING: '1',
}
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronExe, [
  '.',
  `--remote-debugging-port=${cdpPort}`,
  `--inspect=${inspectPort}`,
  `--user-data-dir=${userDataDir}`,
], { cwd: desktopDir, stdio: ['ignore', 'pipe', 'pipe'], env })
let logs = ''
child.stdout.on('data', d => { logs += d })
child.stderr.on('data', d => { logs += d })

const cleanup = async () => {
  try { child.kill() } catch { /* already gone */ }
  await mock.close()
}

// ── the main-process inspector: record every native message box ───────────
// The whole point of this batch is that the operating system's box is gone.
// The recorder proves it: any showMessageBox call lands in the log.
let inspector = null
for (let i = 0; i < 60 && inspector === null; i++) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${inspectPort}/json/list`)).json()
    inspector = targets.find(t => t.webSocketDebuggerUrl !== undefined) ?? null
  } catch { /* not up yet */ }
  if (inspector === null) await sleep(500)
}
if (inspector === null) {
  console.error('main-process inspector never came up')
  console.error(logs.slice(-1200))
  await cleanup()
  process.exit(1)
}
const iws = new WebSocket(inspector.webSocketDebuggerUrl)
let iid = 0
const ipending = new Map()
const isend = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++iid
  const timer = setTimeout(() => { ipending.delete(mid); reject(new Error(`inspector timeout ${method}`)) }, 20000)
  ipending.set(mid, { resolve: v => { clearTimeout(timer); resolve(v) }, reject: e => { clearTimeout(timer); reject(e) } })
  iws.send(JSON.stringify({ id: mid, method, params }))
})
iws.onmessage = ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id !== undefined && ipending.has(msg.id)) {
    const { resolve, reject } = ipending.get(msg.id)
    ipending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
await new Promise(r => { iws.onopen = r })
await isend('Runtime.enable')
const ipatched = await isend('Runtime.evaluate', {
  expression: `(() => {
    const { createRequire } = process.getBuiltinModule('module')
    const req = createRequire(${JSON.stringify(join(desktopDir, 'lib', 'main.js').split('\\').join('/'))})
    const electron = req('electron')
    const fs = req('node:fs')
    const dialog = electron.dialog
    if (dialog === undefined || typeof dialog.showMessageBox !== 'function') return 'no-dialog-api'
    const original = dialog.showMessageBox.bind(dialog)
    dialog.showMessageBox = (...args) => {
      const options = args.length > 1 ? args[1] : args[0]
      try { fs.appendFileSync(process.env.BAF_DIALOG_LOG, JSON.stringify({ at: new Date().toISOString(), options }) + '\\n', 'utf8') } catch {}
      return original(...args)
    }
    return 'patched'
  })()`,
  returnByValue: true,
})
console.log('main-process dialog recorder:', JSON.stringify(ipatched.result?.value ?? ipatched.exceptionDetails))

// ── wait for the main window ──────────────────────────────────────────────
const listTargets = async () => {
  try { return await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json() } catch { return [] }
}
let main = null
for (let i = 0; i < 180 && main === null; i++) {
  const targets = await listTargets()
  main = targets.find(t => t.type === 'page' && !t.url.includes('splash') && (t.url.startsWith('http') || t.url.includes('index.html'))) ?? null
  if (main === null) await sleep(1000)
}
if (main === null) {
  console.error('no main window:', JSON.stringify((await listTargets()).map(t => t.url)))
  console.error(logs.slice(-1500))
  await cleanup()
  process.exit(1)
}
console.log('main window:', main.url.slice(0, 60))

const ws = new WebSocket(main.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id
  const timer = setTimeout(() => { pending.delete(mid); reject(new Error(`timeout ${method}`)) }, 20000)
  pending.set(mid, { resolve: v => { clearTimeout(timer); resolve(v) }, reject: e => { clearTimeout(timer); reject(e) } })
  ws.send(JSON.stringify({ id: mid, method, params }))
})
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
await new Promise(r => { ws.onopen = r })
await send('Runtime.enable')
await send('Page.enable')
const run = async body => {
  const res = await send('Runtime.evaluate', { expression: `(()=>{ ${body} })()`, returnByValue: true, awaitPromise: true })
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 400))
  return res.result.value
}
const runAsync = async body => {
  const res = await send('Runtime.evaluate', { expression: `(async()=>{ ${body} })()`, awaitPromise: true, returnByValue: true })
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 400))
  return res.result.value
}
const shot = async name => {
  const cap = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(cap.data, 'base64'))
  console.log('shot:', join(OUT, `${name}.png`))
}
const until = async (body, tries = 90, gap = 500) => {
  for (let i = 0; i < tries; i++) {
    try { if (await run(body)) return true } catch { /* retry */ }
    await sleep(gap)
  }
  return false
}

await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => undefined)
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false })
await sleep(1500)

// ── 1) the channel check finds the update ─────────────────────────────────
let checkResult = null
for (let i = 0; i < 120; i++) {
  checkResult = await run(`return window.bafDesktop?.getLastCheckResult?.() ?? null`).catch(() => null)
  if (checkResult !== null && checkResult !== undefined) break
  await sleep(1000)
}
out.info.check = checkResult
check(checkResult?.status === 'available', 'the channel check reports an available update', checkResult?.status ?? checkResult)
check(
  typeof checkResult?.plan?.summaryZh === 'string' && checkResult.plan.summaryZh.length > 0,
  'the update plan carries a human-readable summary',
  checkResult?.plan?.summaryZh,
)

// ── 2) the in-app prompt ──────────────────────────────────────────────────
const promptUp = await until(`return !!document.querySelector('[data-testid="update-prompt"]')`, 90, 500)
check(promptUp === true, 'the in-app update prompt appeared', promptUp)

const prompt = await run(`
  const root=document.querySelector('[data-testid="update-prompt"]')
  const dialog=root?.closest('[role="dialog"]')
  const notes=[...document.querySelectorAll('[data-testid="update-prompt-notes"] li')].map(li=>(li.textContent||'').trim())
  const buttons=[...document.querySelectorAll('[data-testid="update-prompt"] button')].map(b=>({
    text:(b.textContent||'').trim(), testid:b.getAttribute('data-testid'), disabled:b.disabled
  }))
  return {
    present: root!==null,
    ariaLabel: dialog?.getAttribute('aria-label') ?? null,
    title: root?.querySelector('h2')?.textContent?.trim() ?? null,
    summary: document.querySelector('[data-testid="update-prompt-summary"]')?.textContent?.trim() ?? null,
    notes,
    buttons,
  }
`)
out.info.prompt = prompt
check(prompt.present === true, 'the update prompt is rendered by the app', prompt.present)
check(
  prompt.ariaLabel === (variant === 'forced' ? '必须更新后才能继续使用' : '发现新版本'),
  'the prompt headline names the update (发现新版本 / 必须更新后才能继续使用)',
  prompt.ariaLabel,
)
check(
  Array.isArray(prompt.notes) && prompt.notes.length >= 2 && prompt.notes.every(n => n.length > 0),
  'the release notes render one paragraph per point',
  prompt.notes,
)
check(
  Array.isArray(prompt.buttons) && prompt.buttons.some(b => b.testid === 'update-prompt-apply'),
  'the prompt offers the apply action',
  prompt.buttons,
)
await shot(`update-prompt-${variant}`)

// ── 3) the operating system's message box is NOT the dialog anymore ───────
let nativeDialogs = []
try {
  nativeDialogs = readFileSync(dialogLog, 'utf8').split('\n').filter(l => l.trim().length > 0).map(l => JSON.parse(l))
} catch { /* no log file: nothing was raised */ }
out.info.nativeDialogs = nativeDialogs.length
check(nativeDialogs.length === 0, 'the shell never raised the operating system message box', nativeDialogs.length)

// ── 4) the forced variant refuses every dismissal ─────────────────────────
if (variant === 'forced') {
  const before = await run(`return !!document.querySelector('[data-testid="update-prompt"]')`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(700)
  const after = await run(`return !!document.querySelector('[data-testid="update-prompt"]')`)
  check(before === true && after === true, 'Escape does not dismiss a required update', { before, after })
  const closers = await run(`
    const root=document.querySelector('[data-testid="update-prompt"]')
    const dialog=root?.closest('[role="dialog"]')
    return {
      closeButtons: dialog ? [...dialog.querySelectorAll('button')].filter(b=>(b.getAttribute('aria-label')||'').includes('关闭')).length : -1,
      hasQuit: !!document.querySelector('[data-testid="update-prompt-quit"]'),
    }
  `)
  check(closers.closeButtons === 0, 'the required prompt has no close button', closers)
  check(closers.hasQuit === true, 'the required prompt offers the quit action', closers)
  // The prompt holds the window, so the tag cannot be clicked — but it is
  // there, and the user sees it as soon as the update is dealt with.
  const tagPresent = await run(`return !!document.querySelector('[data-testid="sidebar-update-tag"]')`)
  check(tagPresent === true, 'the brand row carries the update tag', tagPresent)
}

// ── 6) the optional update really lands (plugin hot replacement) ──────────
if (variant === 'apply') {
  await runAsync(`
    const el=document.querySelector('[data-testid="update-prompt-apply"]')
    if(el) el.click()
    return true
  `)
  const targetVersion = manifest.bafPlugin
  let landed = null
  for (let i = 0; i < 120; i++) {
    await sleep(1000)
    try {
      const versions = JSON.parse(readFileSync(join(userDataDir, 'versions.json'), 'utf8'))
      // The persisted document is schema 2 (nested); the flat shape is the
      // legacy fallback.
      const pluginVersion = versions.plugin?.baf ?? versions.bafPlugin
      if (pluginVersion === targetVersion) {
        landed = { pluginVersion, versions }
        break
      }
    } catch { /* not written yet */ }
  }
  const pluginManifestPath = join(userDataDir, 'plugin', 'plugin-manifest.json')
  const newManifest = existsSync(pluginManifestPath)
    ? JSON.parse(readFileSync(pluginManifestPath, 'utf8'))
    : null
  const bakExists = existsSync(join(userDataDir, 'plugin.bak'))
  out.info.apply = { landed, newManifest, bakExists }
  check(landed !== null, 'the optional update committed the plugin version', landed)
  check(newManifest?.version === targetVersion, 'the live plugin carries the new version', newManifest?.version)
  check(bakExists === true, 'the old plugin was kept as a .bak for rollback', bakExists)
  await shot('update-prompt-applied')
}

// ── 7) 「稍后更新」 closes the optional prompt ─────────────────────────────
if (variant === 'optional') {
  await runAsync(`
    const el=document.querySelector('[data-testid="update-prompt-later"]')
    if(el) el.click()
    await new Promise(r=>setTimeout(r,900))
    return true
  `)
  const dismissed = await run(`return !document.querySelector('[data-testid="update-prompt"]')`)
  check(dismissed === true, '「稍后更新」 closes the optional prompt', dismissed)
}

// ── 8) the brand row carries the update tag, right of the version capsule ──
// The apply variant restarts the dsh child, and the page reloads with it —
// the tag assertions belong to the variants whose page stays put.
const tag = await run(`
  const el=document.querySelector('[data-testid="sidebar-update-tag"]')
  if(!el) return {present:false}
  const isVersion=(s)=>{
    if(!s.startsWith('v')) return false
    const parts=s.slice(1).split('.')
    return parts.length===3 && parts.every(p=>p.length>0 && [...p].every(ch=>ch>='0' && ch<='9'))
  }
  const brand=document.querySelector('[class*="brandName"]')
  const spans=[...(brand?.querySelectorAll('span')??[])]
  const capsule=spans.find(s=>isVersion((s.textContent||'').trim()))
  const name=spans.find(s=>s!==capsule && (s.textContent||'').trim().length>0)
  const row=document.querySelector('[class*="logoRow"]')
  const buttons=[...(row?.querySelectorAll('button')??[])]
  const toggle=buttons[buttons.length-1]
  const r=el.getBoundingClientRect()
  const cr=capsule?.getBoundingClientRect()
  const nr=name?.getBoundingClientRect()
  const rr=row?.getBoundingClientRect()
  const tr=toggle?.getBoundingClientRect()
  const box=(x)=>x?{text:(x.textContent||'').trim(),x:Math.round(x.left),y:Math.round(x.top),right:Math.round(x.right),width:Math.round(x.width)}:null
  return {present:true, text:(el.textContent||'').trim(),
    rect:box(r), capsule:box(cr), name:box(nr), row:box(rr), toggle:box(tr),
    nameFits: name ? name.scrollWidth <= name.clientWidth + 1 : null}
`)
out.info.tag = tag
if (variant !== 'apply') {
  check(tag.present === true, 'the brand row carries the update tag', tag)
  check(tag.text === '更新', 'the update tag reads 更新', tag.text)
  check(tag.capsule !== null && tag.capsule !== undefined, 'the version capsule sits beside the tag', tag)
  check(
    tag.capsule !== null && tag.capsule !== undefined
      && tag.rect.x >= tag.capsule.right
      && tag.rect.x - tag.capsule.right <= 24,
    'the update tag sits right of the version capsule',
    { tag, capsule: tag.capsule },
  )
  // The wordmark yields first when the column narrows; the version capsule
  // and the tag must never be the ones that lose pixels.
  check(tag.nameFits === true, 'the brand wordmark is whole (the capsule never takes the clip)', tag)
  check(
    tag.toggle !== null && tag.toggle !== undefined && tag.rect.right <= tag.toggle.x,
    'the update tag stays in the brand row, left of the collapse toggle',
    { tag, toggle: tag.toggle },
  )
}

// ── 9) clicking the tag opens 版本与更新 ──────────────────────────────────
if (variant === 'optional') {
  // The client remounts once its connection generation becomes ready, and that
  // remount closes the settings dialog — the panel can vanish between two
  // reads. So open it and read the card in ONE loop, and re-open it when the
  // remount took it away.
  let opened = null
  let cardNotes = []
  for (let attempt = 0; attempt < 6 && cardNotes.length === 0; attempt++) {
    await runAsync(`
      const el=document.querySelector('[data-testid="sidebar-update-tag"]')
      if(el) el.click()
      await new Promise(r=>setTimeout(r,1400))
      return true
    `)
    opened = await run(`
      const cells=[...document.querySelectorAll('button[class*="navCell"]')]
      const cell=cells.find(c=>(c.textContent||'').includes('版本与更新'))
      const card=document.querySelector('[data-testid="update-available-card"]')
      return {
        panel: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
        section: !!document.querySelector('[data-testid="updates-section"]'),
        current: cell?.getAttribute('aria-current') ?? null,
        card: !!card,
        notes: card
          ? [...card.querySelectorAll('p')].map(p=>(p.textContent||'').trim()).filter(t=>t.length>0)
          : [],
      }
    `)
    cardNotes = opened.notes
    if (cardNotes.length === 0) await sleep(1500)
  }
  const { notes: _notes, ...panelState } = opened ?? {}
  out.info.opened = panelState
  check(panelState.panel === true, 'the tag opened the settings panel', panelState)
  check(panelState.section === true, 'the tag landed on the 版本与更新 section', panelState)
  check(panelState.current === 'true', 'the 版本与更新 nav row is the active one', panelState.current)
  check(panelState.card === true, 'the 版本与更新 page shows the available-update card', panelState.card)
  await shot(`update-settings-${variant}`)

  // The card's notes are paragraphs too — one point per paragraph.
  out.info.cardNotes = cardNotes
  const noteLines = cardNotes.filter(t => !t.startsWith('目标版本'))
  check(
    noteLines.length >= 2 && noteLines.every(t => !t.includes('\n')),
    'the settings card lists the update points one per paragraph',
    cardNotes,
  )
}

console.log('--- mock github hits ---')
console.log(mock.hits.join('\n'))
console.log(JSON.stringify({ fail: out.fail, skipped: out.skipped }, null, 2))
ws.close()
iws.close()
await cleanup()
process.exit(out.fail.length === 0 ? 0 : 1)
