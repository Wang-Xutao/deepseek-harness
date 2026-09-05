#!/usr/bin/env node
/**
 * Phase 0 gate: parse baseline fixture + routeProfile schema (Ajv 2020-12).
 * Exit non-zero on failure. Does not guess enterprise tool values.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../..')
const ajvRequire = createRequire(join(repoRoot, 'node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/package.json'))
const yamlRequire = createRequire(join(repoRoot, 'node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/package.json'))
const Ajv2020 = ajvRequire('ajv/dist/2020.js').default ?? ajvRequire('ajv/dist/2020.js')
const yaml = yamlRequire('yaml')

const routeSchemaPath = join(repoRoot, 'packages/baf/baf-core/schema/route-profile.schema.json')
const fixturePaths = [
  join(repoRoot, 'overlay/plugin/standards/baf-baseline-c/baseline.yml'),
  join(repoRoot, 'packages/baf/baf-core/tests/fixtures/baseline/baseline.yml'),
]

const route = JSON.parse(readFileSync(routeSchemaPath, 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: false })
const validateRoute = ajv.compile(route)
const required = ['schema', 'baselineId', 'bafCompatibility', 'workflow', 'routeProfile', 'openspec', 'standard', 'stack', 'guard']

let failed = false
const fixtures = fixturePaths.map((path) => ({ path, data: yaml.parse(readFileSync(path, 'utf8')) }))

if (JSON.stringify(fixtures[0].data) !== JSON.stringify(fixtures[1].data)) {
  console.error('fixture copies diverge:', fixturePaths.join(' vs '))
  failed = true
}

for (const { path, data } of fixtures) {
  const missing = required.filter((key) => data[key] === undefined)
  if (missing.length > 0) {
    console.error(`${path}: missing top-level keys: ${missing.join(', ')}`)
    failed = true
  }
  if (data.schema !== 1) {
    console.error(`${path}: schema must be 1, got ${String(data.schema)}`)
    failed = true
  }
  if (!validateRoute(data.routeProfile)) {
    console.error(`${path}: routeProfile invalid:`, validateRoute.errors)
    failed = true
  }
  const bad = {
    ...data.routeProfile,
    phases: { intake: data.routeProfile.phases.intake },
  }
  if (validateRoute(bad)) {
    console.error(`${path}: incomplete phases unexpectedly accepted`)
    failed = true
  }
}

if (failed) process.exit(1)
console.log('verify-baf-baseline-fixture: ok')
