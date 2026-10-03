/** Parsing and validation for the curated `featured-plugins.json` document. */
import { readFileSync } from 'node:fs'
import type { FeaturedManifest, FeaturedManifestPlugin } from './types.ts'

/** Environment variable carrying the manifest path from the desktop shell. */
export const FEATURED_MANIFEST_ENV = 'BAF_DSH_FEATURED_MANIFEST'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(holder: Record<string, unknown>, field: string, where: string, problems: string[]): string | undefined {
  const value = holder[field]
  if (typeof value === 'string' && value !== '') return value
  problems.push(`${where}: ${field} must be a non-empty string`)
  return undefined
}

function optionalString(holder: Record<string, unknown>, field: string, where: string, problems: string[]): string | undefined {
  const value = holder[field]
  if (value === undefined) return undefined
  if (typeof value === 'string' && value !== '') return value
  problems.push(`${where}: ${field} must be a non-empty string when present`)
  return undefined
}

function optionalBoolean(holder: Record<string, unknown>, field: string, where: string, problems: string[]): boolean | undefined {
  const value = holder[field]
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  problems.push(`${where}: ${field} must be a boolean when present`)
  return undefined
}

function parsePlugin(value: unknown, index: number, problems: string[]): FeaturedManifestPlugin | undefined {
  const where = `plugins[${String(index)}]`
  if (!isRecord(value)) {
    problems.push(`${where}: must be an object`)
    return undefined
  }
  const fields = {
    id: requiredString(value, 'id', where, problems),
    package: requiredString(value, 'package', where, problems),
    version: requiredString(value, 'version', where, problems),
    nameZh: requiredString(value, 'nameZh', where, problems),
    nameEn: requiredString(value, 'nameEn', where, problems),
    descriptionZh: requiredString(value, 'descriptionZh', where, problems),
    descriptionEn: requiredString(value, 'descriptionEn', where, problems),
    homepage: requiredString(value, 'homepage', where, problems),
  }
  const { id, package: pkg, version, nameZh, nameEn, descriptionZh, descriptionEn, homepage } = fields
  if (id === undefined || pkg === undefined || version === undefined || nameZh === undefined
    || nameEn === undefined || descriptionZh === undefined || descriptionEn === undefined
    || homepage === undefined) return undefined
  const registryFirst = optionalString(value, 'registryFirst', where, problems)
  const autoUpdateDefault = optionalBoolean(value, 'autoUpdateDefault', where, problems)
  const peerExemptionExpected = optionalBoolean(value, 'peerExemptionExpected', where, problems)
  const verified = optionalBoolean(value, 'verified', where, problems)
  return {
    id,
    package: pkg,
    version,
    nameZh,
    nameEn,
    descriptionZh,
    descriptionEn,
    homepage,
    ...(registryFirst === undefined ? {} : { registryFirst }),
    ...(autoUpdateDefault === undefined ? {} : { autoUpdateDefault }),
    ...(peerExemptionExpected === undefined ? {} : { peerExemptionExpected }),
    ...(verified === undefined ? {} : { verified }),
  }
}

/**
 * Validate one parsed `featured-plugins.json` document.
 * @param value What `JSON.parse` produced for the manifest file.
 * @returns The manifest, or the first problems that made it unusable.
 */
export function parseFeaturedManifest(value: unknown): { manifest?: FeaturedManifest; problems: string[] } {
  const problems: string[] = []
  if (!isRecord(value)) return { problems: ['manifest must be a JSON object'] }
  if (value.schemaVersion !== 1) return { problems: [`schemaVersion must be 1, got ${JSON.stringify(value.schemaVersion)}`] }
  const revision = value.revision
  if (typeof revision !== 'number' || !Number.isInteger(revision)) return { problems: ['revision must be an integer'] }
  if (!Array.isArray(value.plugins)) return { problems: ['plugins must be an array'] }
  const plugins: FeaturedManifestPlugin[] = []
  const ids = new Set<string>()
  for (const [index, entry] of value.plugins.entries()) {
    const plugin = parsePlugin(entry, index, problems)
    if (plugin === undefined) continue
    if (ids.has(plugin.id)) problems.push(`plugins[${String(index)}]: duplicate id ${JSON.stringify(plugin.id)}`)
    else {
      ids.add(plugin.id)
      plugins.push(plugin)
    }
  }
  if (problems.length > 0) return { problems }
  return { manifest: { schemaVersion: 1, revision, plugins }, problems: [] }
}

/**
 * Read and validate the manifest file the environment names.
 * @param path Absolute manifest path, or undefined when the shell exported none.
 * @returns The manifest, or why it could not be read; an absent path is a plain empty manifest.
 */
export function readFeaturedManifest(path: string | undefined): { manifest?: FeaturedManifest; error?: string } {
  if (path === undefined || path === '') return {}
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    return { error: `cannot read ${path}: ${(error as Error).message}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { error: `${path} is not valid JSON: ${(error as Error).message}` }
  }
  const { manifest, problems } = parseFeaturedManifest(parsed)
  if (manifest === undefined) return { error: `${path}: ${problems.join('; ')}` }
  return { manifest }
}
