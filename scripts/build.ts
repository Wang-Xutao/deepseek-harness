/** Run the complete repository build and bind its client artifacts to their public environment. */

import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  CLIENT_BUILD_RECORD_PATH,
  CLIENT_BUILD_PROFILE_SELECTOR,
  clientBuildProcessEnvironment,
  repositoryClientBuildEnvironment,
  resolveClientBuildEnvironment,
  writeClientBuildRecord,
} from './client-build-environment.ts'
import { pnpmInvocation } from './pnpm-invocation.ts'

/** Run one package script through the package manager that invoked this build. */
function runScript(script: string, environment: NodeJS.ProcessEnv): void {
  const invocation = pnpmInvocation(['run', script], environment)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: resolve(import.meta.dirname, '..'),
    env: environment,
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`build: ${script} exited with ${String(result.status ?? result.signal)}`)
  }
}

/**
 * 【变更】2026-09-30 (demo31 问题 2 · 帮助页面空白): build MkDocs and sync it
 * into the web dist as /help/. `build:web`'s vite run empties `apps/web/dist`,
 * which used to delete the help copy that only the overlay release chain
 * (`overlay/scripts/build-docs.mjs` inside `dist`) ever produced — so a
 * locally built web host served an empty iframe for /help/index.html.
 *
 * Best-effort by design: the app build must not hard-fail on a machine
 * without Python/mkdocs — the release chain still runs the strict overlay
 * script itself, where a missing docs build IS fatal.
 * @param environment - build environment (for cwd resolution only).
 */
function syncHelpDocs(environment: NodeJS.ProcessEnv): void {
  const result = spawnSync(process.execPath, ['overlay/scripts/build-docs.mjs'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: environment,
    stdio: 'inherit',
  })
  if (result.error !== undefined || result.status !== 0) {
    console.warn('build: help docs sync skipped (mkdocs unavailable or docs build failed) — /help/ will 404 on this dist')
  }
}

/** Run the full build selected by `--profile` or `DSH_BUILD_CLIENT_PROFILE`. */
function main(): void {
  const { values } = parseArgs({
    options: { profile: { type: 'string' } },
    allowPositionals: false,
  })
  const root = resolve(import.meta.dirname, '..')
  const repositoryEnvironment = repositoryClientBuildEnvironment(root, process.env)
  const profile = values.profile ?? process.env[CLIENT_BUILD_PROFILE_SELECTOR]
  const clientEnvironment = resolveClientBuildEnvironment(repositoryEnvironment, profile)
  const buildEnvironment = clientBuildProcessEnvironment(process.env, clientEnvironment)

  rmSync(resolve(root, CLIENT_BUILD_RECORD_PATH), { force: true })
  runScript('build:native-system', buildEnvironment)
  runScript('build:lib', buildEnvironment)
  runScript('build:web', buildEnvironment)
  syncHelpDocs(buildEnvironment)
  const record = writeClientBuildRecord(root, clientEnvironment)
  console.log(
    `build: recorded ${String(record.artifacts.fileCount)} client artifact(s) with ${String(Object.keys(record.environment).length)} public value(s)`,
  )
}

if (import.meta.main) main()
