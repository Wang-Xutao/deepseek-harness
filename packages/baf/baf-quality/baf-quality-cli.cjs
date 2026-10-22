#!/usr/bin/env node
/**
 * baf-quality CLI — the thin workspace-local wrapper the 测试流图's 运行 buttons
 * and the enterprise READMEs (`baf-quality test|check|lint`) contract. Ships at
 * the package root (no build step, zero imports beyond node:*) so the desktop
 * host can resolve it by absolute path and run it under its own node — no PATH
 * registration, no npm global install (批次十三复核 3, 2026-10-22: nothing
 * provided this command before, so every stage run read 未找到 baf-quality).
 *
 * Contract (mirrors the shipped ceedling/static-analysis READMEs):
 *   baf-quality test [模块]      日常 TDD — ceedling test:all / test:<模块>（不插桩）
 *   baf-quality check [--clean]  gcov 插桩全量测试 + gcovr HTML 覆盖率报告
 *   baf-quality lint [路径…]     cpplint + cppcheck → .baf/reports/static-analysis.json
 *   baf-quality help             用法
 *
 * Exit code: the first failing subcommand's (0 when all pass). All children run
 * through the shell (gem/pip shims are .cmd/.bat) with inherited stdio.
 */
'use strict'

const { spawnSync } = require('node:child_process')
const { existsSync, mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const USAGE = [
  'baf-quality — BAF C 单元测试/质量链包装器',
  '用法:',
  '  baf-quality test [模块名]      日常 TDD（不插桩；ceedling test:all / test:<模块名>）',
  '  baf-quality check [--clean]    gcov 插桩全量测试 + gcovr HTML 覆盖率报告（build/coverage）',
  '  baf-quality lint [路径…]       cpplint + cppcheck（写 .baf/reports/static-analysis.json）',
  '  baf-quality help               本说明',
  '工具链: gcc · ruby · ceedling · gcovr · cpplint · cppcheck（工作流 · 测试流 · 环境 可一键安装）',
].join('\n')

/** Quote one shell argument (paths may contain spaces). */
const q = (arg) => `"${String(arg).replace(/"/g, '""')}"`

/** Run one subcommand in the workspace cwd, streaming output; → exit code. */
function run(command) {
  console.log(`\n$ ${command}`)
  const res = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
    windowsHide: true,
    env: process.env,
  })
  const code = res.status
  return typeof code === 'number' ? code : 1
}

/** Run one subcommand CAPTURED (echoed after it exits); → { code, output } —
 * lint uses this so the report json can count findings out of the text. */
