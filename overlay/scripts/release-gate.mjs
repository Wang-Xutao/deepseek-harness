#!/usr/bin/env node
/**
 * Phase 10 release gates (§12 Phase 10 / §14.7) — run AFTER pack + dist +
 * generate-manifest, BEFORE publish. Fails the release when:
 *
 *   1. BAF 存在          packed tree has no presets/baf, or the plugin zip
 *                        does not carry it (meta files[]);
 *   2. system trust      the PACKED roster does not list baf with
 *                        `trust: system` / `copyable: false` (boots the packed
 *                        @deepseek-ai/dsh-agent-presets — this is the scripted
 *                        form of the old manual roster recheck in pack-dsh.mjs);
 *   3. standard default  the packed roster default is not `standard`;
 *   4. composition health packed roster rows all parse healthy and the baf
 *                        composition keeps its domain row (`- id: baf-core`);
 *   5. 版本一致          bafDsh / dsh / bafPlugin / bafPreset / baseline /
 *                        runtime / product-versions / tag all agree;
 *   6. manifest schema   manifest.json satisfies the schema-2 shape
 *                        (authority: overlay/desktop/src/update/manifest.ts —
 *                        this check mirrors parseManifest so a bad manifest
 *                        never ships even though the updater would refuse it);
 *   7. hash 和签名       every manifest artifact hash/size matches the file on
 *                        disk, manifest.sig verifies (Ed25519) over the exact
 *                        manifest bytes, and the keyId is registered in the
 *                        shipped verifier (public-key.ts);
 *   8. artifact 完整性   manifest + sig + plugin zip/meta + runtime zip/meta +
 *                        Setup exe + win-unpacked shell all present.
 *
 * 打包后真实启动（packed dsh web + exe shell smoke）stays in
 * verify-desktop-dir-launch.mjs — the workflow runs it as its own step;
 * rollback smoke is the overlay/desktop vitest suite (apply-scoped rollback +
 * update-surface fixtures), also a dedicated workflow step.
 *
 * Env:
 *   BAF_UPDATE_PRIVATE_KEY_PEM   signing key used for the release (CI secret);
 *                                its public half verifies manifest.sig.
 *   BAF_UPDATE_PUBLIC_KEY_PEM    optional explicit verifier key (preferred).
 *   BAF_RELEASE_ALLOW_TEST_KEY   `1` releases signed with the testOnly key
 *                                (baf-test-2026q4). Temporary until the
 *                                enterprise key lands (Phase 9 剩余项 1) — the
 *                                packaged updater refuses test keys, so a
 *                                test-key release is only good for rehearsal.
 *   BAF_RELEASE_DSH_ROOT         override the packed tree (default
 *                                overlay/desktop/resources/dsh) — for local
 *                                rehearsal against a non-standard checkout.
 */
import { createHash, createPrivateKey, createPublicKey, verify as verifySignature } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const overlayRoot = resolve(here, '..')
const repoRoot = resolve(overlayRoot, '..')
const dshRoot = process.env.BAF_RELEASE_DSH_ROOT
  ? resolve(process.env.BAF_RELEASE_DSH_ROOT)
  : join(overlayRoot, 'desktop', 'resources', 'dsh')
const updateDir = join(overlayRoot, 'desktop', 'dist', 'update')
const desktopDist = join(overlayRoot, 'desktop', 'dist')
const winUnpacked = join(desktopDist, 'win-unpacked', 'baf-dsh.exe')

const SHA256_RE = /^[a-f0-9]{64}$/i
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/
const TEST_KEY_ID = 'baf-test-2026q4'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Read a source file and report whether it declares this keyId as testOnly. */
function keyIsTestOnly(keyId) {
  const source = readFileSync(join(overlayRoot, 'desktop', 'src', 'update', 'public-key.ts'), 'utf8')
  const at = source.indexOf(`keyId: '${keyId}'`)
  if (at < 0) return undefined // unknown keyId — caller reports it
  const rest = source.slice(at)
  const nextKey = rest.indexOf("keyId: '", 10)
  const block = nextKey < 0 ? rest : rest.slice(0, nextKey)
  return /testOnly:\s*true/.test(block)
}

