import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  lstatSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const overlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(overlayRoot, '..')
const dest = resolve(overlayRoot, 'desktop/resources/dsh')
const frontendDist = resolve(repoRoot, 'apps/web/dist/index.html')
const builtCli = resolve(repoRoot, 'apps/cli/lib/bin.js')

if (!existsSync(frontendDist) || !existsSync(builtCli)) {
  console.error('上游产物缺失：请先在仓库根执行 corepack pnpm run build')
  process.exit(1)
}

function resolvePnpm() {
  const direct = spawnSync('pnpm', ['--version'], { encoding: 'utf8', shell: true })
  if (direct.status === 0) return { command: 'pnpm', argsPrefix: [] }
  const viaCorepack = spawnSync('corepack', ['pnpm', '--version'], { encoding: 'utf8', shell: true })
  if (viaCorepack.status === 0) return { command: 'corepack', argsPrefix: ['pnpm'] }
  throw new Error('未找到 pnpm。请安装 pnpm 11.7.0，或使用 corepack pnpm')
}

/**
 * Discover every package root under a node_modules tree (follows symlinks via realpath).
 * @param {string} nodeModulesDir
 * @param {Map<string, string>} out name -> real package directory
 */
function discoverNodeModules(nodeModulesDir, out) {
  let entries
  try {
    entries = readdirSync(nodeModulesDir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const path = join(nodeModulesDir, entry.name)
    let st
    try {
      st = lstatSync(path)
    } catch {
      continue
    }
    if (!st.isDirectory() && !st.isSymbolicLink()) continue

    if (entry.name === '.pnpm') {
      let folders
      try {
        folders = readdirSync(path)
      } catch {
        continue
      }
      for (const folder of folders) {
        const nested = join(path, folder, 'node_modules')
        if (existsSync(nested)) discoverNodeModules(nested, out)
      }
      continue
    }

    if (entry.name.startsWith('@')) {
      let scoped
      try {
        scoped = readdirSync(path)
      } catch {
        continue
      }
      for (const name of scoped) {
        discoverPackage(join(path, name), out)
      }
      continue
    }

    discoverPackage(path, out)
  }
}

/**
 * @param {string} dir
 * @param {Map<string, string>} out
 */
function discoverPackage(dir, out) {
  let real
  try {
    real = realpathSync(dir)
  } catch {
    return
  }

  const manifestPath = join(real, 'package.json')
  if (!existsSync(manifestPath)) return

  try {
    const name = JSON.parse(readFileSync(manifestPath, 'utf8')).name
    if (typeof name === 'string' && !out.has(name)) {
      out.set(name, real)
    }
  } catch {
    // ignore malformed manifests
  }

  const nested = join(real, 'node_modules')
  if (existsSync(nested)) discoverNodeModules(nested, out)
}

/**
 * Copy package files without nested node_modules (flat hoist).
 * Never follows links that escape the package directory (avoids copying the monorepo/overlay).
 * @param {string} packageDir
 * @param {string} targetDir
 */
function copyPackageFlat(packageDir, targetDir) {
  let packageReal
  try {
    packageReal = realpathSync(packageDir)
  } catch {
    return
  }

  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true })
  }
  mkdirSync(targetDir, { recursive: true })

  /** @type {{ from: string, to: string }[]} */
  const queue = [{ from: packageReal, to: targetDir }]
  while (queue.length > 0) {
    const { from, to } = queue.pop()
    let entries
    try {
      entries = readdirSync(from, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules') continue
      const src = join(from, entry.name)
      const destPath = join(to, entry.name)

      let st
      try {
        st = lstatSync(src)
      } catch {
        continue
      }

      if (st.isSymbolicLink()) {
        let real
        try {
          real = realpathSync(src)
        } catch {
          continue
        }
        // Refuse to follow links that leave this package (e.g. accidental overlay junctions).
        const relToPkg = real.startsWith(packageReal + '\\') || real.startsWith(packageReal + '/') || real === packageReal
        if (!relToPkg) continue
        let targetStat
        try {
          targetStat = lstatSync(real)
        } catch {
          continue
        }
        if (targetStat.isDirectory()) {
          mkdirSync(destPath, { recursive: true })
          queue.push({ from: real, to: destPath })
        } else if (targetStat.isFile()) {
          mkdirSync(dirname(destPath), { recursive: true })
          cpSync(real, destPath)
        }
        continue
      }

      if (st.isDirectory()) {
        mkdirSync(destPath, { recursive: true })
        queue.push({ from: src, to: destPath })
      } else if (st.isFile()) {
        mkdirSync(dirname(destPath), { recursive: true })
        cpSync(src, destPath)
      }
    }
  }
}

/** Copy one built workspace package into the deploy node_modules tree (no symlinks). */
function copyWorkspacePackage(packageDir, nodeModulesRoot, force = false) {
  const manifestPath = join(packageDir, 'package.json')
  if (!existsSync(manifestPath)) return
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const name = manifest.name
  if (typeof name !== 'string' || !name.startsWith('@deepseek-ai/')) return

  const target = join(nodeModulesRoot, ...name.split('/'))
  if (existsSync(target) && !force) return

  copyPackageFlat(packageDir, target)
  console.log(`+ peer/vendor ${name}`)
}

