/**
 * Gate that fails fast when `/help/` is missing or stale in `apps/web/dist`.
 *
 * The desktop help panel (`packages/client/ui-baf-desktop/src/client/HelpFooterAction.tsx`)
 * embeds the same-origin `/help/index.html`; `pack-dsh` ships the entire
 * `apps/web/dist` tree, so a missing or out-of-date `help/` reproduces as an
 * empty iframe in the packaged installer. MkDocs sources live in
 * `overlay/docs/help/`; `npm run docs:build` regenerates `apps/web/dist/help/`
 * and is the only first-party way to refresh it.
 *
 * Intended callers: `npm run dist` and `npm run dist:dir` in `overlay/`,
 * chained ahead of `pack-dsh`. The script does not write any files; it exits
 * with a clear message and non-zero status on a miss.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(overlayRoot, '..')
const distHelp = resolve(repoRoot, 'apps/web/dist/help/index.html')

/** Strings that must appear inside the generated help index for it to count as a MkDocs build of baf-dsh. */
const REQUIRED_TITLE = '<title>baf-dsh</title>'

function fail(reason) {
  console.error(`verify-help-build: ${reason}`)
  console.error('  请在 overlay/ 先执行 `npm run docs:build`，再重试打包。')
  process.exit(1)
}

if (!existsSync(distHelp)) {
  fail(`未找到 ${distHelp}`)
}

const html = readFileSync(distHelp, 'utf8')
if (!html.includes(REQUIRED_TITLE)) {
  fail(`${distHelp} 不含 ${JSON.stringify(REQUIRED_TITLE)}，可能不是本次 docs:build 产物`)
}

console.log(`verify-help-build: ok -> ${distHelp}`)