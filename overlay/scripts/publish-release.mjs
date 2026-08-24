#!/usr/bin/env node
/**
 * Publish baf-dsh update artifacts to GitHub Releases (no Actions).
 *
 * Prerequisites:
 *   - `gh auth login` (needs repo contents write)
 *   - Run `node scripts/build-release.mjs` first (or `npm run build-release`)
 *
 * Usage (from overlay/):
 *   node scripts/publish-release.mjs
 *   node scripts/publish-release.mjs --repo Wang-Xutao/deepseek-harness
 *   node scripts/publish-release.mjs --dry-run
 *   node scripts/publish-release.mjs --skip-channel   # only version tag release
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(overlayRoot, '..')
const updateDir = join(overlayRoot, 'desktop', 'dist', 'update')
const CHANNEL_TAG = 'baf-channel-stable'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const skipChannel = args.includes('--skip-channel')
const repoIdx = args.indexOf('--repo')
const repo = repoIdx >= 0 ? args[repoIdx + 1] : 'Wang-Xutao/deepseek-harness'
if (repoIdx >= 0 && (repo === undefined || repo.startsWith('--'))) {
  console.error('publish-release: --repo 需要 owner/name 参数')
  process.exit(1)
}

const desktopPkg = JSON.parse(readFileSync(join(overlayRoot, 'desktop', 'package.json'), 'utf8'))
const version = desktopPkg.version
const tag = `baf-dsh-v${version}`

/**
 * @param {string[]} ghArgs
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function gh(ghArgs) {
  return spawnSync('gh', ghArgs, { encoding: 'utf8', shell: true, cwd: repoRoot })
}

function requireGh() {
  const ver = spawnSync('gh', ['--version'], { encoding: 'utf8', shell: true })
  if (ver.status !== 0) {
    console.error('publish-release: 需要安装 GitHub CLI 并登录：gh auth login')
    process.exit(1)
  }
  const auth = gh(['auth', 'status'])
  if (auth.status !== 0) {
    console.error(auth.stdout + auth.stderr)
    console.error('publish-release: gh 未登录，请执行 gh auth login')
    process.exit(1)
  }
}

/** @param {string} dir @param {RegExp} pattern */
function globFiles(dir, pattern) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(name => pattern.test(name))
    .map(name => join(dir, name))
}

function collectVersionAssets() {
  const manifest = join(updateDir, 'manifest.json')
  if (!existsSync(manifest)) {
    console.error(`publish-release: 缺少 ${manifest}，请先运行 build-release`)
    process.exit(1)
  }
  const assets = [manifest]
  const sig = join(updateDir, 'manifest.sig')
  if (existsSync(sig)) assets.push(sig)
  for (const z of globFiles(updateDir, /^baf-plugin-.*\.zip$/)) assets.push(z)
  for (const z of globFiles(updateDir, /^baf-runtime-.*\.zip$/)) assets.push(z)
  const setup = join(overlayRoot, 'desktop', 'dist', `baf-dsh-Setup-${version}.exe`)
  if (existsSync(setup)) assets.push(setup)
  return assets
}

/**
 * @param {string} releaseTag
 * @param {string[]} assetPaths
 * @param {string} title
 * @param {string} notes
 */
function publishRelease(releaseTag, assetPaths, title, notes) {
  console.log(`\npublish-release: ${releaseTag}`)
  for (const p of assetPaths) console.log(`  + ${p}`)

  if (dryRun) return

  const view = gh(['release', 'view', releaseTag, '-R', repo])
  if (view.status === 0) {
    console.log(`publish-release: Release 已存在，上传/覆盖资产`)
    const upload = spawnSync(
      'gh',
      ['release', 'upload', releaseTag, ...assetPaths, '--clobber', '-R', repo],
      { stdio: 'inherit', shell: true, cwd: repoRoot },
    )
    if (upload.status !== 0) process.exit(upload.status ?? 1)
    return
  }

  const create = spawnSync(
    'gh',
    ['release', 'create', releaseTag, ...assetPaths, '-R', repo, '--title', title, '--notes', notes],
    { stdio: 'inherit', shell: true, cwd: repoRoot },
  )
  if (create.status !== 0) process.exit(create.status ?? 1)
}

function refreshChannelStable(channelAssets) {
  console.log(`\npublish-release: 刷新 ${CHANNEL_TAG}`)
  for (const p of channelAssets) console.log(`  + ${p}`)

  if (dryRun) return

  gh(['release', 'delete', CHANNEL_TAG, '-R', repo, '--yes'])
  spawnSync('git', ['push', 'origin', `:refs/tags/${CHANNEL_TAG}`], {
    stdio: 'inherit',
    shell: true,
    cwd: repoRoot,
  })
  const tagLocal = spawnSync('git', ['tag', '-f', CHANNEL_TAG], {
    stdio: 'inherit',
    shell: true,
    cwd: repoRoot,
  })
  if (tagLocal.status !== 0) process.exit(tagLocal.status ?? 1)
  const tagPush = spawnSync('git', ['push', '-f', 'origin', CHANNEL_TAG], {
    stdio: 'inherit',
    shell: true,
    cwd: repoRoot,
  })
  if (tagPush.status !== 0) process.exit(tagPush.status ?? 1)

  const create = spawnSync(
    'gh',
    [
      'release', 'create', CHANNEL_TAG, ...channelAssets,
      '-R', repo,
      '--title', CHANNEL_TAG,
      '--notes', 'Stable channel pointer for baf-dsh updater',
    ],
    { stdio: 'inherit', shell: true, cwd: repoRoot },
  )
  if (create.status !== 0) process.exit(create.status ?? 1)
}

if (!dryRun) {
  requireGh()
}

const versionAssets = collectVersionAssets()
const channelAssets = versionAssets.filter(p =>
  p.endsWith('manifest.json') || p.endsWith('manifest.sig'))

publishRelease(
  tag,
  versionAssets,
  tag,
  `baf-dsh ${version} (channel stable)`,
)

if (!skipChannel) {
  refreshChannelStable(channelAssets)
}

console.log(`\npublish-release: 完成${dryRun ? '（dry-run）' : ''}`)
console.log(`  版本 Release: https://github.com/${repo}/releases/tag/${tag}`)
if (!skipChannel) {
  console.log(`  通道 Release: https://github.com/${repo}/releases/tag/${CHANNEL_TAG}`)
}
