/** Bundled-pnpm location and the launcher fact exported to the harness child. */

import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

/**
 * Locate the pnpm entry script shipped with this application.
 * Packaged builds read `resources/runtime/pnpm`; development reads the
 * overlay-local install (or the `BAF_DSH_PNPM_ENTRY` override, mirroring
 * upstream desktop's `DSH_DESKTOP_PNPM_ENTRY`).
 * @param isPackaged Whether the app runs from an installer tree.
 * @param resourcesPath `process.resourcesPath` in packaged builds.
 * @param desktopRoot The overlay/desktop directory (development install root).
 * @returns The absolute `pnpm.mjs` path, or undefined when nothing is bundled.
 */
export function bundledPnpmEntry(
  isPackaged: boolean,
  resourcesPath: string,
  desktopRoot: string,
): string | undefined {
  const override = process.env.BAF_DSH_PNPM_ENTRY
  const candidates = override !== undefined && override !== ''
    ? [override]
    : isPackaged
      ? [join(resourcesPath, 'runtime', 'pnpm', 'bin', 'pnpm.mjs')]
      : [join(desktopRoot, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')]
  return candidates.find(candidate => existsSync(candidate))
}

/**
 * Build the `DSH_PACKAGE_MANAGER` fact: run the bundled pnpm entry under the
 * same Node the harness child itself uses, with that Node first on PATH for
 * pnpm's own lifecycle children. The harness layers this env over its base
 * environment, so only the PATH delta is needed.
 * @param node Absolute path of the Node binary running the harness child.
 * @param pnpmEntry Absolute path of the bundled `pnpm.mjs`.
 * @param parentPath The child's inherited PATH value.
 * @returns The JSON-encoded launcher fact.
 */
export function packageManagerEnvJson(node: string, pnpmEntry: string, parentPath: string | undefined): string {
  return JSON.stringify({
    command: node,
    args: ['--expose-internals', pnpmEntry],
    env: { PATH: `${dirname(node)}${delimiter}${parentPath ?? ''}` },
  })
}

/**
 * Resolve the featured-plugins manifest the child should read: the
 * hot-updated copy under `<userData>/plugin` wins; the packaged seed under
 * `resources/plugin` is the fallback for a fresh install.
 * @param userDataManifest `<userData>/plugin/featured-plugins.json`.
 * @param packagedManifest Packaged `plugin/featured-plugins.json` seed.
 * @returns The first existing manifest path, or undefined when neither ships.
 */
export function featuredManifestPath(userDataManifest: string, packagedManifest: string): string | undefined {
  if (existsSync(userDataManifest)) return userDataManifest
  if (existsSync(packagedManifest)) return packagedManifest
  return undefined
}
