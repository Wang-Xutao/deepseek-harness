/**
 * 【变更】2026-10-22 (批次十一 2): the person's imported featured-manifest
 * overlay — a `featured-manifest.json` under the dsh home that OVERRIDES the
 * shell-seeded manifest path. The settings page's 导出 writes what the
 * effective manifest is; 导入 validates a chosen file and persists it here,
 * so a hot-updated curated list survives restarts without touching the app's
 * packaged seed.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { readFeaturedManifest } from './manifest.ts'
import type { FeaturedManifest } from './types.ts'

/** File name of the imported overlay under the dsh home. */
export const FEATURED_OVERLAY_FILENAME = 'featured-manifest.json'

/** Absolute path of the overlay file, under the given home (dsh home by default). */
export function featuredOverlayPath(home: string = resolveDshHome()): string {
  return join(home, FEATURED_OVERLAY_FILENAME)
}

/**
 * Read the imported overlay, when one exists.
 * @param home Directory holding the overlay; the dsh home by default.
 * @returns The validated overlay, or why it could not be read; absent file is a plain empty answer.
 */
export function readFeaturedOverlay(home: string = resolveDshHome()): { manifest?: FeaturedManifest; error?: string } {
  const path = featuredOverlayPath(home)
  if (!existsSync(path)) return {}
  return readFeaturedManifest(path)
}

/**
 * Persist the overlay atomically, replacing any earlier import.
 * @param manifest The validated manifest to persist.
 * @param home Directory holding the overlay; the dsh home by default.
 */
export async function writeFeaturedOverlay(manifest: FeaturedManifest, home: string = resolveDshHome()): Promise<void> {
  await writeFileAtomic(featuredOverlayPath(home), `${JSON.stringify(manifest, undefined, 2)}\n`, { mode: 0o600 })
}
