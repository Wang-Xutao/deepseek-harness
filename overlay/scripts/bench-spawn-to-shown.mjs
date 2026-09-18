#!/usr/bin/env node
/**
 * Spawn→window-shown A/B for the baf-dsh desktop shell.
 *
 * For each scenario, the script:
 *  1. Wipes the userData dir, so the first launch re-probes Node and writes a
 *     fresh `desktop-prefs.json`.
 *  2. Launches the unpackaged Electron binary under the prepared project.
 *  3. Reads `userData/launch-timings.jsonl` after the shell self-exits (via a
 *     timeout-driven kill) and reports `dsh-spawn → main-shown` elapsed.
 *
 * Scenarios (each prefixed with the env var the desktop shell reads):
 *   baseline     prefs `nodeBinary` empty → full probe walk, plugin sync runs
 *   patched      same plus the cached node + sync-skip changes are visible
 *
 * Run from the repo root:
 *   node overlay/scripts/bench-spawn-to-shown.mjs --rounds 3
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const overlayRoot = join(repoRoot, 'overlay')
const desktopRoot = join(overlayRoot, 'desktop')

function parseArgs(argv) {
  const args = { rounds: 3, scenarios: ['baseline', 'patched'] }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--rounds') args.rounds = Number(argv[++i] ?? '3')
    else if (arg === '--scenarios') args.scenarios = String(argv[++i] ?? 'baseline,patched').split(',')
  }
  if (!Number.isFinite(args.rounds) || args.rounds < 1) {
    throw new Error(`bench: --rounds must be a positive integer, got ${String(args.rounds)}`)
  }
  return args
}

function ensureBuilt() {
  const required = [
    join(repoRoot, 'apps', 'cli', 'lib', 'bin.js'),
    join(repoRoot, 'apps', 'desktop-host', 'lib', 'index.js'),
    join(desktopRoot, 'lib', 'main.js'),
  ]
  for (const path of required) {
    if (!existsSync(path)) {
      throw new Error(`bench: missing built artifact ${path}; run pnpm run build:desktop first`)
    }
  }
}

function runChild(command, args, env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: desktopRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', rejectRun)
    child.once('exit', (code, signal) => resolveRun({ code, signal, stderr }))
  })
}

async function killTree(child, platform) {
  if (child.pid === undefined) return
  if (platform === 'win32') {
    spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' })
    return
  }
  try { child.kill('SIGTERM') } catch { /* already gone */ }
}

function readTimings(userData) {
  const path = join(userData, 'launch-timings.jsonl')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.kind === 'mark')
}

