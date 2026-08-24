#!/usr/bin/env node
/**
 * Local release build (no GitHub Actions): harness + overlay installer + update zips + manifest.
 *
 * Usage (from overlay/):
 *   node scripts/build-release.mjs
 *   node scripts/build-release.mjs --skip-harness-build   # reuse existing pnpm build outputs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(overlayRoot, '..')
const skipHarnessBuild = process.argv.includes('--skip-harness-build')

/**
 * @param {string} label
 * @param {string} cmd
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptions} [opts]
 */
function run(label, cmd, args, opts = {}) {
  console.log(`\nbuild-release: ${label}`)
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    ...opts,
  })
  if (result.status !== 0) {
    console.error(`build-release: failed — ${label}`)
    process.exit(result.status ?? 1)
  }
}

/** @param {string[]} args */
function pnpm(args) {
  const corepack = spawnSync('corepack', ['pnpm', '--version'], { encoding: 'utf8', shell: true })
  if (corepack.status === 0) {
    run('pnpm', 'corepack', ['pnpm', ...args], { cwd: repoRoot })
    return
  }
  run('pnpm', 'pnpm', args, { cwd: repoRoot })
}

/** @param {string} script */
function runOverlayScript(script) {
  run(script, process.execPath, [join(overlayRoot, 'scripts', script)], { cwd: overlayRoot })
}

if (!skipHarnessBuild) {
  pnpm(['install', '--ignore-scripts'])
  pnpm(['run', 'build'])
  for (const pkg of [
    '@deepseek-ai/dsh-client-ui-settings-updates',
    '@deepseek-ai/dsh-client-ui-settings-general',
    '@deepseek-ai/dsh-client-ui-baf-desktop',
    '@deepseek-ai/dsh-client-ui-sidebar',
  ]) {
    pnpm(['--filter', pkg, 'run', 'bundle'])
  }
  pnpm(['--filter', '@deepseek-ai/dsh-web-frontend', 'run', 'build'])
} else {
  const frontend = join(repoRoot, 'apps', 'web', 'dist', 'index.html')
  const cli = join(repoRoot, 'apps', 'cli', 'lib', 'bin.js')
  if (!existsSync(frontend) || !existsSync(cli)) {
    console.error('build-release: --skip-harness-build 需要已有 apps/web/dist 与 apps/cli/lib/bin.js')
    process.exit(1)
  }
}

run('overlay npm install', 'npm', ['install'], { cwd: overlayRoot })
run('desktop npm install', 'npm', ['--prefix', 'desktop', 'install'], { cwd: overlayRoot })

process.env.ELECTRON_MIRROR ??= 'https://npmmirror.com/mirrors/electron/'
process.env.ELECTRON_BUILDER_BINARIES_MIRROR
  ??= 'https://npmmirror.com/mirrors/electron-builder-binaries/'

runOverlayScript('pack-plugin.mjs')
run('brand-web', 'npm', ['run', 'brand-web'], { cwd: overlayRoot })
runOverlayScript('pack-dsh.mjs')
runOverlayScript('pack-runtime.mjs')
run('prepare-branding', 'npm', ['run', 'prepare-branding'], { cwd: overlayRoot })
run('electron dist', 'npm', ['--prefix', 'desktop', 'run', 'dist'], { cwd: overlayRoot })
runOverlayScript('generate-manifest.mjs')

const version = JSON.parse(readFileSync(join(overlayRoot, 'desktop', 'package.json'), 'utf8')).version
const setup = join(overlayRoot, 'desktop', 'dist', `baf-dsh-Setup-${version}.exe`)
if (!existsSync(setup)) {
  console.error(`build-release: 缺少安装包 ${setup}`)
  process.exit(1)
}

console.log(`\nbuild-release: 完成 baf-dsh ${version}`)
console.log(`  安装包: ${setup}`)
console.log(`  更新资产: ${join(overlayRoot, 'desktop', 'dist', 'update')}`)
