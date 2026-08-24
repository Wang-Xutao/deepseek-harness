/**
 * Build MkDocs into overlay/site, then copy into the web frontend dist as /help/.
 * Run from overlay: `npm run docs:build`
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(overlayRoot, '..')
const siteDir = resolve(overlayRoot, 'site')
const distHelp = resolve(repoRoot, 'apps/web/dist/help')

/**
 * @typedef {{ command: string, prefix: string[], build: string[] }} MkdocsAttempt
 */

/** @type {MkdocsAttempt[]} */
const ATTEMPTS = [
  { command: 'py', prefix: ['-3.14', '-m', 'mkdocs'], build: ['build', '--strict'] },
  { command: 'py', prefix: ['-3', '-m', 'mkdocs'], build: ['build', '--strict'] },
  { command: 'py', prefix: ['-m', 'mkdocs'], build: ['build', '--strict'] },
  { command: 'python3', prefix: ['-m', 'mkdocs'], build: ['build', '--strict'] },
  { command: 'python', prefix: ['-m', 'mkdocs'], build: ['build', '--strict'] },
  { command: 'mkdocs', prefix: [], build: ['build', '--strict'] },
]

/**
 * @param {MkdocsAttempt} attempt
 * @returns {boolean}
 */
function tryMkdocs(attempt) {
  const probe = spawnSync(attempt.command, [...attempt.prefix, '--version'], {
    cwd: overlayRoot,
    encoding: 'utf8',
    shell: true,
  })
  if (probe.error || probe.status !== 0) return false
  const out = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.toLowerCase()
  if (!out.includes('mkdocs')) return false

  const result = spawnSync(attempt.command, [...attempt.prefix, ...attempt.build], {
    cwd: overlayRoot,
    stdio: 'inherit',
    shell: true,
  })
  return result.status === 0
}

function runMkdocs() {
  for (const attempt of ATTEMPTS) {
    if (tryMkdocs(attempt)) return
  }
  console.error('docs:build: 未找到 mkdocs（请安装：pip install mkdocs）')
  process.exit(1)
}

runMkdocs()

if (!existsSync(resolve(siteDir, 'index.html'))) {
  console.error('docs:build: site/index.html 缺失')
  process.exit(1)
}

const webDist = resolve(repoRoot, 'apps/web/dist')
if (existsSync(webDist)) {
  rmSync(distHelp, { recursive: true, force: true })
  mkdirSync(distHelp, { recursive: true })
  cpSync(siteDir, distHelp, { recursive: true })
  console.log(`docs:build: synced site -> ${distHelp}`)
} else {
  console.log('docs:build: apps/web/dist 尚不存在，已生成 overlay/site；前端构建后再执行本脚本以同步 /help/')
}

console.log(`docs:build: ok -> ${siteDir}`)
