/**
 * Rebuild the browser shell with baf-dsh product title and version badge.
 * Must run after upstream `pnpm run build` artifacts exist; embeds
 * DSH_CLIENT_TITLE / DSH_CLIENT_BUILD_LABEL into ui-sidebar, ui-renderer, and apps/web.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(overlayRoot, '..')
const desktopPkg = JSON.parse(readFileSync(resolve(overlayRoot, 'desktop/package.json'), 'utf8'))
const version = typeof desktopPkg.version === 'string' ? desktopPkg.version : ''
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`brand-web: invalid desktop version ${JSON.stringify(version)}`)
  process.exit(1)
}

function resolvePnpm() {
  const direct = spawnSync('pnpm', ['--version'], { encoding: 'utf8', shell: true })
  if (direct.status === 0) return { command: 'pnpm', argsPrefix: [] }
  const viaCorepack = spawnSync('corepack', ['pnpm', '--version'], { encoding: 'utf8', shell: true })
  if (viaCorepack.status === 0) return { command: 'corepack', argsPrefix: ['pnpm'] }
  throw new Error('未找到 pnpm。请安装 pnpm，或使用 corepack pnpm')
}

function shortCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error('brand-web: unable to read git HEAD for DSH_CLIENT_COMMIT_HASH')
  }
  return result.stdout.trim().slice(0, 7).toLowerCase()
}

const pnpm = resolvePnpm()
const env = {
  ...process.env,
  DSH_CLIENT_TITLE: 'BAF DSH',
  DSH_CLIENT_BUILD_LABEL: `v${version}`,
  DSH_CLIENT_COMMIT_HASH: shortCommit(),
}

const steps = [
  ['--filter', '@deepseek-ai/dsh-client-ui-sidebar', 'run', 'bundle'],
  ['--filter', '@deepseek-ai/dsh-client-ui-renderer', 'run', 'bundle'],
  ['--filter', '@deepseek-ai/dsh-web-frontend', 'run', 'build'],
]

for (const args of steps) {
  console.log(`brand-web: ${pnpm.command} ${[...pnpm.argsPrefix, ...args].join(' ')}`)
  const result = spawnSync(pnpm.command, [...pnpm.argsPrefix, ...args], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log(`brand-web: embedded title "BAF DSH" / label "v${version}"`)
