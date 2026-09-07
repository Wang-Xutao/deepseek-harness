/**
 * Post-`dist:dir` smoke: packed dsh web must print a ready URL, and the
 * win-unpacked exe must not append a launch-error.log entry while starting.
 *
 * Intended caller: `npm run dist:dir` in `overlay/`.
 */
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(overlayRoot, 'desktop')
const unpacked = join(desktop, 'dist', 'win-unpacked')
const exe = join(unpacked, 'baf-dsh.exe')
const dshRoot = join(unpacked, 'resources', 'dsh')
const smokeMarker = join(desktop, '.smoke-launch-ok')
const launchLog = join(
  process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
  'baf-dsh',
  'launch-error.log',
)

const READY_RE = /^dsh web: (http:\/\/127\.0\.0\.1:\d+(?:\/[^ \t]*)?)/
const DSH_READY_MS = 90_000
/** How long the exe must stay up without appending launch-error.log. */
const EXE_WATCH_MS = 20_000

const mustMains = [
  join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-baf-core', 'lib', 'index.js'),
  join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-baf-workflow', 'lib', 'index.js'),
  join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-baf-workflow', 'lib', 'index.js'),
  join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-baf-workflow', 'lib', 'typert.host.js'),
  join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-api-remotes', 'lib', 'client.js'),
]

/**
 * Fail when the packed remotes Client assembly omits the workflow Remote.
 * A stale `lib/client.js` leaves `remote.bafWorkflowView` unmounted and blocks web boot.
 */
function assertRemotesClientMountsWorkflow() {
  const remotesClient = join(
    dshRoot,
    'node_modules',
    '@deepseek-ai',
    'dsh-api-remotes',
    'lib',
    'client.js',
  )
  const text = readFileSync(remotesClient, 'utf8')
  if (!text.includes('bafWorkflowView')) {
    throw new Error(
      `打包产物 ${remotesClient} 未包含 bafWorkflowView：请先重建 @deepseek-ai/dsh-api-remotes 的 client bundle`,
    )
  }
  // Client gateway rejects src-json at $mount (has no strict codec).
  const workflowRegion = text.match(
    /ui-baf-workflow\/lib\/typert\.remote-client\.js[\s\S]{0,2500}?package:\s*"@deepseek-ai\/dsh-client-ui-baf-workflow"/,
  )?.[0] ?? text.match(
    /@deepseek-ai\/dsh-client-ui-baf-workflow[\s\S]{0,2500}?bafWorkflowView/,
  )?.[0]
  if (workflowRegion === undefined) {
    throw new Error(`打包产物 ${remotesClient} 缺少 ui-baf-workflow Remote 贡献区域`)
  }
  if (workflowRegion.includes('src-json')) {
    throw new Error(
      `打包产物 ${remotesClient} 的 bafWorkflowView 仍使用 src-json：Client Remote 必须用 strict codec`,
    )
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

/**
 * @param {number | undefined} pid
 */
function killTree(pid) {
  if (pid === undefined) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/T', '/F', '/PID', String(pid)], {
      windowsHide: true,
      stdio: 'ignore',
    })
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
}

/**
 * @returns {string}
 */
function resolveNode() {
  if (process.env.DSH_NODE_BINARY && existsSync(process.env.DSH_NODE_BINARY)) {
    return process.env.DSH_NODE_BINARY
  }
  return process.execPath
}

/**
 * @returns {string}
 */
function resolveDshBin() {
  const nested = join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const flat = join(dshRoot, 'lib', 'bin.js')
  if (existsSync(nested)) return nested
  if (existsSync(flat)) return flat
  throw new Error(`未找到打包 dsh 入口（查过 ${nested} 与 ${flat}）`)
}

function assertArtifacts() {
  if (!existsSync(exe)) {
    throw new Error(`缺少 ${exe}：请先完成 dist:dir`)
  }
  for (const path of mustMains) {
    if (!existsSync(path)) {
      throw new Error(`打包产物缺少运行时入口：${path}`)
    }
  }
  assertRemotesClientMountsWorkflow()
}