/**
 * Flatten a pnpm deploy tree into a real (non-symlink) node_modules layout for electron-builder.
 * @param {string} stagingRoot
 * @param {string} destRoot
 */
function flattenDeploy(stagingRoot, destRoot) {
  rmSync(destRoot, { recursive: true, force: true })
  mkdirSync(destRoot, { recursive: true })

  // App package files at deploy root (lib, package.json, …) — skip node_modules.
  for (const name of readdirSync(stagingRoot)) {
    if (name === 'node_modules') continue
    const from = join(stagingRoot, name)
    const to = join(destRoot, name)
    let st
    try {
      st = lstatSync(from)
    } catch {
      continue
    }
    if (st.isSymbolicLink()) {
      try {
        cpSync(realpathSync(from), to, { recursive: true })
      } catch {
        // skip broken links
      }
      continue
    }
    cpSync(from, to, { recursive: true })
  }

  /** @type {Map<string, string>} */
  const packages = new Map()
  const stagingNm = join(stagingRoot, 'node_modules')
  if (existsSync(stagingNm)) {
    discoverNodeModules(stagingNm, packages)
  }

  const destNm = join(destRoot, 'node_modules')
  mkdirSync(destNm, { recursive: true })

  let copied = 0
  for (const [name, packageDir] of packages) {
    const target = join(destNm, ...name.split('/'))
    copyPackageFlat(packageDir, target)
    copied += 1
  }
  console.log(`flattened ${String(copied)} packages into node_modules`)
}

const staging = mkdtempSync(join(tmpdir(), 'baf-dsh-pack-'))
const pnpm = resolvePnpm()

try {
  const result = spawnSync(
    pnpm.command,
    [...pnpm.argsPrefix, '--filter', '@deepseek-ai/dsh', 'deploy', '--prod', '--legacy', staging],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, CI: 'true' },
    },
  )
  if (result.status !== 0) {
    console.error('pnpm deploy 失败')
    process.exit(result.status ?? 1)
  }

  console.log('flattening deploy tree (no symlinks)...')
  mkdirSync(resolve(overlayRoot, 'desktop/resources'), { recursive: true })
  flattenDeploy(staging, dest)
} finally {
  rmSync(staging, { recursive: true, force: true })
}

const nestedBin = join(dest, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const flatBin = join(dest, 'lib', 'bin.js')
const binPath = existsSync(flatBin) ? flatBin : nestedBin
if (!existsSync(binPath)) {
  console.error('deploy 结果缺少 dsh 入口')
  process.exit(1)
}

// pnpm deploy --prod 会漏掉大量仅声明为 peer 的 workspace 包；把 monorepo 内
// 全部 @deepseek-ai/* 包补进顶层 node_modules（已存在的不覆盖）。
const nodeModulesRoot = join(dest, 'node_modules')
for (const dir of readdirSync(join(repoRoot, 'vendor'))) {
  copyWorkspacePackage(join(repoRoot, 'vendor', dir), nodeModulesRoot)
}
for (const group of readdirSync(join(repoRoot, 'packages'))) {
  const groupDir = join(repoRoot, 'packages', group)
  let st
  try {
    st = lstatSync(groupDir)
  } catch {
    continue
  }
  if (!st.isDirectory()) continue
  for (const pkg of readdirSync(groupDir)) {
    copyWorkspacePackage(join(groupDir, pkg), nodeModulesRoot)
  }
}
for (const app of readdirSync(join(repoRoot, 'apps'))) {
  copyWorkspacePackage(join(repoRoot, 'apps', app), nodeModulesRoot)
}

const FORCE_PACKAGES = [
  'apps/web',
  'packages/client/ui-settings-general',
  'packages/client/ui-settings-updates',
  'packages/client/ui-baf-desktop',
  'packages/client/ui-baf-tracegraph',
  'packages/boot/app-boot',
  'packages/boot/cmdline',
  'packages/runtime-diagnostics/invariants',
  'packages/util/home-paths',
  'packages/util/launch-environment',
  'packages/core/system-prompt',
]
for (const rel of FORCE_PACKAGES) {
  copyWorkspacePackage(join(repoRoot, rel), nodeModulesRoot, true)
}

const requireFromBin = createRequire(binPath)
const mustResolve = [
  '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/cordis-plugin-group',
  '@deepseek-ai/cordis-plugin-loader',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-web-frontend/dist/index.html',
  '@deepseek-ai/dsh-client-ui-trajectory',
  '@deepseek-ai/dsh-agent-presets',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-shell',
  '@deepseek-ai/dsh-fs',
]
for (const pkg of mustResolve) {
  try {
    requireFromBin.resolve(pkg)
  } catch (err) {
    console.error(`无法解析 ${pkg}:`, err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

writeFileSync(join(dest, '.baf-dsh-pack-ok'), new Date().toISOString())
console.log(`packed dsh -> ${dest}`)