function runCaptured(command) {
  console.log(`\n$ ${command}`)
  const res = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    env: process.env,
  })
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`
  if (output.trim() !== '') process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
  return { code: typeof res.status === 'number' ? res.status : 1, output }
}

/** Count a tool's findings out of its text output (0 when nothing matches). */
function countFindings(id, output) {
  if (id === 'cpplint') {
    const m = output.match(/Total errors found:\s*(\d+)/)
    return m === null ? 0 : Number(m[1])
  }
  return (output.match(/: error:|error:/gi) || []).length
}

/** All lint/check targets fall back to the enterprise layout when unnamed. */
const DEFAULT_LINT_PATHS = ['source', 'test']

function cmdTest(args) {
  const target = args[0] === undefined ? 'test:all' : `test:${args[0]}`
  process.exit(run(`ceedling ${target}`))
}

function cmdCheck(args) {
  let code = 0
  if (args.includes('--clean')) {
    code = run('ceedling clean')
    if (code !== 0) process.exit(code)
  }
  code = run('ceedling gcov:all')
  if (code !== 0) process.exit(code)
  mkdirSync(join('build', 'coverage'), { recursive: true })
  code = run(`gcovr -r . --html-details ${q('build/coverage/coverage_report.html')}`)
  if (code !== 0) process.exit(code)
  // Informational summary tail (the gate reads the HTML report itself).
  process.exit(run('gcovr -r . --print-summary'))
}

/** Translate the shipped cppcheck-suppressions.xml into the PLAIN-TEXT list
 * format `--suppressions-list` consumes (id[:fileName[:line]] per line) — the
 * XML form rides in the workspace for humans/the GUI project, but the CLI
 * flag parses text only. Best-effort: an unparseable file passes no
 * suppressions and lets cppcheck speak for itself. */
function cppcheckSuppressionsArgs() {
  const XML = 'cppcheck-suppressions.xml'
  if (!existsSync(XML)) return []
  let xml = ''
  try {
    xml = require('node:fs').readFileSync(XML, 'utf8')
  } catch {
    return []
  }
  const lines = []
  for (const match of xml.matchAll(/<suppress>([\s\S]*?)<\/suppress>/g)) {
    const body = match[1]
    const id = (body.match(/<id>([\s\S]*?)<\/id>/) || [])[1]
    const fileName = (body.match(/<fileName>([\s\S]*?)<\/fileName>/) || [])[1]
    const line = (body.match(/<line>([\s\S]*?)<\/line>/) || [])[1]
    if (id === undefined) continue
    const entry = [id.trim(), fileName && fileName.trim(), line && line.trim()]
      .filter((value, index) => index === 0 || value !== undefined)
      .join(':')
    if (entry !== '') lines.push(entry)
  }
  if (lines.length === 0) return []
  const dir = join('build', '.baf-quality')
  mkdirSync(dir, { recursive: true })
  const txtPath = join(dir, 'cppcheck-suppressions.txt')
  try {
    writeFileSync(txtPath, `${lines.join('\n')}\n`, 'utf8')
  } catch {
    return []
  }
  return [`--suppressions-list=${q(txtPath)}`]
}

function cmdLint(args) {
  const paths = args.filter((a) => !a.startsWith('--'))
  const targets = paths.length > 0 ? paths : DEFAULT_LINT_PATHS
  const results = []
  const cpplintCmd = `cpplint --recursive ${targets.map(q).join(' ')}`
  const cpplint = runCaptured(cpplintCmd)
  results.push({ id: 'cpplint', command: cpplintCmd, passed: cpplint.code === 0, exitCode: cpplint.code, findings: countFindings('cpplint', cpplint.output) })
  const cppcheckArgs = ['cppcheck', '--enable=warning,style,performance,portability', '--inline-suppr', '--std=c11', '-Isource']
  for (const extra of cppcheckSuppressionsArgs()) {
    cppcheckArgs.push(extra)
  }
  for (const flag of args.filter((a) => a.startsWith('--') && a !== '--strict' && a !== '--ci')) {
    cppcheckArgs.push(flag)
  }
  cppcheckArgs.push(...targets.map(q))
  const cppcheckCmd = cppcheckArgs.join(' ')
  const cppcheck = runCaptured(cppcheckCmd)
  results.push({ id: 'cppcheck', command: cppcheckCmd, passed: cppcheck.code === 0, exitCode: cppcheck.code, findings: countFindings('cppcheck', cppcheck.output) })
  // Aggregate flat keys (`passed` / `errors` / `generated_at`) are the contract
  // readTestFlowStatus consumes; `tools` carries the per-tool detail.
  const passed = results.every((r) => r.passed)
  const errors = results.reduce((sum, r) => sum + (r.findings ?? 0), 0)
  try {
    mkdirSync(join('.baf', 'reports'), { recursive: true })
    writeFileSync(
      join('.baf', 'reports', 'static-analysis.json'),
      `${JSON.stringify({ schema: 1, generated_at: new Date().toISOString(), passed, errors, tools: results }, null, 2)}\n`,
      'utf8',
    )
  } catch {
    // The report is best-effort; the exit codes below still carry the verdict.
  }
  process.exit(passed ? 0 : (results.find((r) => !r.passed) || { exitCode: 1 }).exitCode)
}

const sub = process.argv[2] ?? 'help'
const rest = process.argv.slice(3)
if (sub === 'test') cmdTest(rest)
else if (sub === 'check') cmdCheck(rest)
else if (sub === 'lint') cmdLint(rest)
else if (sub === 'help' || sub === '--help' || sub === '-h') {
  console.log(USAGE)
  process.exit(0)
} else {
  console.error(`未知子命令: ${sub}\n\n${USAGE}`)
  process.exit(2)
}
