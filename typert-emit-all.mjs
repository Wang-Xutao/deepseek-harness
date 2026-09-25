/* Full workspace typert emit — verbatim mirror of the tsdown plugin's
 * emitWorkspace (packages/typert/generator/src/tsdown-plugin.ts lines 96-105).
 * Usage: NODE_OPTIONS=--max-old-space-size=8192 node typert-emit-all.mjs */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { WorkspaceTypertGenerator } from './packages/typert/generator/lib/types/workspace.js'

const root = process.cwd()

function readManifest(packageDir) {
  return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
}

function hasTypertExport(exportsField) {
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) return false
  return Object.hasOwn(exportsField, './typert')
    || Object.hasOwn(exportsField, './client/typert')
    || Object.hasOwn(exportsField, './remote')
}

function emitArtifacts(packageDir, artifacts) {
  const output = join(packageDir, 'lib')
  mkdirSync(output, { recursive: true })
  let emittedRemote = false
  for (const artifact of artifacts) {
    writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
    writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
    console.log(`wrote ${artifact.packageRoot}/lib/typert.${artifact.face}.{js,dts}`)
    if (artifact.remote !== undefined) {
      emittedRemote = true
      writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
      writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
      writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
      console.log(`wrote ${artifact.packageRoot}/lib/typert.remote-client.*`)
    }
  }
  if (!emittedRemote && artifacts.some(artifact => artifact.face === 'host')) {
    for (const file of [
      'typert.remote-client.js',
      'typert.remote-client.d.ts',
      'typert.remote-client.d.ts.map',
    ]) rmSync(join(output, file), { force: true })
  }
}

const generator = new WorkspaceTypertGenerator(root, { checkDiagnostics: false })
const packages = generator.discover(['host'])
  .filter(candidate => hasTypertExport(readManifest(join(root, candidate.root)).exports))
  .map(candidate => candidate.package)
console.log('emitting for', packages.length, 'packages')
for (const artifact of generator.generate(packages, ['host'])) {
  emitArtifacts(join(root, artifact.packageRoot), [artifact])
}
console.log('done')
