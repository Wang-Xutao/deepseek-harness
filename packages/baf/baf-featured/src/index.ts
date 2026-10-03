/**
 * BAF featured-plugins host service.
 * @module @deepseek-ai/dsh-baf-featured
 */

export * from './types.ts'
export { FEATURED_MANIFEST_ENV, parseFeaturedManifest, readFeaturedManifest } from './manifest.ts'
export { VERSION_REGISTRIES, LOOKUP_TIMEOUT_MS, compareVersions, rangeSatisfies, fetchLatestVersion } from './registry.ts'
export { FEATURED_STATE_FILENAME, emptyFeaturedState, readFeaturedState, writeFeaturedState, type FeaturedState } from './state.ts'
export { FeaturedPlugins, type Config } from './service.ts'
import { FeaturedPlugins } from './service.ts'
export default FeaturedPlugins
