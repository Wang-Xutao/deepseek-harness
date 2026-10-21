/**
 * BAF featured-plugins host service.
 * @module @deepseek-ai/dsh-baf-featured
 */

export * from './types.ts'
export { FEATURED_MANIFEST_ENV, parseFeaturedManifest, readFeaturedManifest } from './manifest.ts'
// 【变更】2026-10-22 (批次十一 2): the imported-overlay seat the settings page's
// 导入/导出 drives.
export {
  FEATURED_OVERLAY_FILENAME, featuredOverlayPath, readFeaturedOverlay, writeFeaturedOverlay,
} from './overlay.ts'
export { VERSION_REGISTRIES, LOOKUP_TIMEOUT_MS, compareVersions, rangeSatisfies, fetchLatestVersion } from './registry.ts'
export { FEATURED_STATE_FILENAME, emptyFeaturedState, readFeaturedState, writeFeaturedState, type FeaturedState } from './state.ts'
export { FeaturedPlugins, type Config } from './service.ts'
import { FeaturedPlugins } from './service.ts'
export default FeaturedPlugins