function summarizePhases(marks) {
  const map = new Map(marks.map((m) => [m.phase, m.atMs]))
  const span = (start, end) => (map.has(start) && map.has(end) ? map.get(end) - map.get(start) : null)
  return {
    spawnToReady: span('dsh-spawn', 'dsh-ready'),
    readyToShown: span('dsh-ready', 'main-shown'),
    spawnToShown: span('dsh-spawn', 'main-shown'),
    appReadyToShown: span('app-ready', 'main-shown'),
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function mean(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function spawnScenario(env, electronPath, args, userData) {
  // VSCode / extension-host parents export ELECTRON_RUN_AS_NODE=1; inherited
  // by the spawn it turns the Electron exe into a plain node REPL that exits
  // 0 silently on non-TTY stdin — a false smoke failure. Strip it explicitly.
  const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = env
  return spawn(electronPath, args, {
    cwd: desktopRoot,
    env: { ...cleanEnv, BAF_DSH_BENCH_USERDATA: userData },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

async function runRound({ scenario, index, userData, electronPath, env }) {
  // Wipe userData so each round starts from cold; baseline and patched differ
  // only in how the shell interprets the (now empty) prefs.
  rmSync(userData, { recursive: true, force: true })
  mkdirSync(userData, { recursive: true })

  const scenarioEnv = scenario === 'baseline'
    ? { ...env, BAF_DSH_BENCH_BASELINE: '1' }
    : env

  const start = Date.now()
  const child = spawnScenario(scenarioEnv, electronPath, [
    '.',
    `--user-data-dir=${userData}`,
  ], userData)

  // Capture child output so failed rounds leave a breadcrumb instead of going
  // silent. The shell logs to stderr under ELECTRON_ENABLE_LOGGING.
  let childStdout = ''
  let childStderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { childStdout += chunk })
  child.stderr.on('data', (chunk) => { childStderr += chunk })

  // Wait for `main-shown` in the timings file. Polling beats child-output
  // parsing because the timings file is the same channel production code uses.
  const timingsPath = join(userData, 'launch-timings.jsonl')
  const deadline = Date.now() + 90_000
  let marks = []
  while (Date.now() < deadline) {
    if (existsSync(timingsPath)) {
      marks = readTimings(userData)
      if (marks.some((m) => m.phase === 'main-shown')) break
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 250))
  }
  const settledAt = Date.now()

  await killTree(child, process.platform)
  const summary = summarizePhases(marks)
  return {
    scenario,
    index,
    wallMs: settledAt - start,
    phases: summary,
    phasesSeen: marks.map((m) => m.phase),
    childStdout,
    childStderr,
  }
}

function printTable(rows) {
  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row.scenario)) groups.set(row.scenario, [])
    groups.get(row.scenario).push(row)
  }
  console.log('\nscenario     round  spawn→shown  ready→shown  app→shown  phases_seen')
  for (const [scenario, list] of groups) {
    for (const row of list) {
      const phases = row.phases
      const fmt = (value) => (value === null ? '   n/a ' : `${String(value).padStart(7, ' ')}ms`)
      console.log(
        `${scenario.padEnd(12)} ${String(row.index).padStart(3)}    `
        + `${fmt(phases.spawnToShown)}    `
        + `${fmt(phases.readyToShown)}    `
        + `${fmt(phases.appReadyToShown)}  `
        + `[${row.phasesSeen.join(', ')}]`,
      )
      if (row.phasesSeen.length === 0 && (row.childStderr !== '' || row.childStdout !== '')) {
        const tail = (row.childStderr + row.childStdout).trim().split('\n').slice(-10).join('\n')
        console.log(`  stderr-tail:\n${tail.split('\n').map(line => '    ' + line).join('\n')}`)
      }
    }
  }
}

function printSummary(rows) {
  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row.scenario)) groups.set(row.scenario, [])
    groups.get(row.scenario).push(row)
  }
  console.log('\nmedian spawn→shown per scenario:')
  for (const [scenario, list] of groups) {
    const values = list.map((r) => r.phases.spawnToShown).filter((v) => v !== null)
    const readyValues = list.map((r) => r.phases.readyToShown).filter((v) => v !== null)
    if (values.length === 0) {
      console.log(`  ${scenario}: no successful rounds`)
      continue
    }
    console.log(`  ${scenario.padEnd(10)} spawn→shown median=${String(median(values))}ms mean=${String(Math.round(mean(values)))}ms `
      + `(n=${String(values.length)})  ready→shown median=${String(median(readyValues))}ms`)
  }
  if (groups.size === 2) {
    const [a, b] = [...groups.keys()]
    const av = [...groups.get(a)].map((r) => r.phases.spawnToShown).filter((v) => v !== null)
    const bv = [...groups.get(b)].map((r) => r.phases.spawnToShown).filter((v) => v !== null)
    if (av.length > 0 && bv.length > 0) {
      const delta = median(bv) - median(av)
      const pct = (delta / median(av)) * 100
      console.log(`\n${b} vs ${a}: ${delta >= 0 ? '+' : ''}${String(delta)}ms (${pct.toFixed(1)}%)`)
    }
  }
}

function resolveElectronBinary(desktopRoot) {
  // The overlay/desktop workspace pins its own electron version; the .pnpm
  // store resolves to whatever the workspace currently selects. Read the
  // package.json rather than hard-coding a version.
  const pkgPath = join(desktopRoot, 'node_modules', 'electron', 'package.json')
  if (!existsSync(pkgPath)) {
    throw new Error(`bench: electron is not installed under ${join(desktopRoot, 'node_modules', 'electron')}; run pnpm install`)
  }
  const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version
  const pnpmRoot = join(repoRoot, 'node_modules', '.pnpm')
  if (existsSync(pnpmRoot)) {
    const matches = readdirSync(pnpmRoot).filter((name) => name.startsWith(`electron@${version}_`))
    if (matches.length > 0) {
      const pnpmExe = join(pnpmRoot, matches[0], 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
      if (existsSync(pnpmExe)) return pnpmExe
    }
  }
  // Fall back to the local copy if the store layout shifts.
  const localExe = join(desktopRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
  if (existsSync(localExe)) return localExe
  throw new Error(`bench: could not find electron binary for version ${version}`)
}

async function main() {
  const args = parseArgs(process.argv)
  ensureBuilt()
  const electronPath = resolveElectronBinary(desktopRoot)
  const baseEnv = {
    ...process.env,
    DSH_HOME: join(desktopRoot, '.bench-home'),
    DSH_DESKTOP_NODE_BINARY: process.execPath,
    ELECTRON_ENABLE_LOGGING: '1',
  }
  const rows = []
  for (const scenario of args.scenarios) {
    for (let round = 1; round <= args.rounds; round++) {
      const userData = join(tmpdir(), `baf-dsh-bench-${scenario}-${round}`)
      console.error(`bench: ${scenario} round ${round} (userData=${userData})`)
      const row = await runRound({ scenario, index: round, userData, electronPath, env: baseEnv })
      rows.push(row)
      printTable([row])
    }
  }
  printTable(rows)
  printSummary(rows)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
