/** 合并后体检：baf 的组合配置里每一个插件行是否还能落到真实的包/导出上。
 *
 * 背景：上游 v0.2.1-rc.3 撤掉了独立的 `@deepseek-ai/dsh-tool-subagent-control/list-agents`
 * 导出（list_agents 改由主插件注册），baf 的 preset/patch 仍写着这一行 → 会话创建失败。
 * 这个脚本按 Node 的 exports 解析规则，把同一类问题一次扫干净。
 *
 * Usage: node check-baf-plugin-rows.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(overlayRoot, '..')

/** name -> package dir, for every workspace package in the repo. */
const packages = new Map()
const scan = (dir, depth = 0) => {
  if (depth > 4) return
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'node_modules' || entry.name === 'lib' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    const manifest = join(full, 'package.json')
    try {
      if (statSync(manifest).isFile()) {
        // Some manifests in this repo carry a UTF-8 BOM — JSON.parse rejects it.
        const pkg = JSON.parse(readFileSync(manifest, 'utf8').replace(/^\uFEFF+/, ''))
        if (typeof pkg.name === 'string') packages.set(pkg.name, full)
      }
    } catch { /* unreadable manifest — ignore */ }
    scan(full, depth + 1)
  }
}
scan(join(repoRoot, 'packages'))
scan(join(repoRoot, 'apps'))
scan(join(repoRoot, 'vendor'))

/**
 * Resolve one plugin row the way Node would.
 * @param {string} spec - the plugin name from the config
 * @returns {{ ok: boolean, detail: string }}
 */
function resolveRow(spec) {
  // A scoped name is `@scope/name`; a sub-export is `@scope/name/sub`. The scope
  // slash is NOT the package/subpath boundary.
  const scoped = spec.startsWith('@')
  const body = scoped ? spec.slice(spec.indexOf('/') + 1) : spec
  const slash = body.indexOf('/')
  if (slash < 0) {
    const ok = packages.has(spec)
    return { ok, detail: ok ? '' : 'package missing' }
  }
  const pkgName = (scoped ? `@${spec.slice(1, spec.indexOf('/'))}/` : '') + body.slice(0, slash)
  const sub = body.slice(slash + 1)
  const dir = packages.get(pkgName)
  if (dir === undefined) return { ok: false, detail: 'package missing' }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8').replace(/^\uFEFF+/, ''))
  } catch {
    return { ok: false, detail: 'package.json unreadable' }
  }
  const exports = manifest.exports
  if (exports === undefined || typeof exports !== 'object') {
    // No exports map: Node resolves `<pkg>/<sub>` as a file inside the package.
    for (const candidate of [sub, `${sub}.js`, join(sub, 'index.js')]) {
      try { if (statSync(join(dir, candidate)).isFile()) return { ok: true, detail: '' } } catch { /* next */ }
    }
    return { ok: false, detail: 'sub-export not found' }
  }
  const key = `./${sub}`
  const entry = exports[key]
  if (entry === undefined) {
    // A wildcard entry (`./sub/*`) resolves to a file under that prefix.
    const wildcard = Object.keys(exports).find(k => k.startsWith('./') && k.endsWith('/*') && sub.startsWith(k.slice(3, -1)))
    if (wildcard === undefined) return { ok: false, detail: `no exports entry for "${key}"` }
    const rest = sub.slice(wildcard.slice(3, -1).length)
    const target = pickTarget(exports[wildcard], rest)
    if (target === undefined) return { ok: false, detail: `no exports entry for "${key}"` }
    return { ok: fileExists(join(dir, target)), detail: target }
  }
  const target = pickTarget(entry, undefined)
  if (target === undefined) return { ok: false, detail: `exports entry "${key}" has no runtime target` }
  return { ok: fileExists(join(dir, target)), detail: target }
}

/**
 * Pick the runtime (non-types) target of an exports entry.
 * @param {unknown} entry - the exports entry value
 * @param {string | undefined} rest - the wildcard remainder, when the entry is a pattern
 */
function pickTarget(entry, rest) {
  if (typeof entry === 'string') return rest === undefined ? entry : entry.replace('*', rest)
  if (entry === null || typeof entry !== 'object') return undefined
  for (const condition of ['node', 'import', 'require', 'default']) {
    const value = entry[condition]
    if (typeof value === 'string') return rest === undefined ? value : value.replace('*', rest)
    if (value !== undefined && value !== null && typeof value === 'object') {
      const nested = pickTarget(value, rest)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

/**
 * @param {string} path - absolute path to test
 * @returns {boolean} true when the path exists as a file
 */
function fileExists(path) {
  try { return statSync(path).isFile() } catch { return false }
}

const FILES = [
  'packages/bundle/web-app/presets/baf.patch.yml',
  'packages/bundle/web-app/presets/standard.patch.yml',
  'packages/bundle/web-app/presets/ptc.patch.yml',
  'packages/bundle/web-app/presets/cordis.patch.yml',
  'packages/preset/agent-presets/presets/baf/agent.cordis.yml',
  'packages/preset/agent-presets/presets/standard/agent.cordis.yml',
  'packages/preset/agent-presets/presets/ptc/agent.cordis.yml',
  'packages/preset/agent-presets/presets/cordis/agent.cordis.yml',
  'packages/preset/agent-presets/presets/minimal/agent.cordis.yml',
]

let bad = 0
for (const rel of FILES) {
  const abs = join(repoRoot, rel)
  let text
  try { text = readFileSync(abs, 'utf8') } catch { console.log(`SKIP ${rel} (missing)`); continue }
  const rows = [...text.matchAll(/name:\s*'([^']+)'/g)].map(m => m[1])
    .filter(n => n.startsWith('@deepseek-ai/'))
  const broken = []
  for (const spec of new Set(rows)) {
    const verdict = resolveRow(spec)
    if (!verdict.ok) broken.push(`${spec} — ${verdict.detail}`)
  }
  if (broken.length === 0) {
    console.log(`OK   ${rel} (${new Set(rows).size} plugin rows)`)
  } else {
    bad += broken.length
    console.log(`FAIL ${rel}`)
    for (const b of broken) console.log(`       ${b}`)
  }
}
console.log(bad === 0 ? '\nall plugin rows resolve' : `\n${bad} broken plugin row(s)`)
process.exit(bad === 0 ? 0 : 1)