/**
 * Import a package from the PACKED tree (never the workspace) so the gate
 * exercises exactly the bits that ship. Bypasses the exports map on purpose.
 */
async function importPacked(name) {
  const pkgDir = join(dshRoot, 'node_modules', ...name.split('/'))
  const manifest = readJson(join(pkgDir, 'package.json'))
  const entry = typeof manifest.main === 'string' && manifest.main.length > 0 ? manifest.main : 'index.js'
  return import(pathToFileURL(join(pkgDir, entry)).href)
}

// ── shared inputs ────────────────────────────────────────────────────────────

const desktopVersionPath = join(overlayRoot, 'desktop', 'VERSION')
const bafDsh = existsSync(desktopVersionPath)
  ? readFileSync(desktopVersionPath, 'utf8').trim()
  : readJson(join(overlayRoot, 'desktop', 'package.json')).version
const repoPkg = readJson(join(repoRoot, 'package.json'))
const pluginManifest = readJson(join(overlayRoot, 'plugin', 'plugin-manifest.json'))
const manifestPath = join(updateDir, 'manifest.json')
const manifest = existsSync(manifestPath) ? readJson(manifestPath) : undefined
const pluginMetaPath = join(updateDir, 'baf-plugin.meta.json')
const pluginMeta = existsSync(pluginMetaPath) ? readJson(pluginMetaPath) : undefined
const runtimeMetaPath = join(updateDir, 'baf-runtime.meta.json')
const runtimeMeta = existsSync(runtimeMetaPath) ? readJson(runtimeMetaPath) : undefined
const productVersionsPath = join(dshRoot, 'baf-product-versions.json')
const productVersions = existsSync(productVersionsPath) ? readJson(productVersionsPath) : undefined
const baselineId = pluginManifest.baseline ?? 'std-c'

// ── gate runner ──────────────────────────────────────────────────────────────

const failures = []

