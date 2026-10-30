#!/usr/bin/env node
/**
 * Publish the baf-dsh update artifacts to GITLAB Releases (the channel the
 * desktop updater reads since 2026-10-30).
 *
 * 【变更】2026-10-30 (升级途径迁移): the updater reads GitLab Releases on the
 * self-hosted GitLab — `https://gitlab.sinc.lan/api/v4/projects/ai%2Fworkflow%2Fbaf-dsh/releases/<tag>`
 * — and the project's release assets are LINKS, not uploaded files. So this
 * script does two things:
 *
 *   1. uploads every artifact to the project's GENERIC PACKAGE registry
 *      (`PUT /projects/:id/packages/generic/baf-dsh/<version>/<file>`) — the
 *      project is public, so the download URL works without a token;
 *   2. creates (or refreshes) the releases with one link per artifact:
 *      - `baf-dsh-vX.Y.Z` — manifest.json, manifest.sig, the plugin/runtime
 *        zips and the installer;
 *      - `baf-channel-stable` — manifest.json + manifest.sig only (the channel
 *        pointer the updater polls).
 *
 * The link NAME must match the artifact name the manifest carries
 * (`baf-plugin-0.0.3.zip`, …) — the updater looks the artifact up by name.
 *
 * Prerequisites:
 *   - a token with `api` scope on the project (a project access token works):
 *     set GITLAB_TOKEN (or pass --token).
 *   - `node scripts/build-release.mjs` first (or `npm run build-release`).
 *
 * Usage (from overlay/):
 *   node scripts/publish-release-gitlab.mjs
 *   node scripts/publish-release-gitlab.mjs --dry-run
 *   node scripts/publish-release-gitlab.mjs --skip-channel
 *   node scripts/publish-release-gitlab.mjs --host https://gitlab.example --project group/project
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const updateDir = join(overlayRoot, 'desktop', 'dist', 'update')
const CHANNEL_TAG = 'baf-channel-stable'
/** The generic package the artifacts live in — the URL the release links point at. */
const PACKAGE_NAME = 'baf-dsh'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const skipChannel = args.includes('--skip-channel')
const flag = name => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const host = (flag('host') ?? 'https://gitlab.sinc.lan').replace(/\/+$/, '')
const project = flag('project') ?? 'ai/workflow/baf-dsh'
const token = flag('token') ?? process.env.GITLAB_TOKEN ?? ''

const desktopPkg = JSON.parse(readFileSync(join(overlayRoot, 'desktop', 'package.json'), 'utf8'))
const version = flag('version') ?? desktopPkg.version
const tag = flag('tag') ?? `baf-dsh-v${version}`

const projectPath = encodeURIComponent(project)
const api = path => `${host}/api/v4/projects/${projectPath}${path}`
const headers = extra => ({
  'User-Agent': 'baf-dsh-publisher',
  ...(token === '' ? {} : { 'PRIVATE-TOKEN': token }),
  ...extra,
})

/**
 * @param {string} dir
 * @param {RegExp} pattern
 * @returns {string[]}
 */
function globFiles(dir, pattern) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(name => pattern.test(name))
    .map(name => join(dir, name))
}

/** Every artifact this release carries: the manifest, its signature, the zips, the installer. */
function collectArtifacts() {
  const manifest = join(updateDir, 'manifest.json')
  if (!existsSync(manifest)) {
    console.error(`publish-release-gitlab: 缺少 ${manifest}，请先运行 build-release`)
    process.exit(1)
  }
  const files = [manifest]
  const sig = join(updateDir, 'manifest.sig')
  if (existsSync(sig)) files.push(sig)
  files.push(...globFiles(updateDir, /^baf-plugin-.*\.zip$/))
  files.push(...globFiles(updateDir, /^baf-runtime-.*\.zip$/))
  const setup = join(overlayRoot, 'desktop', 'dist', `baf-dsh-Setup-${version}.exe`)
  if (existsSync(setup)) files.push(setup)
  return files
}

/**
 * Upload one file to the generic package registry.
 * @param {string} file
 * @returns {Promise<string>} the public download URL.
 */
async function uploadArtifact(file) {
  const name = basename(file)
  const url = api(`/packages/generic/${PACKAGE_NAME}/${encodeURIComponent(version)}/${encodeURIComponent(name)}`)
  if (dryRun) return url
  const body = readFileSync(file)
  const res = await fetch(url, {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/octet-stream' }),
    body,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`上传 ${name} 失败（HTTP ${String(res.status)}）${detail.slice(0, 300)}`)
  }
  console.log(`  ↑ ${name}（${statSync(file).size} 字节）`)
  return url
}

/**
 * Create the release, or refresh it when it already exists.
 * @param {string} releaseTag
 * @param {{ name: string, url: string }[]} links
 * @param {string} name
 * @param {string} description
 */
async function upsertRelease(releaseTag, links, name, description) {
  const payload = {
    tag_name: releaseTag,
    name,
    description,
    assets: { links: links.map(link => ({ name: link.name, url: link.url, link_type: 'other' })) },
  }
  if (dryRun) {
    console.log(`  → Release ${releaseTag}（dry-run，未写入）`)
    for (const link of links) console.log(`     ${link.name} → ${link.url}`)
    return
  }
  const create = await fetch(api('/releases'), {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
  if (create.ok) {
    console.log(`  ✓ Release ${releaseTag} 已创建`)
    return
  }
  if (create.status !== 409 && create.status !== 400) {
    const detail = await create.text().catch(() => '')
    throw new Error(`创建 Release ${releaseTag} 失败（HTTP ${String(create.status)}）${detail.slice(0, 300)}`)
  }
  // The release exists — refresh its links (the channel release is rebuilt on
  // every publish, so its manifest link must point at the newest file).
  const update = await fetch(api(`/releases/${encodeURIComponent(releaseTag)}`), {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
  if (!update.ok) {
    const detail = await update.text().catch(() => '')
    throw new Error(`更新 Release ${releaseTag} 失败（HTTP ${String(update.status)}）${detail.slice(0, 300)}`)
  }
  console.log(`  ✓ Release ${releaseTag} 已刷新`)
}

if (token === '' && !dryRun) {
  console.error('publish-release-gitlab: 需要 GITLAB_TOKEN（项目 access token，api 权限）')
  process.exit(1)
}

const artifacts = collectArtifacts()
console.log(`publish-release-gitlab: 项目 ${project} @ ${host}`)
console.log(`publish-release-gitlab: 版本 ${version}（tag ${tag}）`)

const links = []
for (const file of artifacts) {
  const url = await uploadArtifact(file)
  links.push({ name: basename(file), url })
}

await upsertRelease(tag, links, tag, `baf-dsh ${version}（channel stable）`)

if (!skipChannel) {
  const channelLinks = links.filter(link => link.name === 'manifest.json' || link.name === 'manifest.sig')
  await upsertRelease(CHANNEL_TAG, channelLinks, CHANNEL_TAG, 'Stable channel pointer for baf-dsh updater')
}

console.log(`\npublish-release-gitlab: 完成${dryRun ? '（dry-run）' : ''}`)
console.log(`  版本 Release: ${host}/${project}/-/releases/${tag}`)
if (!skipChannel) {
  console.log(`  通道 Release: ${host}/${project}/-/releases/${CHANNEL_TAG}`)
  console.log('  桌面端「检查更新」读的就是这条通道。')
}