/**
 * @returns {Promise<string>} ready URL
 */
function smokePackedDshWeb() {
  const node = resolveNode()
  const bin = resolveDshBin()
  const child = spawn(node, [bin, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    cwd: homedir(),
    env: {
      ...process.env,
      DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED ?? '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  return new Promise((resolveReady, reject) => {
    let settled = false
    let combined = ''
    let lineBuf = ''
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      killTree(child.pid)
      reject(new Error(`打包 dsh web 启动超时（${String(DSH_READY_MS / 1000)}s）\n${combined.slice(-4000)}`))
    }, DSH_READY_MS)

    const onData = (chunk) => {
      const text = String(chunk)
      combined += text
      lineBuf += text
      const lines = lineBuf.split(/\r?\n/)
      lineBuf = lines.pop() ?? ''
      for (const line of lines) {
        const match = line.trim().match(READY_RE)
        if (match?.[1] === undefined) continue
        if (settled) return
        settled = true
        clearTimeout(timer)
        killTree(child.pid)
        resolveReady(match[1])
      }
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.once('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`打包 dsh web 在就绪前退出，code=${String(code)}\n${combined.slice(-4000)}`))
    })
  })
}

/**
 * Start the Electron shell and fail if it records a launch-error.log append.
 * Surviving {@link EXE_WATCH_MS} without a new log entry means the shell found
 * Node and started dsh (packed dsh web smoke already proved plugin load).
 * @returns {Promise<void>}
 */
async function smokeExeShell() {
  const beforeLen = existsSync(launchLog) ? readFileSync(launchLog, 'utf8').length : 0
  const child = spawn(exe, [], {
    cwd: unpacked,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
  child.unref()

  const started = Date.now()
  const deadline = started + EXE_WATCH_MS
  try {
    while (Date.now() < deadline) {
      await sleep(1000)
      try {
        if (child.pid === undefined) throw new Error('exe 未获得 pid')
        process.kill(child.pid, 0)
      } catch (err) {
        if (existsSync(launchLog)) {
          const text = readFileSync(launchLog, 'utf8')
          if (text.length > beforeLen) {
            throw new Error(`exe 启动失败（launch-error.log）：\n${text.slice(beforeLen).slice(-4000)}`)
          }
        }
        throw new Error(
          err instanceof Error && err.message.startsWith('exe')
            ? err.message
            : `exe 在冒烟窗口内退出（pid=${String(child.pid)}）`,
        )
      }

      if (existsSync(launchLog)) {
        const text = readFileSync(launchLog, 'utf8')
        if (text.length > beforeLen) {
          throw new Error(`exe 启动失败（launch-error.log）：\n${text.slice(beforeLen).slice(-4000)}`)
        }
      }
    }
  } finally {
    killTree(child.pid)
    await sleep(500)
  }
}

function writeOk(detail) {
  mkdirSync(dirname(smokeMarker), { recursive: true })
  writeFileSync(
    smokeMarker,
    `${new Date().toISOString()}\n${detail}\nexe mtime=${statSync(exe).mtime.toISOString()}\n`,
    'utf8',
  )
}

try {
  console.log('verify-desktop-dir-launch: checking artifacts...')
  assertArtifacts()
  console.log('verify-desktop-dir-launch: starting packed dsh web...')
  const url = await smokePackedDshWeb()
  console.log(`verify-desktop-dir-launch: dsh ready at ${url}`)
  console.log('verify-desktop-dir-launch: starting exe shell smoke...')
  await smokeExeShell()
  writeOk(`dsh-ready=${url}`)
  console.log(`verify-desktop-dir-launch: ok -> ${smokeMarker}`)
} catch (err) {
  console.error(`verify-desktop-dir-launch: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