async function gate(name, fn) {
  try {
    await fn()
    console.log(`[gate] ${name}: ok`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failures.push({ name, message })
    console.error(`[gate] ${name}: FAIL — ${message}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// ── 1. BAF 存在 ──────────────────────────────────────────────────────────────

await gate('1. BAF 存在', () => {
  // 官方 preset 随 runtime 树的 shipped root 分发（pack-dsh 从 workspace 打入
  // @deepseek-ai/dsh-agent-presets/presets/baf）；plugin zip 只带 baseline
  // fixture 与用户插件位。BAF 是否真的在场由 gate 2 的打包树 roster 复检裁决。
  const presetsRoot = join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets')
  for (const rel of ['baf/preset.yml', 'baf/agent.cordis.yml', 'baf/skills']) {
    assert(existsSync(join(presetsRoot, rel)), `打包树缺少 shipped preset 文件 presets/${rel}（查 ${join(presetsRoot, rel)}）`)
  }
  assert(pluginMeta !== undefined, '缺少 baf-plugin.meta.json（先跑 pack-plugin.mjs）')
  // baseline 目录名（baf-baseline-c）是静态 fixture 约定，与 manifest.baseline
  // 标签（std-c）无映射——zip 内只要带着 baseline fixture 本体即可。
  assert(pluginMeta.files.some(file => /^standards\/[^/]+\/baseline\.yml$/.test(file.path)),
    'plugin zip 缺少 standards/*/baseline.yml baseline fixture（pack-plugin meta files[]）')
  assert(existsSync(join(overlayRoot, 'plugin', 'standards')) &&
    readdirSync(join(overlayRoot, 'plugin', 'standards')).some(dir => existsSync(join(overlayRoot, 'plugin', 'standards', dir, 'baseline.yml'))),
    'overlay/plugin/standards/ 下没有任何 baseline fixture')
})

// ── 2/3/4. 打包后 roster 复检（system trust / standard default / composition）──

await gate('2. system trust（打包树 roster 复检）', async () => {
  const previousHome = process.env.DSH_HOME
  const home = mkdtempSync(join(tmpdir(), 'baf-release-gate-'))
  process.env.DSH_HOME = home
  try {
    const { Context } = await importPacked('@deepseek-ai/cordis')
    const Loader = (await importPacked('@deepseek-ai/cordis-plugin-loader')).default
    const Include = (await importPacked('@deepseek-ai/cordis-plugin-include')).default
    const SessionProjectionRegistry = (await importPacked('@deepseek-ai/dsh-session-projection')).default
    const AgentPresets = (await importPacked('@deepseek-ai/dsh-agent-presets')).default

    // Same minimal boot as packages/preset/agent-presets/tests/baf-roster.spec.ts.
    // baseUrl anchors composition-row module resolution inside the packed tree.
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(dshRoot).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(AgentPresets, {
      default: 'standard',
      roots: [],
      includeShippedRoot: true,
      includeUserRoot: false,
    })
    try {
      const listed = await ctx.agentPresets.list()
      assert(listed[0]?.id === 'standard', `roster 第一项必须是 standard，实得 [${listed.map(p => p.id).join(', ')}]`)
      const baf = listed.find(preset => preset.id === 'baf')
      assert(baf !== undefined, '打包树 roster 缺少 baf')
      assert(listed[1]?.id === 'baf', `baf 必须紧随 standard，实得 [${listed.map(p => p.id).join(', ')}]`)
      assert(baf.trust === 'system', `baf trust 必须为 system，实得 ${String(baf.trust)}`)
      assert(baf.copyable === false, 'baf 必须不可复制（copyable: false）')
      assert(ctx.agentPresets.defaultId === 'standard', `默认 preset 必须是 standard，实得 ${String(ctx.agentPresets.defaultId)}`)
      assert(listed.every(preset => preset.trust === 'system'), 'shipped roster 出现非 system trust 行')

      // Composition health: every shipped row parses; baf keeps its domain row.
      const broken = listed.filter(preset => preset.broken !== undefined)
      assert(broken.length === 0, `打包树 composition 存在 broken 行：${broken.map(p => `${p.id}(${p.broken})`).join('; ')}`)
      const compositionPath = join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets', 'baf', 'agent.cordis.yml')
      const composition = readFileSync(compositionPath, 'utf8')
      assert(/^\s*- id: baf-core\s*$/m.test(composition), 'baf composition 缺少域服务行 `- id: baf-core`')
    } finally {
      // 短命 CI 进程：不追 Cordis 精细拆除，进程退出时统一回收。
    }
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    try {
      rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {
      // 临时目录残留无害（tmpdir）
    }
  }
})

// ── 5. 版本一致 ──────────────────────────────────────────────────────────────

await gate('5. 版本一致', () => {
  const desktopPkgVersion = readJson(join(overlayRoot, 'desktop', 'package.json')).version
  assert(bafDsh.length > 0 && SEMVER_RE.test(bafDsh), `desktop VERSION 不是 semver：${bafDsh}`)
  assert(bafDsh === desktopPkgVersion, `desktop VERSION ${bafDsh} != desktop package.json ${desktopPkgVersion}`)
  assert(manifest !== undefined, '缺少 manifest.json（先跑 generate-manifest.mjs）')
  assert(manifest.bafDsh === bafDsh, `manifest.bafDsh ${manifest.bafDsh} != ${bafDsh}`)
  assert(manifest.tag === `baf-dsh-v${bafDsh}`, `manifest.tag ${manifest.tag} != baf-dsh-v${bafDsh}`)
  assert(manifest.minShell === bafDsh, `manifest.minShell ${manifest.minShell} != ${bafDsh}`)
  assert(repoPkg.version === manifest.dsh, `根 package.json ${repoPkg.version} != manifest.dsh ${manifest.dsh}`)
  assert(pluginManifest.version === manifest.bafPlugin, `plugin-manifest ${pluginManifest.version} != manifest.bafPlugin ${manifest.bafPlugin}`)
  assert(pluginManifest.version === manifest.bafPreset, `plugin-manifest ${pluginManifest.version} != manifest.bafPreset ${manifest.bafPreset}`)
  assert(baselineId === manifest.baseline, `plugin baseline ${baselineId} != manifest.baseline ${manifest.baseline}`)
  assert(existsSync(join(overlayRoot, 'plugin', 'standards')) &&
    readdirSync(join(overlayRoot, 'plugin', 'standards')).some(dir => existsSync(join(overlayRoot, 'plugin', 'standards', dir, 'baseline.yml'))),
    'overlay/plugin/standards/ 下没有任何 baseline fixture（baseline.yml）')
  assert(pluginMeta !== undefined && pluginMeta.version === pluginManifest.version,
    `baf-plugin.meta.json version 与 plugin-manifest 不一致`)
  assert(pluginMeta?.bafVersion === pluginManifest.version, 'baf-plugin.meta.json bafVersion 与 plugin-manifest 不一致')
  assert(runtimeMeta !== undefined, '缺少 baf-runtime.meta.json（先跑 pack-runtime.mjs）')
  assert(runtimeMeta.version === repoPkg.version, `runtime zip ${runtimeMeta.version} != dsh ${repoPkg.version}`)
  const presetSchema = pluginManifest.presetSchema ?? 1
  assert(manifest.presetSchema === presetSchema, `manifest.presetSchema ${manifest.presetSchema} != plugin ${presetSchema}`)

  // baf-product-versions.json (embed-side view) must be fresh, not stale.
  assert(productVersions !== undefined, `打包树缺少 baf-product-versions.json（先跑 pack-dsh.mjs，查 ${productVersionsPath}）`)
  assert(productVersions.bafDsh === bafDsh, `product-versions.bafDsh ${productVersions.bafDsh} != ${bafDsh}`)
  assert(productVersions.dsh === repoPkg.version, `product-versions.dsh ${productVersions.dsh} != ${repoPkg.version}`)
  assert(productVersions.bafPlugin === pluginManifest.version, `product-versions.bafPlugin ${productVersions.bafPlugin} != ${pluginManifest.version}`)
  for (const [key, pkgDir] of [
    ['bafCore', 'packages/baf/baf-core'],
    ['bafWorkflow', 'packages/baf/baf-workflow'],
    ['bafOpenspec', 'packages/baf/baf-openspec'],
    ['bafStandard', 'packages/baf/baf-standard'],
    ['bafQuality', 'packages/baf/baf-quality'],
    ['bafGuard', 'packages/baf/baf-guard'],
    ['bafScaffold', 'packages/baf/baf-scaffold'],
  ]) {
    const pkgVersion = readJson(join(repoRoot, pkgDir, 'package.json')).version
    assert(productVersions[key] === pkgVersion, `product-versions.${key} ${productVersions[key]} != ${pkgDir} ${pkgVersion}`)
  }
})

// ── 6. manifest schema ───────────────────────────────────────────────────────
// Mirrors overlay/desktop/src/update/manifest.ts parseManifest (schema 2) —
// that module is the authority; this copy keeps a malformed manifest from
// ever being published even though every updater would reject it.

await gate('6. manifest schema', () => {
  assert(manifest !== undefined, '缺少 manifest.json（先跑 generate-manifest.mjs）')
  assert(manifest.schema === 2, 'manifest.schema 必须为 2')
  for (const key of ['channel', 'tag', 'issuedAt', 'expiresAt', 'bafDsh', 'dsh', 'bafPlugin', 'bafPreset', 'baseline', 'minShell']) {
    const value = manifest[key]
    assert(typeof value === 'string' && value.length > 0, `manifest.${key} 缺失或为空`)
  }
  assert(ISO_RE.test(manifest.issuedAt) && ISO_RE.test(manifest.expiresAt), 'manifest.issuedAt/expiresAt 必须为 ISO 8601')
  assert(Date.parse(manifest.expiresAt) > Date.parse(manifest.issuedAt), 'manifest.expiresAt 必须晚于 issuedAt')
  assert(Number.isInteger(manifest.releaseEpoch) && manifest.releaseEpoch >= 1, 'manifest.releaseEpoch 必须为正整数')
  assert(manifest.tag.startsWith('baf-dsh-v'), 'manifest.tag 必须以 baf-dsh-v 开头')
  for (const key of ['bafDsh', 'dsh', 'bafPlugin', 'minShell']) {
    assert(SEMVER_RE.test(manifest[key]), `manifest.${key} 必须为 semver`)
  }
  assert(typeof manifest.force === 'boolean', 'manifest.force 必须为布尔')
  const compatibility = manifest.compatibility
  assert(typeof compatibility === 'object' && compatibility !== null
    && typeof compatibility.minDsh === 'string' && typeof compatibility.maxDsh === 'string',
  'manifest.compatibility 缺失')
  assert(manifest.systemResources.includes('presets/baf'), 'manifest.systemResources 必须声明 presets/baf')
  const rollback = manifest.rollback
  assert(typeof rollback === 'object' && rollback !== null && rollback.supported === true
    && typeof rollback.minimumVersion === 'string',
  'manifest.rollback 必须声明支持回滚')
  const signature = manifest.signature
  assert(typeof signature === 'object' && signature !== null, 'manifest.signature 缺失（§14.7：未签名即失败）')
  assert(signature.algorithm === 'ed25519', 'manifest.signature.algorithm 必须为 ed25519')
  assert(typeof signature.keyId === 'string' && signature.keyId.length > 0, 'manifest.signature.keyId 缺失')
  assert(typeof signature.asset === 'string' && signature.asset.length > 0, 'manifest.signature.asset 缺失')
  for (const [scope, artifact] of Object.entries(manifest.artifacts ?? {})) {
    assert(artifact && typeof artifact.name === 'string' && artifact.name.length > 0, `manifest.artifacts.${scope}.name 缺失`)
    assert(SHA256_RE.test(artifact.sha256 ?? ''), `manifest.artifacts.${scope}.sha256 非法`)
    assert(Number.isFinite(artifact.size) && artifact.size >= 0, `manifest.artifacts.${scope}.size 非法`)
  }
})

// ── 7. hash 和签名 ───────────────────────────────────────────────────────────

await gate('7. hash 和签名', () => {
  assert(manifest !== undefined, '缺少 manifest.json（先跑 generate-manifest.mjs）')
  // Artifact hashes: the bytes on disk must match what the manifest signed.
  const artifactPaths = {
    plugin: join(updateDir, manifest.artifacts.plugin?.name ?? ''),
    runtime: join(updateDir, manifest.artifacts.runtime?.name ?? ''),
    shell: join(desktopDist, manifest.artifacts.shell?.name ?? ''),
  }
  for (const [scope, artifact] of Object.entries(manifest.artifacts ?? {})) {
    const path = artifactPaths[scope]
    assert(existsSync(path), `manifest.artifacts.${scope} 指向的文件缺失：${path}`)
    const actual = sha256File(path)
    assert(actual === artifact.sha256, `manifest.artifacts.${scope} sha256 不符（${path}）`)
    assert(statSize(path) === artifact.size, `manifest.artifacts.${scope} size 不符（${path}）`)
  }
  // meta ↔ manifest cross-check: pack-plugin/pack-runtime recorded the same
  // whole-zip hash the manifest embedded.
  if (manifest.artifacts.plugin !== undefined) {
    assert(pluginMeta?.sha256 === manifest.artifacts.plugin.sha256, 'baf-plugin.meta.json sha256 与 manifest 不一致')
  }
  if (manifest.artifacts.runtime !== undefined) {
    assert(runtimeMeta?.sha256 === manifest.artifacts.runtime.sha256, 'baf-runtime.meta.json sha256 与 manifest 不一致')
  }

  // Signature: manifest.sig must verify over the exact manifest.json bytes
  // with the release signing key (the same key the CI step signed with).
  const sigPath = join(updateDir, 'manifest.sig')
  assert(existsSync(sigPath), '缺少 manifest.sig（§14.7：未签名即失败）')
  const pem = process.env.BAF_UPDATE_PUBLIC_KEY_PEM
    ?? derivePublicPem()
  const publicKey = createPublicKey(pem)
  const ok = verifySignature(
    null,
    readFileSync(manifestPath),
    publicKey,
    Buffer.from(readFileSync(sigPath, 'utf8').trim(), 'base64'),
  )
  assert(ok, 'manifest.sig 验签失败：签名与 manifest.json 字节或签名密钥不匹配')

  // The shipped updater must know this keyId, or customers can never verify.
  const registered = keyIsTestOnly(manifest.signature.keyId)
  assert(registered !== undefined, `keyId ${manifest.signature.keyId} 未注册于 overlay/desktop/src/update/public-key.ts（先注册再发布）`)
  if (registered === true) {
    assert(process.env.BAF_RELEASE_ALLOW_TEST_KEY === '1',
      `签名 key ${manifest.signature.keyId} 是 testOnly 测试密钥，打包后的更新器会拒绝它；`
      + '换正式企业密钥（public-key.ts 注册 + CI secret）后发布，'
      + '或显式设置 BAF_RELEASE_ALLOW_TEST_KEY=1 走演练发布（Phase 9 剩余项 1）')
    console.error('[gate] 7. hash 和签名: WARNING — 使用 testOnly 测试密钥签署（演练模式，客户侧更新器将拒绝本 manifest）')
  }
})

/** Public PEM for verification: explicit env, else derived from the release private key. */
function derivePublicPem() {
  const pem = process.env.BAF_UPDATE_PRIVATE_KEY_PEM
  if (pem !== undefined && pem.includes('BEGIN PRIVATE KEY')) {
    return createPublicKey(createPrivateKey(pem)).export({ format: 'pem', type: 'spki' }).toString()
  }
  const testPrivate = join(overlayRoot, 'scripts', '.baf-update-test-private.pem')
  if (existsSync(testPrivate)) {
    return createPublicKey(createPrivateKey(readFileSync(testPrivate, 'utf8'))).export({ format: 'pem', type: 'spki' }).toString()
  }
  throw new Error('无可用验签公钥：设 BAF_UPDATE_PUBLIC_KEY_PEM，或提供 BAF_UPDATE_PRIVATE_KEY_PEM / 本地测试私钥')
}

function statSize(path) {
  return readFileSync(path).byteLength
}

// ── 8. artifact 完整性 ───────────────────────────────────────────────────────

await gate('8. artifact 完整性', () => {
  assert(manifest !== undefined, '缺少 manifest.json（先跑 generate-manifest.mjs）')
  assert(pluginMeta !== undefined, '缺少 baf-plugin.meta.json（先跑 pack-plugin.mjs）')
  assert(runtimeMeta !== undefined, '缺少 baf-runtime.meta.json（先跑 pack-runtime.mjs）')
  const required = [
    ['manifest.json', manifestPath],
    ['manifest.sig', join(updateDir, 'manifest.sig')],
    ['baf-plugin.meta.json', pluginMetaPath],
    ['baf-runtime.meta.json', runtimeMetaPath],
    [`baf-plugin-${pluginManifest.version}.zip`, join(updateDir, `baf-plugin-${pluginManifest.version}.zip`)],
    [`baf-runtime-${repoPkg.version}.zip`, join(updateDir, `baf-runtime-${repoPkg.version}.zip`)],
    [`baf-dsh-Setup-${bafDsh}.exe`, join(desktopDist, `baf-dsh-Setup-${bafDsh}.exe`)],
    ['win-unpacked shell（真实启动冒烟的输入）', winUnpacked],
  ]
  for (const [label, path] of required) {
    assert(existsSync(path), `发布产物缺失 ${label}：${path}`)
  }
  // Every meta-listed file hash must still match the zip on disk (guards a
  // repack that forgot to regenerate meta).
  for (const [metaName, meta, zipName] of [
    ['baf-plugin', pluginMeta, `baf-plugin-${pluginManifest.version}.zip`],
    ['baf-runtime', runtimeMeta, `baf-runtime-${repoPkg.version}.zip`],
  ]) {
    assert(meta.name === zipName, `${metaName}.meta.json name ${meta.name} != ${zipName}`)
    const actual = sha256File(join(updateDir, zipName))
    assert(actual === meta.sha256, `${zipName} 内容与 ${metaName}.meta.json sha256 不符（重打包后未重生成 meta？）`)
  }
  assert(pluginMeta.files.length > 0, 'baf-plugin.meta.json files[] 为空')
})

// ── summary ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\nrelease-gate: ${failures.length} 项门禁未过，发布中止：`)
  for (const [index, failure] of failures.entries()) {
    console.error(`  ${index + 1}. [${failure.name}] ${failure.message}`)
  }
  process.exit(1)
}
console.log(`\nrelease-gate: 全部门禁通过（baf-dsh ${bafDsh} / dsh ${repoPkg.version} / plugin ${pluginManifest.version} / baseline ${baselineId}）`)
